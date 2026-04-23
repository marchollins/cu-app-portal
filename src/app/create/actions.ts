"use server";

import { redirect } from "next/navigation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { createAppSchema } from "@/features/create-app/validation";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";

export async function extractCreateAppInput(
  formData: FormData,
): Promise<CreateAppRequestInput> {
  const templateSlug = String(formData.get("templateSlug") ?? "").trim();
  const template = getActiveTemplateBySlug(templateSlug);

  if (!template) {
    throw new Error("Invalid template selection.");
  }

  const payload = {
    templateSlug: template.slug,
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
    hostingTarget: String(formData.get("hostingTarget") ?? ""),
  };

  const parsed = createAppSchema.parse(payload);

  return { ...parsed, templateSlug: payload.templateSlug };
}

export async function createAppAction(formData: FormData) {
  const input = await extractCreateAppInput(formData);
  redirect(`/download/pending?template=${encodeURIComponent(input.templateSlug)}`);
}
