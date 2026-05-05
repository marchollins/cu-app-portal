"use server";

import { revalidatePath } from "next/cache";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createAppSchema } from "@/features/create-app/validation";
import { buildArchive } from "@/features/generation/build-archive";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { grantManagedRepositoryAccess, parseGitHubUsername } from "./access";
import { bootstrapManagedRepository } from "./bootstrap-managed-repository";
import { getTemplateBySlug } from "@/features/templates/catalog";

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

async function loadOwnedUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Authenticated user not found.");
  }

  return user;
}

function parseStoredCreateAppInput(
  submittedConfig: unknown,
): CreateAppRequestInput {
  if (
    !submittedConfig ||
    typeof submittedConfig !== "object" ||
    !("templateSlug" in submittedConfig) ||
    typeof submittedConfig.templateSlug !== "string"
  ) {
    throw new Error("Stored app request configuration is invalid.");
  }

  const template = getTemplateBySlug(submittedConfig.templateSlug);

  if (!template) {
    throw new Error("Stored app request template is no longer available.");
  }

  const hostingTargetField = template.fields.find(
    (field) => field.name === "hostingTarget" && field.type === "select",
  );

  if (!hostingTargetField || hostingTargetField.options.length === 0) {
    throw new Error("Stored app request template is missing hosting targets.");
  }

  const hostingTargets = hostingTargetField.options as [string, ...string[]];
  const parsed = createAppSchema(hostingTargets).parse(submittedConfig);

  return {
    ...parsed,
    templateSlug: submittedConfig.templateSlug,
  };
}

export async function retryRepositoryBootstrapAction(requestId: string) {
  const appRequest = await loadOwnedAppRequest(requestId);
  const user = await loadOwnedUser(appRequest.userId);

  if (appRequest.repositoryStatus !== "FAILED") {
    throw new Error("Only failed repository bootstraps can be retried.");
  }

  const input = parseStoredCreateAppInput(appRequest.submittedConfig);
  const archive = await buildArchive(input);

  await prisma.appRequest.update({
    where: { id: requestId },
    data: {
      repositoryStatus: "PENDING",
      publishErrorSummary: null,
    },
  });

  await recordAuditEvent("REPOSITORY_BOOTSTRAP_REQUESTED", {
    requestId,
    supportReference: appRequest.supportReference,
    retried: true,
  });

  try {
    const repository = await bootstrapManagedRepository({
      appRequestId: requestId,
      input,
      files: archive.files,
      reuseExistingRepository: true,
    });

    await prisma.appRequest.update({
      where: { id: requestId },
      data: {
        repositoryProvider: repository.provider,
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        repositoryUrl: repository.url,
        repositoryDefaultBranch: repository.defaultBranch,
        repositoryVisibility: repository.visibility,
        repositoryStatus: "READY",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishErrorSummary: null,
      },
    });

    await recordAuditEvent("REPOSITORY_BOOTSTRAP_SUCCEEDED", {
      requestId,
      supportReference: appRequest.supportReference,
      repositoryUrl: repository.url,
      retried: true,
    });

    if (user.githubUsername) {
      await recordAuditEvent("REPOSITORY_ACCESS_REQUESTED", {
        requestId,
        supportReference: appRequest.supportReference,
        githubUsername: user.githubUsername,
        retried: true,
      });

      try {
        const accessResult = await grantManagedRepositoryAccess({
          owner: repository.owner,
          repositoryName: repository.name,
          githubUsername: user.githubUsername,
        });

        await prisma.appRequest.update({
          where: { id: requestId },
          data: {
            repositoryAccessStatus: accessResult.status,
            repositoryAccessNote:
              accessResult.status === "INVITED"
                ? `GitHub invited @${user.githubUsername} to this repository.`
                : `GitHub access is ready for @${user.githubUsername}.`,
          },
        });

        await recordAuditEvent("REPOSITORY_ACCESS_SUCCEEDED", {
          requestId,
          supportReference: appRequest.supportReference,
          githubUsername: user.githubUsername,
          accessStatus: accessResult.status,
          retried: true,
        });
      } catch (error) {
        console.error("Managed repository access grant failed", {
          requestId,
          supportReference: appRequest.supportReference,
          githubUsername: user.githubUsername,
          error,
        });

        await prisma.appRequest.update({
          where: { id: requestId },
          data: {
            repositoryAccessStatus: "FAILED",
            repositoryAccessNote:
              error instanceof Error ? error.message : "unknown",
          },
        });

        await recordAuditEvent("REPOSITORY_ACCESS_FAILED", {
          requestId,
          supportReference: appRequest.supportReference,
          githubUsername: user.githubUsername,
          error: error instanceof Error ? error.message : "unknown",
          retried: true,
        });
      }
    }
  } catch (error) {
    console.error("Managed repository bootstrap retry failed", {
      requestId,
      supportReference: appRequest.supportReference,
      error,
    });

    await prisma.appRequest.update({
      where: { id: requestId },
      data: {
        repositoryStatus: "FAILED",
        publishErrorSummary:
          error instanceof Error ? error.message : "unknown",
      },
    });

    await recordAuditEvent("REPOSITORY_BOOTSTRAP_FAILED", {
      requestId,
      supportReference: appRequest.supportReference,
      error: error instanceof Error ? error.message : "unknown",
      retried: true,
    });
  }

  revalidatePath(`/download/${requestId}`);
  revalidatePath("/apps");
}

export async function saveGitHubUsernameAndGrantAccessAction(
  requestId: string,
  formData: FormData,
) {
  const appRequest = await loadOwnedAppRequest(requestId);

  if (
    appRequest.repositoryStatus !== "READY" ||
    !appRequest.repositoryOwner ||
    !appRequest.repositoryName
  ) {
    throw new Error("Managed repository is not ready for GitHub access grants.");
  }

  const githubUsername = parseGitHubUsername(formData.get("githubUsername"));

  await prisma.user.update({
    where: { id: appRequest.userId },
    data: { githubUsername },
  });

  await prisma.appRequest.update({
    where: { id: requestId },
    data: {
      repositoryAccessStatus: "NOT_REQUESTED",
      repositoryAccessNote: null,
    },
  });

  await recordAuditEvent("REPOSITORY_ACCESS_REQUESTED", {
    requestId,
    supportReference: appRequest.supportReference,
    githubUsername,
    source: "portal-form",
  });

  try {
    const accessResult = await grantManagedRepositoryAccess({
      owner: appRequest.repositoryOwner,
      repositoryName: appRequest.repositoryName,
      githubUsername,
    });

    await prisma.appRequest.update({
      where: { id: requestId },
      data: {
        repositoryAccessStatus: accessResult.status,
        repositoryAccessNote:
          accessResult.status === "INVITED"
            ? `GitHub invited @${githubUsername} to this repository.`
            : `GitHub access is ready for @${githubUsername}.`,
      },
    });

    await recordAuditEvent("REPOSITORY_ACCESS_SUCCEEDED", {
      requestId,
      supportReference: appRequest.supportReference,
      githubUsername,
      accessStatus: accessResult.status,
      source: "portal-form",
    });
  } catch (error) {
    console.error("Managed repository access grant failed", {
      requestId,
      supportReference: appRequest.supportReference,
      githubUsername,
      error,
    });

    await prisma.appRequest.update({
      where: { id: requestId },
      data: {
        repositoryAccessStatus: "FAILED",
        repositoryAccessNote:
          error instanceof Error ? error.message : "unknown",
      },
    });

    await recordAuditEvent("REPOSITORY_ACCESS_FAILED", {
      requestId,
      supportReference: appRequest.supportReference,
      githubUsername,
      error: error instanceof Error ? error.message : "unknown",
      source: "portal-form",
    });
  }

  revalidatePath(`/download/${requestId}`);
  revalidatePath("/apps");
}
