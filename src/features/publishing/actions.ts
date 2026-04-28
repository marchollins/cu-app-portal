"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

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

async function queuePublishAttempt(requestId: string) {
  const appRequest = await loadOwnedAppRequest(requestId);

  if (appRequest.repositoryStatus !== "READY") {
    throw new Error("Managed repository is not ready for publishing.");
  }

  const attempt = await prisma.publishAttempt.create({
    data: {
      appRequestId: requestId,
      status: "QUEUED",
      stage: "QUEUED",
    },
  });

  await prisma.appRequest.update({
    where: { id: requestId },
    data: {
      publishStatus: "QUEUED",
      publishErrorSummary: null,
    },
  });

  await recordAuditEvent("PUBLISH_REQUESTED", {
    requestId,
    publishAttemptId: attempt.id,
  });

  revalidatePath(`/download/${requestId}`);
  revalidatePath("/apps");
}

export async function publishToAzureAction(requestId: string) {
  await queuePublishAttempt(requestId);
}

export async function retryPublishAction(requestId: string) {
  const appRequest = await loadOwnedAppRequest(requestId);

  if (appRequest.publishStatus !== "FAILED") {
    throw new Error("Only failed publish attempts can be retried.");
  }

  await queuePublishAttempt(requestId);
}
