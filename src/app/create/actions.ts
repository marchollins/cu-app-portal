"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createAppSchema } from "@/features/create-app/validation";
import { buildArchive } from "@/features/generation/build-archive";
import { deleteArtifact, saveArtifact } from "@/features/generation/storage";
import { bootstrapManagedRepository } from "@/features/repositories/bootstrap-managed-repository";
import {
  getActiveTemplateBySlug,
  serializeTemplateForStorage,
} from "@/features/templates/catalog";
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

  const hostingTargetField = template.fields.find(
    (field) => field.name === "hostingTarget" && field.type === "select",
  );

  if (!hostingTargetField) {
    throw new Error("Template is missing hosting target configuration.");
  }

  if (hostingTargetField.options.length === 0) {
    throw new Error("Template is missing hosting target options.");
  }

  const hostingTargets = hostingTargetField.options as [string, ...string[]];
  const parsed = createAppSchema(hostingTargets).parse(payload);

  return { ...parsed, templateSlug: payload.templateSlug };
}

export async function createAppAction(formData: FormData) {
  const input = await extractCreateAppInput(formData);
  const template = getActiveTemplateBySlug(input.templateSlug);

  if (!template) {
    throw new Error("Template not found.");
  }

  const persistedTemplate = await prisma.template.upsert({
    where: { slug: template.slug },
    update: serializeTemplateForStorage(template),
    create: serializeTemplateForStorage(template),
  });
  const userId = await resolveCurrentUserId();
  const supportReference = createSupportReference();
  const request = await prisma.appRequest.create({
    data: {
      userId,
      templateId: persistedTemplate.id,
      templateVersion: template.version,
      appName: input.appName,
      submittedConfig: input,
      generationStatus: "PENDING",
      supportReference,
      deploymentTarget: input.hostingTarget,
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "PENDING",
      publishStatus: "NOT_STARTED",
    },
  });
  let savedStoragePath: string | null = null;

  try {
    const archive = await buildArchive(input);
    const storagePath = await saveArtifact(archive.filename, archive.buffer);
    savedStoragePath = storagePath;

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

    await recordAuditEvent("REPOSITORY_BOOTSTRAP_REQUESTED", {
      requestId: request.id,
      supportReference,
    });

    try {
      const repository = await bootstrapManagedRepository({
        appRequestId: request.id,
        input,
        files: archive.files,
      });

      await prisma.appRequest.update({
        where: { id: request.id },
        data: {
          repositoryProvider: repository.provider,
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
          repositoryUrl: repository.url,
          repositoryDefaultBranch: repository.defaultBranch,
          repositoryVisibility: repository.visibility,
          repositoryStatus: "READY",
        },
      });

      await recordAuditEvent("REPOSITORY_BOOTSTRAP_SUCCEEDED", {
        requestId: request.id,
        supportReference,
        repositoryUrl: repository.url,
      });
    } catch (error) {
      await prisma.appRequest.update({
        where: { id: request.id },
        data: {
          repositoryStatus: "FAILED",
          publishErrorSummary:
            error instanceof Error ? error.message : "unknown",
        },
      });

      await recordAuditEvent("REPOSITORY_BOOTSTRAP_FAILED", {
        requestId: request.id,
        supportReference,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

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
    if (savedStoragePath) {
      await deleteArtifact(savedStoragePath);
    }

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
