"use server";

import { redirect } from "next/navigation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { createAppSchema } from "@/features/create-app/validation";

export async function extractCreateAppInput(
  formData: FormData,
): Promise<CreateAppRequestInput> {
  const payload = {
    templateSlug: String(formData.get("templateSlug") ?? ""),
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
    hostingTarget: String(formData.get("hostingTarget") ?? ""),
  };

  const parsed = createAppSchema.parse(payload);

  return { ...parsed, templateSlug: payload.templateSlug };
}

export async function createAppAction(formData: FormData) {
  const input = await extractCreateAppInput(formData);
  redirect(`/download/pending?template=${input.templateSlug}`);
}
