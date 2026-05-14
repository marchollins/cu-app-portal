import { DefaultAzureCredential } from "@azure/identity";
import type { PrismaClient } from "@prisma/client";

import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { createAzureArmClient } from "@/features/publishing/azure/arm-client";
import {
  type AzurePublishConfig,
  loadAzurePublishConfig,
} from "@/features/publishing/azure/config";
import { createMicrosoftGraphClient } from "@/features/publishing/azure/graph-client";
import {
  buildPublishResourceTags,
  buildPublishTargetNames,
} from "@/features/publishing/azure/naming";
import { prisma } from "@/lib/db";
import { persistPublishingSetupChecks } from "./checks";
import {
  classifyPublishingSetupError,
  summarizePublishingSetupChecks,
  type PublishingSetupCheckKey,
  type PublishingSetupCheckResult,
} from "./status";

const WORKFLOW_PATH = ".github/workflows/deploy-azure-app-service.yml";
const STARTUP_COMMAND = "npm start";
const ENTRA_CALLBACK_PATH = "/api/auth/callback/microsoft-entra-id";
const REQUIRED_PORTAL_MANAGED_SECRETS = [
  "AZURE_CLIENT_ID",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_WEBAPP_NAME",
] as const;
const REQUIRED_PORTAL_MANAGED_APP_SETTINGS = [
  "DATABASE_URL",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "AUTH_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
  "NODE_ENV",
  "SCM_DO_BUILD_DURING_DEPLOYMENT",
  "ENABLE_ORYX_BUILD",
  "WEBSITE_RUN_FROM_PACKAGE",
] as const;

type SetupDb = Pick<
  PrismaClient,
  "$transaction" | "appRequest" | "publishSetupCheck"
>;

type SetupAppRequest = {
  id: string;
  appName: string;
  userId: string;
  supportReference: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
  repositoryDefaultBranch: string | null;
  repositoryStatus: string;
  primaryPublishUrl: string | null;
  template: { slug: string };
};

export type PublishingSetupServiceDeps = {
  config: AzurePublishConfig;
  prisma?: SetupDb;
  arm: {
    appServicePlanId(resourceGroup: string, name: string): string;
    getAppSettings(input: {
      resourceGroup: string;
      name: string;
    }): Promise<{ exists: boolean; settings: Record<string, string> }>;
    putPostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }): Promise<void>;
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
  };
  graph: {
    hasRedirectUri(input: {
      applicationObjectId: string;
      redirectUri: string;
    }): Promise<{ exists: boolean }>;
    ensureRedirectUri(input: {
      applicationObjectId: string;
      redirectUri: string;
    }): Promise<void>;
    listFederatedCredentials(input: {
      applicationAppId: string;
    }): Promise<Array<{ id: string; name: string; subject?: string }>>;
    replaceFederatedCredential(input: {
      applicationAppId: string;
      name: string;
      repository: string;
      branch: string;
    }): Promise<void>;
  };
  github: {
    readRepositoryTextFiles(input: {
      owner: string;
      name: string;
      ref: string;
      paths: string[];
    }): Promise<Record<string, string>>;
    getActionsSecret(input: {
      owner: string;
      name: string;
      secretName: string;
    }): Promise<{ exists: boolean }>;
    deleteActionsSecret(input: {
      owner: string;
      name: string;
      secretName: string;
    }): Promise<void>;
    setActionsSecret(input: {
      owner: string;
      name: string;
      secretName: string;
      secretValue: string;
    }): Promise<void>;
  };
};

function createAzureTokenProvider(scope: string) {
  const credential = new DefaultAzureCredential();

  return async () => {
    const token = await credential.getToken(scope);

    if (!token?.token) {
      throw new Error(`Azure token was not available for scope ${scope}.`);
    }

    return token.token;
  };
}

function createDefaultSetupDeps(): PublishingSetupServiceDeps {
  const config = loadAzurePublishConfig();
  const githubConfig = loadGitHubAppConfig();
  const installationId =
    githubConfig.installationIdsByOrg[githubConfig.defaultOrg];

  if (!installationId) {
    throw new Error(
      `No GitHub App installation is configured for org "${githubConfig.defaultOrg}".`,
    );
  }

  return {
    config,
    arm: createAzureArmClient({
      subscriptionId: config.azureSubscriptionId,
      tokenProvider: createAzureTokenProvider(
        "https://management.azure.com/.default",
      ),
    }),
    graph: createMicrosoftGraphClient({
      tokenProvider: createAzureTokenProvider(
        "https://graph.microsoft.com/.default",
      ),
    }),
    github: createGitHubAppClient({
      appId: githubConfig.appId,
      privateKey: githubConfig.privateKey,
      installationId,
    }),
  };
}

async function loadSetupRequest(
  appRequestId: string,
  db: SetupDb,
): Promise<SetupAppRequest> {
  const appRequest = await db.appRequest.findUnique({
    where: { id: appRequestId },
    include: { template: true },
  });

  if (
    !appRequest?.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch ||
    appRequest.repositoryStatus !== "READY"
  ) {
    throw new Error("Managed repository is not ready for publishing setup.");
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

function targetNames(appRequest: SetupAppRequest) {
  return buildPublishTargetNames({
    requestId: appRequest.id,
    appName: appRequest.appName,
  });
}

function repository(appRequest: SetupAppRequest) {
  if (
    !appRequest.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch
  ) {
    throw new Error("Managed repository is not ready for publishing setup.");
  }

  return {
    owner: appRequest.repositoryOwner,
    name: appRequest.repositoryName,
    branch: appRequest.repositoryDefaultBranch,
    fullName: `${appRequest.repositoryOwner}/${appRequest.repositoryName}`,
  };
}

function publishUrlFor(appRequest: SetupAppRequest) {
  return appRequest.primaryPublishUrl ?? targetNames(appRequest).primaryPublishUrl;
}

function federatedCredentialName(appRequest: SetupAppRequest) {
  return targetNames(appRequest).federatedCredentialName;
}

function federatedCredentialSubject({
  repositoryFullName,
  branch,
}: {
  repositoryFullName: string;
  branch: string;
}) {
  return `repo:${repositoryFullName}:ref:refs/heads/${branch}`;
}

function buildDatabaseUrl(config: AzurePublishConfig, databaseName: string) {
  const password = encodeURIComponent(config.postgresAdminPassword);

  return `postgresql://${config.postgresAdminUser}:${password}@${config.postgresServer}.postgres.database.azure.com:5432/${databaseName}?sslmode=require`;
}

function buildSecretValues(config: AzurePublishConfig, webAppName: string) {
  return {
    AZURE_CLIENT_ID: config.azureClientId,
    AZURE_TENANT_ID: config.azureTenantId,
    AZURE_SUBSCRIPTION_ID: config.azureSubscriptionId,
    AZURE_WEBAPP_NAME: webAppName,
  };
}

function pass(
  checkKey: PublishingSetupCheckKey,
  message: string,
  metadata: Record<string, unknown> = {},
): PublishingSetupCheckResult {
  return { checkKey, status: "PASS", message, metadata };
}

function warn(
  checkKey: PublishingSetupCheckKey,
  message: string,
  metadata: Record<string, unknown> = {},
): PublishingSetupCheckResult {
  return { checkKey, status: "WARN", message, metadata };
}

function fail(
  checkKey: PublishingSetupCheckKey,
  message: string,
  metadata: Record<string, unknown> = {},
): PublishingSetupCheckResult {
  return { checkKey, status: "FAIL", message, metadata };
}

function unknown(
  checkKey: PublishingSetupCheckKey,
  message: string,
  metadata: Record<string, unknown> = {},
): PublishingSetupCheckResult {
  return { checkKey, status: "UNKNOWN", message, metadata };
}

async function recordChecks({
  appRequestId,
  checks,
  db,
}: {
  appRequestId: string;
  checks: PublishingSetupCheckResult[];
  db: SetupDb;
}) {
  const checkedAt = new Date();
  const summary = summarizePublishingSetupChecks(checks);

  const updateStatusOperation = db.appRequest.update({
    where: { id: appRequestId },
    data: {
      publishingSetupStatus: summary.setupStatus,
      publishingSetupCheckedAt: checkedAt,
      publishingSetupErrorSummary: summary.errorSummary,
    },
  });

  await persistPublishingSetupChecks({
    prisma: db,
    appRequestId,
    checks,
    checkedAt,
    additionalOperations: [updateStatusOperation],
  });

  return {
    checks,
    ...summary,
  };
}

async function checkWorkflowFile({
  deps,
  owner,
  name,
  branch,
}: {
  deps: PublishingSetupServiceDeps;
  owner: string;
  name: string;
  branch: string;
}) {
  const files = await deps.github.readRepositoryTextFiles({
    owner,
    name,
    ref: branch,
    paths: [WORKFLOW_PATH],
  });

  const workflow = files[WORKFLOW_PATH] ?? null;

  return {
    workflow,
    check: workflow
      ? pass("github_workflow_file", "Deployment workflow exists.", {
          workflowPath: WORKFLOW_PATH,
          branch,
        })
      : fail("github_workflow_file", "Deployment workflow is missing.", {
          workflowPath: WORKFLOW_PATH,
          branch,
          repairable: false,
        }),
  };
}

async function checkActionsSecrets({
  deps,
  owner,
  name,
}: {
  deps: PublishingSetupServiceDeps;
  owner: string;
  name: string;
}) {
  const secretChecks = await Promise.all(
    REQUIRED_PORTAL_MANAGED_SECRETS.map((secretName) =>
      deps.github.getActionsSecret({ owner, name, secretName }),
    ),
  );
  const missingSecretNames = REQUIRED_PORTAL_MANAGED_SECRETS.filter(
    (_secretName, index) => !secretChecks[index].exists,
  );

  if (missingSecretNames.length === 0) {
    return pass(
      "github_actions_secrets",
      "Required GitHub Actions secrets are present.",
      { secretNames: [...REQUIRED_PORTAL_MANAGED_SECRETS] },
    );
  }

  return fail(
    "github_actions_secrets",
    "Required GitHub Actions secrets are missing.",
    { missingSecretNames, repairable: true },
  );
}

function requiredAppSettings() {
  return [...REQUIRED_PORTAL_MANAGED_APP_SETTINGS];
}

function isAzureArmForbidden(error: unknown) {
  return (
    error instanceof Error && error.message.includes("Azure ARM request failed: 403")
  );
}

async function checkAzureAppSettings({
  deps,
  webAppName,
}: {
  deps: PublishingSetupServiceDeps;
  webAppName: string;
}) {
  try {
    const appSettings = await deps.arm.getAppSettings({
      resourceGroup: deps.config.resourceGroup,
      name: webAppName,
    });

    if (!appSettings.exists) {
      return fail("azure_app_settings", "Azure App Service is missing.", {
        webAppName,
        repairable: true,
      });
    }

    const missingSettingNames = requiredAppSettings().filter(
      (settingName) => !(settingName in appSettings.settings),
    );

    if (missingSettingNames.length > 0) {
      return fail(
        "azure_app_settings",
        "Required Azure App Service settings are missing.",
        { webAppName, missingSettingNames, repairable: true },
      );
    }

    return pass(
      "azure_app_settings",
      "Required Azure App Service settings are present.",
      { webAppName, settingNames: requiredAppSettings() },
    );
  } catch (error) {
    if (!isAzureArmForbidden(error)) {
      return unknown(
        "azure_app_settings",
        "Azure App Service settings could not be read.",
        { webAppName, repairable: true },
      );
    }

    return fail(
      "azure_app_settings",
      "Azure App Service settings could not be read.",
      {
        webAppName,
        repairable: false,
        statusCode: 403,
      },
    );
  }
}

function checkWorkflowDispatch({
  workflow,
  branch,
}: {
  workflow: string | null;
  branch: string;
}) {
  if (workflow && hasTopLevelWorkflowDispatchTrigger(workflow)) {
    return pass(
      "github_workflow_dispatch",
      "Workflow dispatch can be attempted from the default branch.",
      { workflowPath: WORKFLOW_PATH, branch },
    );
  }

  return unknown(
    "github_workflow_dispatch",
    "Workflow dispatch readiness could not be verified.",
    { workflowPath: WORKFLOW_PATH, branch, repairable: true },
  );
}

function countIndent(line: string) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function stripYamlComment(line: string) {
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if ((char === "'" || char === '"') && previous !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }

    if (char === "#" && !quote && (index === 0 || /\s/.test(previous))) {
      return line.slice(0, index);
    }
  }

  return line;
}

function inlineOnValueHasWorkflowDispatch(value: string) {
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["']|["']$/g, "");

  if (unquoted === "workflow_dispatch") {
    return true;
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .some(
        (item) =>
          item.trim().replace(/^["']|["']$/g, "") === "workflow_dispatch",
      );
  }

  return false;
}

function directOnChildIsWorkflowDispatch(trimmed: string) {
  const item = trimmed.replace(/^-\s*/, "").replace(/\s*:\s*$/, "");

  return item.replace(/^["']|["']$/g, "") === "workflow_dispatch";
}

function hasTopLevelWorkflowDispatchTrigger(workflow: string) {
  const lines = workflow.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripYamlComment(lines[index]);

    if (!line.trim()) {
      continue;
    }

    if (countIndent(line) !== 0) {
      continue;
    }

    const onMatch = line.match(/^(?:"on"|'on'|on)\s*:\s*(.*)$/);

    if (!onMatch) {
      continue;
    }

    if (inlineOnValueHasWorkflowDispatch(onMatch[1])) {
      return true;
    }

    if (onMatch[1].trim()) {
      return false;
    }

    let directChildIndent: number | null = null;

    for (let nestedIndex = index + 1; nestedIndex < lines.length; nestedIndex += 1) {
      const nestedLine = stripYamlComment(lines[nestedIndex]);
      const trimmed = nestedLine.trim();

      if (!trimmed) {
        continue;
      }

      const indent = countIndent(nestedLine);

      if (indent === 0) {
        return false;
      }

      directChildIndent ??= indent;

      if (indent < directChildIndent) {
        return false;
      }

      if (indent > directChildIndent) {
        continue;
      }

      if (directOnChildIsWorkflowDispatch(trimmed)) {
        return true;
      }
    }

    return false;
  }

  return false;
}

async function runPreflightChecks(
  appRequest: SetupAppRequest,
  deps: PublishingSetupServiceDeps,
) {
  const repo = repository(appRequest);
  const names = targetNames(appRequest);
  const redirectUri = `${publishUrlFor(appRequest)}${ENTRA_CALLBACK_PATH}`;
  const expectedSubject = federatedCredentialSubject({
    repositoryFullName: repo.fullName,
    branch: repo.branch,
  });
  const checks: PublishingSetupCheckResult[] = [];

  const workflowFile = await checkWorkflowFile({
    deps,
    owner: repo.owner,
    name: repo.name,
    branch: repo.branch,
  });

  checks.push(workflowFile.check);
  checks.push(
    await checkActionsSecrets({
      deps,
      owner: repo.owner,
      name: repo.name,
    }),
  );

  const redirect = await deps.graph.hasRedirectUri({
    applicationObjectId: deps.config.entraAppObjectId,
    redirectUri,
  });
  checks.push(
    redirect.exists
      ? pass("entra_redirect_uri", "Entra redirect URI is registered.", {
          redirectUri,
        })
      : fail("entra_redirect_uri", "Entra redirect URI is missing.", {
          redirectUri,
          repairable: true,
        }),
  );

  const credentials = await deps.graph.listFederatedCredentials({
    applicationAppId: deps.config.azureClientId,
  });
  const credentialName = federatedCredentialName(appRequest);
  const credential = credentials.find(
    (item) => item.name === credentialName && item.subject === expectedSubject,
  );
  checks.push(
    credential
      ? pass(
          "github_federated_credential",
          "GitHub OIDC federated credential is present.",
          { credentialName, subject: expectedSubject },
        )
      : fail(
          "github_federated_credential",
          "GitHub OIDC federated credential is missing or stale.",
          { credentialName, subject: expectedSubject, repairable: true },
        ),
  );

  checks.push(
    pass("azure_resource_access", "Azure target names can be derived.", {
      resourceGroup: deps.config.resourceGroup,
      webAppName: names.webAppName,
      databaseName: names.databaseName,
    }),
  );
  checks.push(
    await checkAzureAppSettings({ deps, webAppName: names.webAppName }),
  );
  checks.push(
    checkWorkflowDispatch({ workflow: workflowFile.workflow, branch: repo.branch }),
  );

  return checks;
}

export async function preflightPublishingSetup(
  appRequestId: string,
  providedDeps?: PublishingSetupServiceDeps,
) {
  const deps = providedDeps ?? createDefaultSetupDeps();
  const db = deps.prisma ?? prisma;
  const appRequest = await loadSetupRequest(appRequestId, db);
  const checks = await runPreflightChecks(appRequest, deps);

  return recordChecks({ appRequestId, checks, db });
}

export async function repairPublishingSetup(
  appRequestId: string,
  providedDeps?: PublishingSetupServiceDeps,
) {
  const deps = providedDeps ?? createDefaultSetupDeps();
  const db = deps.prisma ?? prisma;
  const appRequest = await loadSetupRequest(appRequestId, db);
  const repo = repository(appRequest);
  const names = targetNames(appRequest);
  let repairStep: PublishingSetupCheckKey = "azure_resource_access";

  await db.appRequest.update({
    where: { id: appRequestId },
    data: {
      publishingSetupStatus: "REPAIRING",
      publishingSetupErrorSummary: null,
    },
  });

  try {
    repairStep = "azure_resource_access";
    await deps.arm.putPostgresDatabase({
      resourceGroup: deps.config.resourceGroup,
      serverName: deps.config.postgresServer,
      databaseName: names.databaseName,
    });

    repairStep = "azure_resource_access";
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
      tags: buildPublishResourceTags({
        requestId: appRequest.id,
        appName: appRequest.appName,
        templateSlug: appRequest.template.slug,
        repositoryOwner: repo.owner,
        repositoryName: repo.name,
        ownerUserId: appRequest.userId,
        supportReference: appRequest.supportReference,
      }),
    });
    const azureDefaultHostName =
      webApp.properties?.defaultHostName ?? names.azureDefaultHostName;
    const azurePublishUrl = `https://${azureDefaultHostName}`;
    const effectivePublishUrl = appRequest.primaryPublishUrl ?? azurePublishUrl;

    repairStep = "azure_app_settings";
    const existingAppSettings = await deps.arm.getAppSettings({
      resourceGroup: deps.config.resourceGroup,
      name: names.webAppName,
    });
    await deps.arm.putAppSettings({
      resourceGroup: deps.config.resourceGroup,
      name: names.webAppName,
      settings: {
        ...(existingAppSettings.exists ? existingAppSettings.settings : {}),
        DATABASE_URL: buildDatabaseUrl(deps.config, names.databaseName),
        AUTH_URL: effectivePublishUrl,
        NEXTAUTH_URL: effectivePublishUrl,
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

    repairStep = "entra_redirect_uri";
    await deps.graph.ensureRedirectUri({
      applicationObjectId: deps.config.entraAppObjectId,
      redirectUri: `${effectivePublishUrl}${ENTRA_CALLBACK_PATH}`,
    });
    repairStep = "github_federated_credential";
    await deps.graph.replaceFederatedCredential({
      applicationAppId: deps.config.azureClientId,
      name: federatedCredentialName(appRequest),
      repository: repo.fullName,
      branch: repo.branch,
    });

    const secretValues = buildSecretValues(deps.config, names.webAppName);

    repairStep = "github_actions_secrets";
    for (const secretName of REQUIRED_PORTAL_MANAGED_SECRETS) {
      await deps.github.deleteActionsSecret({
        owner: repo.owner,
        name: repo.name,
        secretName,
      });
      await deps.github.setActionsSecret({
        owner: repo.owner,
        name: repo.name,
        secretName,
        secretValue: secretValues[secretName],
      });
    }

    await db.appRequest.update({
      where: { id: appRequestId },
      data: {
        azureResourceGroup: deps.config.resourceGroup,
        azureAppServicePlan: deps.config.appServicePlan,
        azureWebAppName: names.webAppName,
        azurePostgresServer: deps.config.postgresServer,
        azureDatabaseName: names.databaseName,
        azureDefaultHostName,
        primaryPublishUrl: effectivePublishUrl,
        publishingSetupRepairedAt: new Date(),
      },
    });

    return preflightPublishingSetup(appRequestId, deps);
  } catch (error) {
    const classification = classifyPublishingSetupError({
      step: repairStep,
      error,
      repairWasReplacingPortalManagedCredential:
        repairStep === "github_federated_credential",
    });

    await db.appRequest.update({
      where: { id: appRequestId },
      data: {
        publishingSetupStatus: classification.setupStatus,
        publishingSetupErrorSummary: classification.summary,
      },
    });

    throw error;
  }
}
