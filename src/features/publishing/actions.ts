"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { runPublishAttempt } from "./run-publish-attempt";

type QueueablePublishStatus = "NOT_STARTED" | "SUCCEEDED" | "FAILED";

async function loadOwnedAppRequest(requestId: string) {
  const userId = await resolveCurrentUserId();
  const appRequest = await prisma.appRequest.findFirst({
    where: {
      id: requestId,
      userId,
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

function startPublishWorker(attemptId: string) {
  void runPublishAttempt(attemptId).catch((error) => {
    console.error("Publish worker failed after queueing.", error);
  });
}

async function queuePublishAttempt(
  requestId: string,
  allowedStatuses: QueueablePublishStatus[],
) {
  const appRequest = await loadOwnedAppRequest(requestId);

  if (appRequest.repositoryStatus !== "READY") {
    throw new Error("Managed repository is not ready for publishing.");
  }

  const attemptId = await prisma.$transaction(async (tx) => {
    const queuedRequest = await tx.appRequest.updateMany({
      where: {
        id: requestId,
        userId: appRequest.userId,
        repositoryStatus: "READY",
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
