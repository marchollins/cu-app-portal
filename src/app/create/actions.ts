"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { createAppSchema } from "@/features/create-app/validation";
import { buildArchive } from "@/features/generation/build-archive";
import { saveArtifact } from "@/features/generation/storage";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createSupportReference } from "@/lib/support-reference";

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
  const template = getActiveTemplateBySlug(input.templateSlug);

  if (!template) {
    throw new Error("Template not found.");
  }

  const supportReference = createSupportReference();
  const request = await prisma.appRequest.create({
    data: {
      userId: "dev-user-placeholder",
      templateId: template.id,
      templateVersion: template.version,
      appName: input.appName,
      submittedConfig: input,
      generationStatus: "PENDING",
      supportReference,
      deploymentTarget: input.hostingTarget,
    },
  });

  try {
    const archive = await buildArchive(input);
    const storagePath = await saveArtifact(archive.filename, archive.buffer);

    await prisma.generatedArtifact.create({
      data: {
        appRequestId: request.id,
        storagePath,
        filename: archive.filename,
        checksum: createHash("sha256").update(archive.buffer).digest("hex"),
        contentType: "application/zip",
        sizeBytes: archive.buffer.byteLength,
      },
    });

    await prisma.appRequest.update({
      where: { id: request.id },
      data: { generationStatus: "SUCCEEDED" },
    });

    await recordAuditEvent("APP_REQUEST_SUCCEEDED", {
      requestId: request.id,
      supportReference,
    });

    redirect(`/download/${request.id}`);
  } catch (error) {
    await prisma.appRequest.update({
      where: { id: request.id },
      data: { generationStatus: "FAILED" },
    });

    await recordAuditEvent("APP_REQUEST_FAILED", {
      requestId: request.id,
      supportReference,
      error: error instanceof Error ? error.message : "unknown",
    });

    throw error;
  }
}
