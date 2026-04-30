import type { PrismaClient } from "@prisma/client";

import type {
  DeploymentRun,
  ProvisionedPublishTarget,
  PublishRuntime,
  VerificationResult,
} from "../run-publish-attempt";
import type { AzurePublishConfig } from "./config";
import { buildPublishResourceTags, buildPublishTargetNames } from "./naming";
import { verifyPublishedUrl as defaultVerifyPublishedUrl } from "./verify-deployment";

type RuntimeDeps = {
  config: AzurePublishConfig;
  prisma: Pick<PrismaClient, "appRequest">;
  workflowRunPollAttempts?: number;
  workflowRunPollIntervalMs?: number;
  workflowCompletionPollAttempts?: number;
  workflowCompletionPollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  verifyPublishedUrl?: typeof defaultVerifyPublishedUrl;
  arm: {
    appServicePlanId(resourceGroup: string, name: string): string;
    putWebApp(input: {
      resourceGroup: string;
      name: string;
      location: string;
      appServicePlanId: string;
      runtimeStack: "NODE|24-lts";
      startupCommand: string;
      tags: Record<string, string>;
    }): Promise<{ properties?: { defaultHostName?: string } }>;
    putAppSettings(input: {
      resourceGroup: string;
      name: string;
      settings: Record<string, string>;
    }): Promise<void>;
    putPostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }): Promise<void>;
  };
  graph: {
    ensureRedirectUri(input: {
      applicationObjectId: string;
      redirectUri: string;
    }): Promise<void>;
    ensureFederatedCredential(input: {
      applicationAppId: string;
      name: string;
      repository: string;
      branch: string;
    }): Promise<void>;
  };
  github: {
    setActionsSecret(input: {
      owner: string;
      name: string;
      secretName: string;
      secretValue: string;
    }): Promise<void>;
    dispatchWorkflow(input: {
      owner: string;
      name: string;
      workflowFileName: string;
      ref: string;
    }): Promise<void>;
    getLatestWorkflowRun(input: {
      owner: string;
      name: string;
      workflowFileName: string;
      branch: string;
    }): Promise<{ id: string; url: string }>;
    getWorkflowRun(input: {
      owner: string;
      name: string;
      runId: string;
    }): Promise<{
      status: string;
      conclusion: string | null;
      url: string;
    }>;
  };
};

type PublishableAppRequest = {
  id: string;
  appName: string;
  userId: string;
  supportReference: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryDefaultBranch: string;
  repositoryStatus: "READY";
  primaryPublishUrl: string | null;
  template: { slug: string };
};

const WORKFLOW_FILE_NAME = "deploy-azure-app-service.yml";
const STARTUP_COMMAND = "npm run prisma:migrate:deploy && npm start";
const ENTRA_CALLBACK_PATH = "/api/auth/callback/microsoft-entra-id";
const DEFAULT_WORKFLOW_RUN_POLL_ATTEMPTS = 5;
const DEFAULT_WORKFLOW_RUN_POLL_INTERVAL_MS = 1000;
const DEFAULT_WORKFLOW_COMPLETION_POLL_ATTEMPTS = 30;
const DEFAULT_WORKFLOW_COMPLETION_POLL_INTERVAL_MS = 10_000;

async function loadPublishableRequest(
  deps: RuntimeDeps,
  appRequestId: string,
): Promise<PublishableAppRequest> {
  const appRequest = await deps.prisma.appRequest.findUnique({
    where: { id: appRequestId },
    include: { template: true },
  });

  if (
    !appRequest?.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch ||
    appRequest.repositoryStatus !== "READY"
  ) {
    throw new Error("Managed repository is not ready for Azure publishing.");
  }

  return {
    id: appRequest.id,
    appName: appRequest.appName,
    userId: appRequest.userId,
    supportReference: appRequest.supportReference,
    repositoryOwner: appRequest.repositoryOwner,
    repositoryName: appRequest.repositoryName,
    repositoryDefaultBranch: appRequest.repositoryDefaultBranch,
    repositoryStatus: appRequest.repositoryStatus,
    primaryPublishUrl: appRequest.primaryPublishUrl,
    template: { slug: appRequest.template.slug },
  };
}

function buildDatabaseUrl(config: AzurePublishConfig, databaseName: string) {
  const password = encodeURIComponent(config.postgresAdminPassword);

  return `postgresql://${config.postgresAdminUser}:${password}@${config.postgresServer}.postgres.database.azure.com:5432/${databaseName}?sslmode=require`;
}

function isEmptyWorkflowRunError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("No GitHub workflow runs found")
  );
}

async function defaultSleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAzurePublishRuntime(deps: RuntimeDeps): PublishRuntime {
  let lastDeploymentRun:
    | {
        owner: string;
        name: string;
        runId: string;
      }
    | null = null;

  function workflowRunPollingConfig() {
    return {
      attempts: deps.workflowRunPollAttempts ?? DEFAULT_WORKFLOW_RUN_POLL_ATTEMPTS,
      intervalMs:
        deps.workflowRunPollIntervalMs ?? DEFAULT_WORKFLOW_RUN_POLL_INTERVAL_MS,
      sleep: deps.sleep ?? defaultSleep,
    };
  }

  function workflowCompletionPollingConfig() {
    return {
      attempts:
        deps.workflowCompletionPollAttempts ??
        deps.workflowRunPollAttempts ??
        DEFAULT_WORKFLOW_COMPLETION_POLL_ATTEMPTS,
      intervalMs:
        deps.workflowCompletionPollIntervalMs ??
        deps.workflowRunPollIntervalMs ??
        DEFAULT_WORKFLOW_COMPLETION_POLL_INTERVAL_MS,
      sleep: deps.sleep ?? defaultSleep,
    };
  }

  async function getLatestWorkflowRunOrNull(input: {
    owner: string;
    name: string;
    workflowFileName: string;
    branch: string;
  }) {
    try {
      return await deps.github.getLatestWorkflowRun(input);
    } catch (error) {
      if (isEmptyWorkflowRunError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function waitForNewWorkflowRun(
    input: {
      owner: string;
      name: string;
      workflowFileName: string;
      branch: string;
    },
    previousRunId: string | null,
  ) {
    const { attempts, intervalMs, sleep } = workflowRunPollingConfig();

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let run: Awaited<ReturnType<typeof deps.github.getLatestWorkflowRun>>;

      try {
        run = await deps.github.getLatestWorkflowRun(input);
      } catch (error) {
        if (!isEmptyWorkflowRunError(error)) {
          throw error;
        }

        if (attempt < attempts - 1) {
          await sleep(intervalMs);
          continue;
        }

        throw new Error(
          `GitHub workflow dispatch did not produce a new run for ${input.owner}/${input.name} ${input.workflowFileName}.`,
        );
      }

      if (!previousRunId || run.id !== previousRunId) {
        return run;
      }

      if (attempt < attempts - 1) {
        await sleep(intervalMs);
      }
    }

    throw new Error(
      `GitHub workflow dispatch did not produce a new run for ${input.owner}/${input.name} ${input.workflowFileName}.`,
    );
  }

  async function waitForSuccessfulWorkflowRun(input: {
    owner: string;
    name: string;
    runId: string;
  }) {
    const { attempts, intervalMs, sleep } = workflowCompletionPollingConfig();

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const run = await deps.github.getWorkflowRun(input);

      if (run.status !== "completed") {
        if (attempt < attempts - 1) {
          await sleep(intervalMs);
          continue;
        }

        throw new Error(
          `Deployment workflow did not complete in time. Run id: ${input.runId}`,
        );
      }

      if (run.conclusion === "success") {
        return;
      }

      throw new Error(`Deployment workflow failed. See ${run.url}`);
    }

    throw new Error(
      `Deployment workflow did not complete in time. Run id: ${input.runId}`,
    );
  }

  return {
    async provisionInfrastructure(
      appRequestId: string,
    ): Promise<ProvisionedPublishTarget> {
      const appRequest = await loadPublishableRequest(deps, appRequestId);
      const names = buildPublishTargetNames({
        requestId: appRequest.id,
        appName: appRequest.appName,
      });
      const tags = buildPublishResourceTags({
        requestId: appRequest.id,
        appName: appRequest.appName,
        templateSlug: appRequest.template.slug,
        repositoryOwner: appRequest.repositoryOwner,
        repositoryName: appRequest.repositoryName,
        ownerUserId: appRequest.userId,
        supportReference: appRequest.supportReference,
      });

      await deps.arm.putPostgresDatabase({
        resourceGroup: deps.config.resourceGroup,
        serverName: deps.config.postgresServer,
        databaseName: names.databaseName,
      });

      const webApp = await deps.arm.putWebApp({
        resourceGroup: deps.config.resourceGroup,
        name: names.webAppName,
        location: deps.config.location,
        appServicePlanId: deps.arm.appServicePlanId(
          deps.config.resourceGroup,
          deps.config.appServicePlan,
        ),
        runtimeStack: deps.config.runtimeStack,
        startupCommand: STARTUP_COMMAND,
        tags,
      });
      const azureDefaultHostName =
        webApp.properties?.defaultHostName ?? names.azureDefaultHostName;
      const primaryPublishUrl = `https://${azureDefaultHostName}`;

      await deps.arm.putAppSettings({
        resourceGroup: deps.config.resourceGroup,
        name: names.webAppName,
        settings: {
          DATABASE_URL: buildDatabaseUrl(deps.config, names.databaseName),
          AUTH_URL: primaryPublishUrl,
          NEXTAUTH_URL: primaryPublishUrl,
          AUTH_SECRET: deps.config.authSecret,
          AUTH_MICROSOFT_ENTRA_ID_ID: deps.config.entraClientId,
          AUTH_MICROSOFT_ENTRA_ID_SECRET: deps.config.entraClientSecret,
          AUTH_MICROSOFT_ENTRA_ID_ISSUER: deps.config.entraIssuer,
          NODE_ENV: "production",
          SCM_DO_BUILD_DURING_DEPLOYMENT: "false",
          ENABLE_ORYX_BUILD: "false",
          WEBSITE_RUN_FROM_PACKAGE: "1",
        },
      });

      await deps.graph.ensureRedirectUri({
        applicationObjectId: deps.config.entraAppObjectId,
        redirectUri: `${primaryPublishUrl}${ENTRA_CALLBACK_PATH}`,
      });

      return {
        azureResourceGroup: deps.config.resourceGroup,
        azureAppServicePlan: deps.config.appServicePlan,
        azureWebAppName: names.webAppName,
        azurePostgresServer: deps.config.postgresServer,
        azureDatabaseName: names.databaseName,
        azureDefaultHostName,
        primaryPublishUrl,
      };
    },
    async deployRepository(appRequestId: string): Promise<DeploymentRun> {
      const appRequest = await loadPublishableRequest(deps, appRequestId);
      const names = buildPublishTargetNames({
        requestId: appRequest.id,
        appName: appRequest.appName,
      });
      const owner = appRequest.repositoryOwner;
      const name = appRequest.repositoryName;
      const branch = appRequest.repositoryDefaultBranch;
      const repository = `${owner}/${name}`;

      await deps.graph.ensureFederatedCredential({
        applicationAppId: deps.config.azureClientId,
        name: names.federatedCredentialName,
        repository,
        branch,
      });

      await deps.github.setActionsSecret({
        owner,
        name,
        secretName: "AZURE_CLIENT_ID",
        secretValue: deps.config.azureClientId,
      });
      await deps.github.setActionsSecret({
        owner,
        name,
        secretName: "AZURE_TENANT_ID",
        secretValue: deps.config.azureTenantId,
      });
      await deps.github.setActionsSecret({
        owner,
        name,
        secretName: "AZURE_SUBSCRIPTION_ID",
        secretValue: deps.config.azureSubscriptionId,
      });
      await deps.github.setActionsSecret({
        owner,
        name,
        secretName: "AZURE_WEBAPP_NAME",
        secretValue: names.webAppName,
      });

      const workflowRunInput = {
        owner,
        name,
        workflowFileName: WORKFLOW_FILE_NAME,
        branch,
      };
      const previousRun = await getLatestWorkflowRunOrNull(workflowRunInput);
      await deps.github.dispatchWorkflow({
        owner,
        name,
        workflowFileName: WORKFLOW_FILE_NAME,
        ref: branch,
      });
      const run = await waitForNewWorkflowRun(
        workflowRunInput,
        previousRun?.id ?? null,
      );
      lastDeploymentRun = { owner, name, runId: run.id };

      return {
        publishUrl: appRequest.primaryPublishUrl ?? names.primaryPublishUrl,
        githubWorkflowRunId: run.id,
        githubWorkflowRunUrl: run.url,
      };
    },
    async verifyDeployment(publishUrl: string): Promise<VerificationResult> {
      if (!lastDeploymentRun) {
        throw new Error(
          "Deployment verification requires a deployment workflow run.",
        );
      }

      await waitForSuccessfulWorkflowRun(lastDeploymentRun);

      const verifyPublishedUrl =
        deps.verifyPublishedUrl ?? defaultVerifyPublishedUrl;

      return verifyPublishedUrl(publishUrl);
    },
  };
}
