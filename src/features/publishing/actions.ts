"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { supportsPostSuccessPushToDeploy } from "./providers";
import { runPublishAttempt } from "./run-publish-attempt";
import {
  AZURE_DEPLOY_WORKFLOW_PATH,
  enablePushTriggerForAzureWorkflow,
} from "./workflow-triggers";

type QueueablePublishStatus = "NOT_STARTED" | "SUCCEEDED" | "FAILED";
type QueueablePublishingSetupStatus = "NOT_CHECKED" | "READY";

const BLOCKING_SETUP_STATUSES = new Set([
  "NEEDS_REPAIR",
  "REPAIRING",
  "BLOCKED",
]);
const GENERATED_APP_QUEUEABLE_SETUP_STATUSES: QueueablePublishingSetupStatus[] = [
  "NOT_CHECKED",
  "READY",
];

async function loadOwnedAppRequest(requestId: string) {
  const userId = await resolveCurrentUserId();
  const appRequest = await prisma.appRequest.findFirst({
    where: {
      id: requestId,
      userId,
    },
    include: {
      repositoryImport: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

async function recordPublishRequested({
  requestId,
  publishAttemptId,
}: {
  requestId: string;
  publishAttemptId: string;
}) {
  try {
    await recordAuditEvent("PUBLISH_REQUESTED", {
      requestId,
      publishAttemptId,
    });
  } catch (error) {
    console.error("Failed to record publish requested audit event.", error);
  }
}

function revalidatePublishViews(requestId: string) {
  try {
    revalidatePath(`/download/${requestId}`);
    revalidatePath("/apps");
  } catch (error) {
    console.error("Failed to revalidate publish views.", error);
  }
}

function logPublishWorker(event: string, details: Record<string, unknown>) {
  console.info("[publish-worker]", event, details);
}

function startPublishWorker(attemptId: string) {
  logPublishWorker("started", { publishAttemptId: attemptId });

  void runPublishAttempt(attemptId)
    .then(() => {
      logPublishWorker("completed", { publishAttemptId: attemptId });
    })
    .catch((error) => {
      console.error("[publish-worker]", "failed after queueing", {
        publishAttemptId: attemptId,
        error,
      });
    });
}

function createGitHubClientForOwner(owner: string) {
  const config = loadGitHubAppConfig();
  const installationId = config.installationIdsByOrg[owner];

  if (!installationId) {
    throw new Error(`No GitHub App installation is configured for org "${owner}".`);
  }

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId,
  });
}

function publishingSetupStatusPredicate(appRequest: {
  sourceOfTruth?: string | null;
}) {
  if (appRequest.sourceOfTruth === "IMPORTED_REPOSITORY") {
    return "READY";
  }

  return { in: GENERATED_APP_QUEUEABLE_SETUP_STATUSES };
}

async function queuePublishAttempt(
  requestId: string,
  allowedStatuses: QueueablePublishStatus[],
) {
  const appRequest = await loadOwnedAppRequest(requestId);

  if (appRequest.repositoryStatus !== "READY") {
    throw new Error("Managed repository is not ready for publishing.");
  }

  if (BLOCKING_SETUP_STATUSES.has(appRequest.publishingSetupStatus)) {
    throw new Error("Publishing setup must be repaired before publishing.");
  }

  if (
    appRequest.sourceOfTruth === "IMPORTED_REPOSITORY" &&
    appRequest.repositoryImport?.preparationStatus !== "COMMITTED"
  ) {
    throw new Error(
      "Imported app repository preparation must be committed before publishing.",
    );
  }

  if (
    appRequest.sourceOfTruth === "IMPORTED_REPOSITORY" &&
    appRequest.publishingSetupStatus !== "READY"
  ) {
    throw new Error(
      "Imported app publishing setup must be ready before publishing.",
    );
  }

  const attemptId = await prisma.$transaction(async (tx) => {
    const queuedRequest = await tx.appRequest.updateMany({
      where: {
        id: requestId,
        userId: appRequest.userId,
        repositoryStatus: "READY",
        publishingSetupStatus: publishingSetupStatusPredicate(appRequest),
        publishStatus: { in: allowedStatuses },
      },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });

    if (queuedRequest.count !== 1) {
      throw new Error("Publish request is already queued or running.");
    }

    const attempt = await tx.publishAttempt.create({
      data: {
        appRequestId: requestId,
        status: "QUEUED",
        stage: "QUEUED",
      },
    });

    return attempt.id;
  });

  await recordPublishRequested({
    requestId,
    publishAttemptId: attemptId,
  });

  logPublishWorker("queued", {
    requestId,
    publishAttemptId: attemptId,
  });

  revalidatePublishViews(requestId);

  return attemptId;
}

export async function publishToAzureAction(requestId: string) {
  const attemptId = await queuePublishAttempt(requestId, [
    "NOT_STARTED",
    "SUCCEEDED",
  ]);

  startPublishWorker(attemptId);
}

export async function retryPublishAction(requestId: string) {
  const appRequest = await loadOwnedAppRequest(requestId);

  if (appRequest.publishStatus !== "FAILED") {
    throw new Error("Only failed publish attempts can be retried.");
  }

  const attemptId = await queuePublishAttempt(requestId, ["FAILED"]);

  startPublishWorker(attemptId);
}

export async function enablePushToDeployAction(requestId: string) {
  const appRequest = await loadOwnedAppRequest(requestId);

  if (appRequest.sourceOfTruth !== "PORTAL_MANAGED_REPO") {
    throw new Error(
      "Push-to-deploy is only available for generated template apps.",
    );
  }

  if (appRequest.repositoryStatus !== "READY") {
    throw new Error("Managed repository is not ready for push-to-deploy.");
  }

  if (appRequest.publishStatus !== "SUCCEEDED") {
    throw new Error(
      "Push-to-deploy can only be enabled after a successful publish.",
    );
  }

  if (
    !appRequest.deploymentTarget ||
    !supportsPostSuccessPushToDeploy(appRequest.deploymentTarget)
  ) {
    throw new Error(
      `Push-to-deploy is not supported for ${
        appRequest.deploymentTarget ?? "this hosting target"
      }.`,
    );
  }

  if (
    !appRequest.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch
  ) {
    throw new Error("Managed repository metadata is incomplete.");
  }

  if (appRequest.deploymentTriggerMode === "PUSH_TO_DEPLOY") {
    return;
  }

  const owner = appRequest.repositoryOwner;
  const name = appRequest.repositoryName;
  const branch = appRequest.repositoryDefaultBranch;
  const github = createGitHubClientForOwner(owner);
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: branch,
    paths: [AZURE_DEPLOY_WORKFLOW_PATH],
  });
  const workflow = files[AZURE_DEPLOY_WORKFLOW_PATH];

  if (!workflow) {
    throw new Error("Deployment workflow was not found in the managed repository.");
  }

  const patched = enablePushTriggerForAzureWorkflow(workflow, branch);
  let commitSha: string | null = null;

  if (patched.changed) {
    const head = await github.getBranchHead({ owner, name, branch });
    const commit = await github.commitFiles({
      owner,
      name,
      branch,
      message: "Enable push-to-deploy",
      expectedHeadSha: head.sha,
      files: {
        [AZURE_DEPLOY_WORKFLOW_PATH]: patched.content,
      },
    });
    commitSha = commit.commitSha;
  }

  await prisma.appRequest.update({
    where: { id: requestId },
    data: {
      deploymentTriggerMode: "PUSH_TO_DEPLOY",
      publishErrorSummary: null,
    },
  });

  await recordAuditEvent("PUSH_TO_DEPLOY_ENABLED", {
    requestId,
    repository: `${owner}/${name}`,
    commitSha,
  });

  revalidatePublishViews(requestId);
}
