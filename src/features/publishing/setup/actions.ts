"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";
import { repairPublishingSetup } from "./service";

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

  await repairPublishingSetup(requestId);

  revalidatePath("/apps");
  revalidatePath(`/download/${requestId}`);
}
