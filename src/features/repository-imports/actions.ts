"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createSupportReference } from "@/lib/support-reference";
import { prepareImportedRepository } from "./prepare-repository";
import { parseGitHubRepositoryUrl } from "./repo-url";
import { isRepositoryInOrg } from "./target-name";

const addExistingAppSchema = z.object({
  repositoryUrl: z.string().min(1),
  appName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
});

const preparationModeSchema = z.enum(["DIRECT_COMMIT", "PULL_REQUEST"]);

type AddExistingAppDeps = {
  defaultOrg?: string;
  repository?: {
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
  };
};

type PrepareExistingAppDeps = {
  github?: Parameters<typeof prepareImportedRepository>[0]["github"];
};

type RepositoryImportWriteClient = Pick<
  typeof prisma,
  "appRequest" | "repositoryImport" | "template"
>;

async function upsertImportedTemplate(db: RepositoryImportWriteClient) {
  return db.template.upsert({
    where: { slug: "imported-web-app" },
    update: {
      slug: "imported-web-app",
      name: "Imported Web App",
      description:
        "Existing GitHub app prepared for Azure App Service publishing.",
      version: "1.0.0",
      status: "ACTIVE",
      inputSchema: {},
      hostingOptions: ["Azure App Service"],
    },
    create: {
      slug: "imported-web-app",
      name: "Imported Web App",
      description:
        "Existing GitHub app prepared for Azure App Service publishing.",
      version: "1.0.0",
      status: "ACTIVE",
      inputSchema: {},
      hostingOptions: ["Azure App Service"],
    },
  });
}

function resolveInstallationId(
  installationIdsByOrg: Record<string, string>,
  owner: string,
) {
  const installation = Object.entries(installationIdsByOrg).find(
    ([org]) => org.toLowerCase() === owner.toLowerCase(),
  );

  return installation?.[1] ?? null;
}

function createGitHubClientForOwner(owner: string) {
  const config = loadGitHubAppConfig();
  const installationId = resolveInstallationId(config.installationIdsByOrg, owner);

  if (!installationId) {
    throw new Error(
      `No GitHub App installation is configured for org "${owner}".`,
    );
  }

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId,
  });
}

async function resolveRepository(
  source: ReturnType<typeof parseGitHubRepositoryUrl>,
  deps: AddExistingAppDeps,
) {
  if (deps.repository) {
    return deps.repository;
  }

  return createGitHubClientForOwner(source.owner).getRepository({
    owner: source.owner,
    name: source.name,
  });
}

function summarizeError(error: unknown) {
  return error instanceof Error ? error.message : "unknown";
}

export async function addExistingAppAction(
  formData: FormData,
  deps: AddExistingAppDeps = {},
) {
  const parsed = addExistingAppSchema.parse({
    repositoryUrl: String(formData.get("repositoryUrl") ?? ""),
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  const userId = await resolveCurrentUserId();
  const source = parseGitHubRepositoryUrl(parsed.repositoryUrl);
  const defaultOrg = deps.defaultOrg ?? loadGitHubAppConfig().defaultOrg;
  const repository = await resolveRepository(source, deps);
  const supportReference = createSupportReference();
  const isSharedOrgRepo = isRepositoryInOrg(repository.owner, defaultOrg);
  const request = await prisma.$transaction(async (tx) => {
    const template = await upsertImportedTemplate(tx);
    const appRequest = await tx.appRequest.create({
      data: {
        userId,
        templateId: template.id,
        templateVersion: "1.0.0",
        appName: parsed.appName,
        submittedConfig: {
          repositoryUrl: source.normalizedUrl,
          description: parsed.description ?? "",
          hostingTarget: "Azure App Service",
        },
        generationStatus: "SUCCEEDED",
        supportReference,
        deploymentTarget: "Azure App Service",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryProvider: "GITHUB",
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        repositoryUrl: repository.url,
        repositoryDefaultBranch: repository.defaultBranch,
        repositoryVisibility: null,
        repositoryStatus: "READY",
        publishStatus: "NOT_STARTED",
      },
    });

    await tx.repositoryImport.create({
      data: {
        appRequestId: appRequest.id,
        sourceRepositoryUrl: source.normalizedUrl,
        sourceRepositoryOwner: source.owner,
        sourceRepositoryName: source.name,
        sourceRepositoryDefaultBranch: repository.defaultBranch,
        targetRepositoryOwner: repository.owner,
        targetRepositoryName: repository.name,
        targetRepositoryUrl: repository.url,
        targetRepositoryDefaultBranch: repository.defaultBranch,
        importStatus: isSharedOrgRepo ? "NOT_REQUIRED" : "PENDING",
        compatibilityStatus: "NOT_SCANNED",
        compatibilityFindings: [],
        preparationStatus: "PENDING_USER_CHOICE",
      },
    });

    return appRequest;
  });

  await recordAuditEvent("EXISTING_APP_ADD_REQUESTED", {
    requestId: request.id,
    supportReference,
    sourceRepositoryUrl: source.normalizedUrl,
    targetRepositoryUrl: repository.url,
  });

  revalidatePath("/apps");

  return { requestId: request.id };
}

function createDefaultPreparationGitHubClient(owner: string) {
  return createGitHubClientForOwner(owner);
}

export async function prepareExistingAppAction(
  requestId: string,
  formData: FormData,
  deps: PrepareExistingAppDeps = {},
) {
  const mode = preparationModeSchema.parse(formData.get("preparationMode"));
  const userId = await resolveCurrentUserId();
  const appRequest = await prisma.appRequest.findFirst({
    where: { id: requestId, userId },
    include: { repositoryImport: true },
  });

  if (
    !appRequest?.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch ||
    !appRequest.repositoryImport
  ) {
    throw new Error("Imported app repository is not ready for preparation.");
  }

  await prisma.repositoryImport.update({
    where: { id: appRequest.repositoryImport.id },
    data: {
      preparationMode: mode,
      preparationStatus: "RUNNING",
      preparationErrorSummary: null,
    },
  });

  try {
    const result = await prepareImportedRepository({
      appName: appRequest.appName,
      owner: appRequest.repositoryOwner,
      name: appRequest.repositoryName,
      defaultBranch: appRequest.repositoryDefaultBranch,
      mode,
      github:
        deps.github ?? createDefaultPreparationGitHubClient(appRequest.repositoryOwner),
    });

    await prisma.repositoryImport.update({
      where: { id: appRequest.repositoryImport.id },
      data: {
        preparationMode: mode,
        preparationStatus: result.status,
        preparationPullRequestUrl: result.pullRequestUrl,
        preparationErrorSummary: null,
      },
    });

    await recordAuditEvent(
      result.status === "COMMITTED"
        ? "REPOSITORY_PREPARATION_COMMITTED"
        : "REPOSITORY_PREPARATION_PR_OPENED",
      {
        requestId,
        pullRequestUrl: result.pullRequestUrl,
      },
    );
  } catch (error) {
    const message = summarizeError(error);

    await prisma.repositoryImport.update({
      where: { id: appRequest.repositoryImport.id },
      data: {
        preparationMode: mode,
        preparationStatus: "FAILED",
        preparationErrorSummary: message,
      },
    });

    await recordAuditEvent("REPOSITORY_PREPARATION_FAILED", {
      requestId,
      mode,
      targetRepository: `${appRequest.repositoryOwner}/${appRequest.repositoryName}`,
      error: message,
    });

    throw error;
  }

  revalidatePath("/apps");
}
