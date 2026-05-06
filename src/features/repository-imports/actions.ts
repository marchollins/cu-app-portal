"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createSupportReference } from "@/lib/support-reference";
import { importRepositoryWithHistory } from "./import-repository";
import { prepareImportedRepository } from "./prepare-repository";
import { verifyImportedPublishReadiness } from "./publish-readiness";
import { parseGitHubRepositoryUrl } from "./repo-url";
import { buildSharedOrgTargetName, isRepositoryInOrg } from "./target-name";

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
  publicRepositoryFetch?: typeof fetch;
  importRepository?: typeof importRepositoryWithHistory;
};

type PrepareExistingAppDeps = {
  github?: Parameters<typeof prepareImportedRepository>[0]["github"];
};

type VerifyExistingAppPreparationDeps = {
  github?: Parameters<typeof verifyImportedPublishReadiness>[0]["github"];
};

type RepositoryImportWriteClient = Pick<
  typeof prisma,
  "appRequest" | "repositoryImport" | "template"
>;

type RepositoryMetadata = {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
};

type ResolvedRepository = {
  repository: RepositoryMetadata;
  github?: ReturnType<typeof createGitHubAppClient>;
};

type GitHubPublicRepositoryResponse = {
  html_url: string;
  default_branch: string;
  name: string;
  owner: {
    login: string;
  };
};

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

function createGitHubClientForOwner(
  owner: string,
  config = loadGitHubAppConfig(),
) {
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

function tryCreateGitHubClientForOwner(
  owner: string,
  config: ReturnType<typeof loadGitHubAppConfig>,
) {
  const installationId = resolveInstallationId(config.installationIdsByOrg, owner);

  if (!installationId) {
    return null;
  }

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId,
  });
}

async function fetchPublicRepositoryMetadata(
  source: ReturnType<typeof parseGitHubRepositoryUrl>,
  fetchImpl: typeof fetch,
): Promise<RepositoryMetadata> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.name)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  const responseText = await response.text();
  const data = responseText
    ? (JSON.parse(responseText) as GitHubPublicRepositoryResponse)
    : null;

  if (!response.ok || !data) {
    throw new Error(
      `GitHub public repository metadata lookup failed: ${response.status} ${response.statusText}`.trim(),
    );
  }

  return {
    owner: data.owner.login,
    name: data.name,
    url: data.html_url,
    defaultBranch: data.default_branch,
  };
}

async function resolveRepository(
  source: ReturnType<typeof parseGitHubRepositoryUrl>,
  deps: AddExistingAppDeps,
  config: ReturnType<typeof loadGitHubAppConfig>,
): Promise<ResolvedRepository> {
  if (deps.repository) {
    return { repository: deps.repository };
  }

  const sourceGithub = tryCreateGitHubClientForOwner(source.owner, config);

  if (sourceGithub) {
    try {
      return {
        repository: await sourceGithub.getRepository({
          owner: source.owner,
          name: source.name,
        }),
        github: sourceGithub,
      };
    } catch {
      // Public metadata fallback below intentionally avoids leaking private lookup details.
    }
  }

  return {
    repository: await fetchPublicRepositoryMetadata(
      source,
      deps.publicRepositoryFetch ?? fetch,
    ),
  };
}

function summarizeError(error: unknown) {
  return error instanceof Error ? error.message : "unknown";
}

function getFailedTargetRepository({
  error,
  fallback,
}: {
  error: unknown;
  fallback: RepositoryMetadata;
}) {
  if (
    error instanceof Error &&
    "targetRepository" in error &&
    error.targetRepository &&
    typeof error.targetRepository === "object"
  ) {
    return error.targetRepository as RepositoryMetadata;
  }

  return fallback;
}

function isTargetNameCollision(error: unknown) {
  return (
    error instanceof Error &&
      "code" in error &&
      error.code === "TARGET_REPOSITORY_ALREADY_EXISTS"
  );
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
  const githubConfig = loadGitHubAppConfig();
  const defaultOrg = deps.defaultOrg ?? githubConfig.defaultOrg;
  const repositoryVisibility = githubConfig.defaultRepoVisibility;
  const { repository, github: sourceGithub } = await resolveRepository(
    source,
    deps,
    githubConfig,
  );
  const supportReference = createSupportReference();
  const isSharedOrgRepo = isRepositoryInOrg(repository.owner, defaultOrg);
  let targetName = isSharedOrgRepo
    ? repository.name
    : buildSharedOrgTargetName({
        sourceName: repository.name,
        existingNames: [],
      });
  let targetRepository = repository;
  let repositoryStatus: "READY" | "FAILED" = "READY";
  let importStatus: "NOT_REQUIRED" | "SUCCEEDED" | "FAILED" = isSharedOrgRepo
    ? "NOT_REQUIRED"
    : "SUCCEEDED";
  let importErrorSummary: string | null = null;
  let preparationStatus: "PENDING_USER_CHOICE" | "BLOCKED" =
    "PENDING_USER_CHOICE";
  let publishErrorSummary: string | null = null;

  if (!isSharedOrgRepo) {
    const targetGithub = createGitHubClientForOwner(defaultOrg, githubConfig);
    const existingNames: string[] = [];
    let importSucceeded = false;

    try {
      for (let attempt = 0; attempt < 99; attempt += 1) {
        targetName = buildSharedOrgTargetName({
          sourceName: repository.name,
          existingNames,
        });

        try {
          targetRepository = await (deps.importRepository ?? importRepositoryWithHistory)({
            source: repository,
            target: {
              owner: defaultOrg,
              name: targetName,
              visibility: repositoryVisibility,
            },
            sourceGithub,
            github: targetGithub,
          });
          importSucceeded = true;
          break;
        } catch (error) {
          if (isTargetNameCollision(error)) {
            existingNames.push(targetName);
            continue;
          }

          throw error;
        }
      }

      if (!importSucceeded) {
        throw new Error(
          `Could not choose an available target repository name for "${repository.name}".`,
        );
      }
    } catch (error) {
      const message = summarizeError(error);

      targetRepository = getFailedTargetRepository({
        error,
        fallback: {
          owner: defaultOrg,
          name: targetName,
          url: "",
          defaultBranch: "",
        },
      });
      repositoryStatus = "FAILED";
      importStatus = "FAILED";
      importErrorSummary = message;
      preparationStatus = "BLOCKED";
      publishErrorSummary = message;
    }
  }

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
        repositoryOwner: targetRepository.owner,
        repositoryName: targetRepository.name,
        repositoryUrl: targetRepository.url || null,
        repositoryDefaultBranch: targetRepository.defaultBranch || null,
        repositoryVisibility: isSharedOrgRepo ? null : repositoryVisibility,
        repositoryStatus,
        publishStatus: "NOT_STARTED",
        publishErrorSummary,
      },
    });

    await tx.repositoryImport.create({
      data: {
        appRequestId: appRequest.id,
        sourceRepositoryUrl: source.normalizedUrl,
        sourceRepositoryOwner: source.owner,
        sourceRepositoryName: source.name,
        sourceRepositoryDefaultBranch: repository.defaultBranch,
        targetRepositoryOwner: targetRepository.owner,
        targetRepositoryName: targetRepository.name,
        targetRepositoryUrl: targetRepository.url || null,
        targetRepositoryDefaultBranch: targetRepository.defaultBranch || null,
        importStatus,
        importErrorSummary,
        compatibilityStatus: "NOT_SCANNED",
        compatibilityFindings: [],
        preparationStatus,
      },
    });

    return appRequest;
  });

  await recordAuditEvent("EXISTING_APP_ADD_REQUESTED", {
    requestId: request.id,
    supportReference,
    sourceRepositoryUrl: source.normalizedUrl,
    targetRepositoryUrl: targetRepository.url || null,
  });

  if (!isSharedOrgRepo) {
    await recordAuditEvent(
      importStatus === "SUCCEEDED"
        ? "EXISTING_APP_IMPORT_SUCCEEDED"
        : "EXISTING_APP_IMPORT_FAILED",
      {
        requestId: request.id,
        sourceRepository: `${source.owner}/${source.name}`,
        targetRepository: `${targetRepository.owner}/${targetRepository.name}`,
        error: importErrorSummary,
      },
    );
  }

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

  const runningImport = await prisma.repositoryImport.updateMany({
    where: {
      id: appRequest.repositoryImport.id,
      preparationStatus: "PENDING_USER_CHOICE",
    },
    data: {
      preparationMode: mode,
      preparationStatus: "RUNNING",
      preparationErrorSummary: null,
    },
  });

  if (runningImport.count !== 1) {
    throw new Error("Imported app preparation is not awaiting a user choice.");
  }

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

function formatPublishReadinessError(readiness: {
  missingPaths: string[];
  packageIssues: string[];
}) {
  if (readiness.packageIssues.length > 0) {
    return `Repository is not ready for publishing: ${readiness.packageIssues.join("; ")}`;
  }

  return `Missing publishing files on default branch: ${readiness.missingPaths.join(", ")}`;
}

export async function verifyExistingAppPreparationAction(
  requestId: string,
  deps: VerifyExistingAppPreparationDeps = {},
) {
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
    throw new Error("Imported app repository is not ready for verification.");
  }

  if (appRequest.repositoryImport.preparationStatus !== "PULL_REQUEST_OPENED") {
    throw new Error(
      "Imported app preparation is not awaiting PR merge verification.",
    );
  }

  const readiness = await verifyImportedPublishReadiness({
    owner: appRequest.repositoryOwner,
    name: appRequest.repositoryName,
    defaultBranch: appRequest.repositoryDefaultBranch,
    github:
      deps.github ?? createDefaultPreparationGitHubClient(appRequest.repositoryOwner),
  });

  if (!readiness.ready) {
    await prisma.repositoryImport.update({
      where: { id: appRequest.repositoryImport.id },
      data: {
        preparationStatus: "PULL_REQUEST_OPENED",
        preparationErrorSummary: formatPublishReadinessError(readiness),
      },
    });

    revalidatePath("/apps");
    return;
  }

  const verifiedImport = await prisma.repositoryImport.updateMany({
    where: {
      id: appRequest.repositoryImport.id,
      preparationStatus: "PULL_REQUEST_OPENED",
    },
    data: {
      preparationStatus: "COMMITTED",
      preparationErrorSummary: null,
    },
  });

  if (verifiedImport.count !== 1) {
    throw new Error(
      "Imported app preparation is not awaiting PR merge verification.",
    );
  }

  await recordAuditEvent("REPOSITORY_PREPARATION_VERIFIED", {
    requestId,
    targetRepository: `${appRequest.repositoryOwner}/${appRequest.repositoryName}`,
  });

  revalidatePath("/apps");
}
