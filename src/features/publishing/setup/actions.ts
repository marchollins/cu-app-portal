"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";
import { repairPublishingSetup } from "./service";

function revalidatePublishingSetupViews(requestId: string) {
  for (const path of ["/apps", `/download/${requestId}`]) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("Failed to revalidate publishing setup view.", {
        path,
        error,
      });
    }
  }
}

export async function repairPublishingSetupAction(requestId: string) {
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

  try {
    await repairPublishingSetup(requestId);
  } finally {
    revalidatePublishingSetupViews(requestId);
  }
}
