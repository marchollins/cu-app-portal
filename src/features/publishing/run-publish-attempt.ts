import { DefaultAzureCredential } from "@azure/identity";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createAzureArmClient } from "./azure/arm-client";
import { loadAzurePublishConfig } from "./azure/config";
import { createMicrosoftGraphClient } from "./azure/graph-client";
import { createAzurePublishRuntime } from "./azure/runtime";

export type ProvisionedPublishTarget = {
  azureResourceGroup: string;
  azureAppServicePlan: string;
  azureWebAppName: string;
  azurePostgresServer: string;
  azureDatabaseName: string;
  azureDefaultHostName: string;
  primaryPublishUrl: string;
};

export type DeploymentRun = {
  publishUrl: string;
  githubWorkflowRunId: string;
  githubWorkflowRunUrl: string;
};

export type VerificationResult = {
  verifiedAt: Date;
};

export type PublishRuntime = {
  provisionInfrastructure: (
    appRequestId: string,
  ) => Promise<ProvisionedPublishTarget>;
  deployRepository: (appRequestId: string) => Promise<DeploymentRun>;
  verifyDeployment: (publishUrl: string) => Promise<VerificationResult>;
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

function createDefaultRuntime() {
  const config = loadAzurePublishConfig();
  const githubConfig = loadGitHubAppConfig();
  const installationId =
    githubConfig.installationIdsByOrg[githubConfig.defaultOrg];

  if (!installationId) {
    throw new Error(
      `No GitHub App installation is configured for org "${githubConfig.defaultOrg}".`,
    );
  }

  return createAzurePublishRuntime({
    config,
    prisma,
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
  });
}

function logPublishWorker(event: string, details: Record<string, unknown>) {
  console.info("[publish-worker]", event, details);
}

export async function runPublishAttempt(
  attemptId: string,
  runtime?: PublishRuntime,
) {
  const attempt = await prisma.publishAttempt.findUnique({
    where: { id: attemptId },
    include: {
      appRequest: true,
    },
  });

  if (!attempt) {
    throw new Error(`Publish attempt "${attemptId}" was not found.`);
  }

  await prisma.publishAttempt.update({
    where: { id: attemptId },
    data: {
      status: "RUNNING",
      stage: "PROVISIONING",
      startedAt: new Date(),
    },
  });

  await prisma.appRequest.update({
    where: { id: attempt.appRequestId },
    data: {
      publishStatus: "PROVISIONING",
      publishErrorSummary: null,
    },
  });

  logPublishWorker("started", {
    publishAttemptId: attemptId,
    requestId: attempt.appRequestId,
  });

  try {
    const effectiveRuntime = runtime ?? createDefaultRuntime();

    logPublishWorker("provisioning started", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
    });

    const publishTarget = await effectiveRuntime.provisionInfrastructure(
      attempt.appRequestId,
    );

    logPublishWorker("provisioning completed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      azureResourceGroup: publishTarget.azureResourceGroup,
      azureWebAppName: publishTarget.azureWebAppName,
      primaryPublishUrl: publishTarget.primaryPublishUrl,
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: publishTarget,
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        stage: "DEPLOYING",
      },
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: {
        publishStatus: "DEPLOYING",
      },
    });

    logPublishWorker("deployment started", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
    });

    const deployment = await effectiveRuntime.deployRepository(
      attempt.appRequestId,
    );

    logPublishWorker("deployment completed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      publishUrl: deployment.publishUrl,
      githubWorkflowRunId: deployment.githubWorkflowRunId,
      githubWorkflowRunUrl: deployment.githubWorkflowRunUrl,
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        githubWorkflowRunId: deployment.githubWorkflowRunId,
        githubWorkflowRunUrl: deployment.githubWorkflowRunUrl,
        deploymentStartedAt: new Date(),
      },
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        stage: "VERIFYING",
      },
    });

    logPublishWorker("verification started", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      publishUrl: deployment.publishUrl,
    });

    const verification = await effectiveRuntime.verifyDeployment(
      deployment.publishUrl,
    );

    logPublishWorker("verification completed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      verifiedAt: verification.verifiedAt,
    });

    const completedAt = new Date();

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        status: "SUCCEEDED",
        stage: "COMPLETED",
        finishedAt: completedAt,
        verifiedAt: verification.verifiedAt,
      },
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: {
        publishStatus: "SUCCEEDED",
        publishUrl: deployment.publishUrl,
        publishErrorSummary: null,
        lastPublishedAt: completedAt,
      },
    });

    logPublishWorker("succeeded", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      publishUrl: deployment.publishUrl,
    });

    await recordAuditEvent("PUBLISH_SUCCEEDED", {
      requestId: attempt.appRequestId,
      publishAttemptId: attemptId,
      publishUrl: deployment.publishUrl,
    });
  } catch (error) {
    const errorSummary =
      error instanceof Error ? error.message : "Unknown publish error";
    const finishedAt = new Date();

    console.error("[publish-worker]", "failed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      errorSummary,
      error,
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        status: "FAILED",
        stage: "FAILED",
        errorSummary,
        finishedAt,
      },
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: {
        publishStatus: "FAILED",
        publishErrorSummary: errorSummary,
      },
    });

    await recordAuditEvent("PUBLISH_FAILED", {
      requestId: attempt.appRequestId,
      publishAttemptId: attemptId,
      error: errorSummary,
    });

    throw error;
  }
}
