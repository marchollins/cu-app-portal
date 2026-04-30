import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

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

const defaultRuntime: PublishRuntime = {
  async provisionInfrastructure() {
    throw new Error("Azure publish runtime is not configured yet.");
  },
  async deployRepository() {
    throw new Error("Azure publish runtime is not configured yet.");
  },
  async verifyDeployment() {
    throw new Error("Azure publish runtime is not configured yet.");
  },
};

export async function runPublishAttempt(
  attemptId: string,
  runtime: PublishRuntime = defaultRuntime,
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

  try {
    const publishTarget = await runtime.provisionInfrastructure(
      attempt.appRequestId,
    );

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

    const deployment = await runtime.deployRepository(attempt.appRequestId);

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

    const verification = await runtime.verifyDeployment(deployment.publishUrl);

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

    await recordAuditEvent("PUBLISH_SUCCEEDED", {
      requestId: attempt.appRequestId,
      publishAttemptId: attemptId,
      publishUrl: deployment.publishUrl,
    });
  } catch (error) {
    const errorSummary =
      error instanceof Error ? error.message : "Unknown publish error";
    const finishedAt = new Date();

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
