import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { preflightPublishingSetup } from "@/features/publishing/setup/service";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  addExistingAppAction,
  prepareExistingAppAction,
  verifyExistingAppPreparationAction,
} from "./actions";
import { PUBLISHING_BUNDLE_PATHS } from "./compatibility";
import { importRepositoryWithHistory } from "./import-repository";
import { prepareImportedRepository } from "./prepare-repository";

const readyPackageJson = JSON.stringify({
  scripts: {
    build: "next build",
    start: "next start",
  },
  dependencies: {
    next: "15.5.15",
  },
  engines: {
    node: ">=24",
  },
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/support-reference", () => ({
  createSupportReference: vi.fn(() => "SUP-123"),
}));

vi.mock("@/features/repositories/config", () => ({
  loadGitHubAppConfig: vi.fn(() => ({
    appId: "123",
    privateKey: "key",
    allowedOrgs: ["cedarville-it"],
    defaultOrg: "cedarville-it",
    defaultRepoVisibility: "private",
    installationIdsByOrg: { "cedarville-it": "111" },
  })),
}));

vi.mock("@/features/repositories/github-app", () => ({
  createGitHubAppClient: vi.fn(() => ({
    createInstallationTokenForGit: vi.fn(),
    createRepository: vi.fn(),
    updateRepositoryDefaultBranch: vi.fn(),
    getRepository: vi.fn(),
    getBranchHead: vi.fn(),
    readRepositoryTextFiles: vi.fn(),
    commitFiles: vi.fn(),
    createPullRequestWithFiles: vi.fn(),
  })),
}));

vi.mock("@/features/publishing/setup/service", () => ({
  preflightPublishingSetup: vi.fn(),
}));

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

vi.mock("@/lib/db", () => ({
  prisma: (() => {
    const prismaMock = {
      template: { upsert: vi.fn() },
      appRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      repositoryImport: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn((callback) => callback(prismaMock)),
    };

    return prismaMock;
  })(),
}));

vi.mock("./prepare-repository", () => ({
  prepareImportedRepository: vi.fn(),
}));

vi.mock("./import-repository", () => ({
  importRepositoryWithHistory: vi.fn(),
}));

describe("repository import actions", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(loadGitHubAppConfig).mockClear();
    vi.mocked(createGitHubAppClient).mockReset();
    vi.mocked(createGitHubAppClient).mockReturnValue({
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi.fn(),
      updateRepositoryDefaultBranch: vi.fn(),
      getRepository: vi.fn(),
      getBranchHead: vi.fn(),
      readRepositoryTextFiles: vi.fn(),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    });
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(prisma.template.upsert).mockReset();
    vi.mocked(prisma.appRequest.create).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.repositoryImport.create).mockReset();
    vi.mocked(prisma.repositoryImport.update).mockReset();
    vi.mocked(prisma.repositoryImport.updateMany).mockReset();
    vi.mocked(prisma.repositoryImport.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.$transaction).mockImplementation((callback) =>
      callback(prisma),
    );
    vi.mocked(prepareImportedRepository).mockReset();
    vi.mocked(importRepositoryWithHistory).mockReset();
    vi.mocked(preflightPublishingSetup).mockReset();
    vi.mocked(preflightPublishingSetup).mockResolvedValue([]);
  });

  it("creates an imported app request for a shared-org repo", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_123",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/cedarville-it/campus-dashboard");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Existing dashboard.");

    await addExistingAppAction(formData, {
      defaultOrg: "cedarville-it",
      repository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });

    expect(prisma.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-123",
        appName: "Campus Dashboard",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
      }),
    });
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appRequestId: "req_123",
        importStatus: "NOT_REQUIRED",
        compatibilityStatus: "NOT_SCANNED",
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "EXISTING_APP_ADD_REQUESTED",
      expect.objectContaining({
        requestId: "req_123",
        supportReference: "SUP-123",
      }),
    );
    expect(importRepositoryWithHistory).not.toHaveBeenCalled();
  });

  it("imports external repositories into the shared org before creating ready records", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_external",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(importRepositoryWithHistory).mockResolvedValue({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    });

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/external-org/Campus-Dashboard");
    formData.set("appName", "Campus Dashboard");

    await addExistingAppAction(formData, {
      defaultOrg: "cedarville-it",
      repository: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
    });

    expect(importRepositoryWithHistory).toHaveBeenCalledWith({
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github: expect.objectContaining({
        createRepository: expect.any(Function),
        createInstallationTokenForGit: expect.any(Function),
      }),
    });
    expect(prisma.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryDefaultBranch: "main",
        repositoryVisibility: "private",
        repositoryStatus: "READY",
        publishErrorSummary: null,
      }),
    });
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceRepositoryOwner: "external-org",
        sourceRepositoryName: "Campus-Dashboard",
        sourceRepositoryDefaultBranch: "trunk",
        targetRepositoryOwner: "cedarville-it",
        targetRepositoryName: "campus-dashboard",
        targetRepositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        targetRepositoryDefaultBranch: "main",
        importStatus: "SUCCEEDED",
        importErrorSummary: null,
        preparationStatus: "PENDING_USER_CHOICE",
      }),
    });
  });

  it("falls back to public GitHub metadata for external repos without a source installation", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_public_external",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(importRepositoryWithHistory).mockResolvedValue({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "trunk",
    });
    const publicRepositoryFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(
        createJsonResponse({
          html_url: "https://github.com/external-org/Campus-Dashboard",
          default_branch: "trunk",
          name: "Campus-Dashboard",
          owner: { login: "external-org" },
        }),
      );

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/external-org/Campus-Dashboard");
    formData.set("appName", "Campus Dashboard");

    await addExistingAppAction(formData, {
      publicRepositoryFetch,
    });

    expect(publicRepositoryFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/external-org/Campus-Dashboard",
      expect.objectContaining({ method: "GET" }),
    );
    expect(importRepositoryWithHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "trunk",
        },
        sourceGithub: undefined,
      }),
    );
  });

  it("passes a source GitHub client for app-readable private external repos", async () => {
    vi.mocked(loadGitHubAppConfig).mockReturnValue({
      appId: "123",
      privateKey: "key",
      allowedOrgs: ["cedarville-it"],
      defaultOrg: "cedarville-it",
      defaultRepoVisibility: "private",
      installationIdsByOrg: {
        "cedarville-it": "111",
        "external-org": "222",
      },
    });
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_private_external",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(importRepositoryWithHistory).mockResolvedValue({
      owner: "cedarville-it",
      name: "private-dashboard",
      url: "https://github.com/cedarville-it/private-dashboard",
      defaultBranch: "main",
    });
    const sourceGithub = {
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi.fn(),
      updateRepositoryDefaultBranch: vi.fn(),
      getRepository: vi.fn().mockResolvedValue({
        owner: "external-org",
        name: "Private-Dashboard",
        url: "https://github.com/external-org/Private-Dashboard",
        defaultBranch: "main",
      }),
      getBranchHead: vi.fn(),
      readRepositoryTextFiles: vi.fn(),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };
    const targetGithub = {
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi.fn(),
      updateRepositoryDefaultBranch: vi.fn(),
      getRepository: vi.fn(),
      getBranchHead: vi.fn(),
      readRepositoryTextFiles: vi.fn(),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };
    vi.mocked(createGitHubAppClient)
      .mockReturnValueOnce(sourceGithub)
      .mockReturnValueOnce(targetGithub);

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/external-org/Private-Dashboard");
    formData.set("appName", "Private Dashboard");

    await addExistingAppAction(formData);

    expect(importRepositoryWithHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceGithub,
        github: targetGithub,
      }),
    );
  });

  it("retries deterministic target names when the first external import target collides", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_collision",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(importRepositoryWithHistory)
      .mockRejectedValueOnce(
        Object.assign(new Error("Target repository already exists."), {
          name: "RepositoryImportError",
          stage: "create-target",
          code: "TARGET_REPOSITORY_ALREADY_EXISTS",
        }),
      )
      .mockResolvedValueOnce({
        owner: "cedarville-it",
        name: "campus-dashboard-2",
        url: "https://github.com/cedarville-it/campus-dashboard-2",
        defaultBranch: "main",
      });

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/external-org/Campus-Dashboard");
    formData.set("appName", "Campus Dashboard");

    await addExistingAppAction(formData, {
      defaultOrg: "cedarville-it",
      repository: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "main",
      },
    });

    expect(importRepositoryWithHistory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        target: expect.objectContaining({ name: "campus-dashboard" }),
      }),
    );
    expect(importRepositoryWithHistory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: expect.objectContaining({ name: "campus-dashboard-2" }),
      }),
    );
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetRepositoryName: "campus-dashboard-2",
        targetRepositoryUrl: "https://github.com/cedarville-it/campus-dashboard-2",
        importStatus: "SUCCEEDED",
      }),
    });
  });

  it("creates blocked support history when all target import names collide", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_collision_exhausted",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(importRepositoryWithHistory).mockRejectedValue(
      Object.assign(new Error("Target repository already exists."), {
        name: "RepositoryImportError",
        stage: "create-target",
        code: "TARGET_REPOSITORY_ALREADY_EXISTS",
      }),
    );

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/external-org/Campus-Dashboard");
    formData.set("appName", "Campus Dashboard");

    await expect(
      addExistingAppAction(formData, {
        defaultOrg: "cedarville-it",
        repository: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
      }),
    ).resolves.toEqual({ requestId: "req_collision_exhausted" });

    expect(importRepositoryWithHistory).toHaveBeenCalledTimes(99);
    expect(importRepositoryWithHistory).toHaveBeenNthCalledWith(
      99,
      expect.objectContaining({
        target: expect.objectContaining({ name: "campus-dashboard-99" }),
      }),
    );
    expect(prisma.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard-99",
        repositoryUrl: null,
        repositoryDefaultBranch: null,
        repositoryStatus: "FAILED",
        publishErrorSummary:
          'Could not choose an available target repository name for "Campus-Dashboard".',
      }),
    });
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetRepositoryOwner: "cedarville-it",
        targetRepositoryName: "campus-dashboard-99",
        targetRepositoryUrl: null,
        targetRepositoryDefaultBranch: null,
        importStatus: "FAILED",
        importErrorSummary:
          'Could not choose an available target repository name for "Campus-Dashboard".',
        preparationStatus: "BLOCKED",
      }),
    });
  });

  it("keeps support history when external repository import fails", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_failed_import",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(importRepositoryWithHistory).mockRejectedValue(
      new Error("Repository import failed while mirroring git history."),
    );

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/external-org/Campus-Dashboard");
    formData.set("appName", "Campus Dashboard");

    await expect(
      addExistingAppAction(formData, {
        defaultOrg: "cedarville-it",
        repository: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "trunk",
        },
      }),
    ).resolves.toEqual({ requestId: "req_failed_import" });

    expect(prisma.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryUrl: null,
        repositoryDefaultBranch: null,
        repositoryVisibility: "private",
        repositoryStatus: "FAILED",
        publishErrorSummary: "Repository import failed while mirroring git history.",
      }),
    });
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceRepositoryOwner: "external-org",
        sourceRepositoryName: "Campus-Dashboard",
        sourceRepositoryDefaultBranch: "trunk",
        targetRepositoryOwner: "cedarville-it",
        targetRepositoryName: "campus-dashboard",
        targetRepositoryUrl: null,
        targetRepositoryDefaultBranch: null,
        importStatus: "FAILED",
        importErrorSummary: "Repository import failed while mirroring git history.",
        preparationStatus: "BLOCKED",
      }),
    });
  });

  it("persists target repository evidence when import fails after creating the target repo", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_partial_failure",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(importRepositoryWithHistory).mockRejectedValue(
      Object.assign(
        new Error("Repository import failed while mirroring git history."),
        {
          name: "RepositoryImportError",
          stage: "push",
          targetRepository: {
            owner: "cedarville-it",
            name: "campus-dashboard",
            url: "https://github.com/cedarville-it/campus-dashboard",
            defaultBranch: "trunk",
          },
        },
      ),
    );

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/external-org/Campus-Dashboard");
    formData.set("appName", "Campus Dashboard");

    await addExistingAppAction(formData, {
      defaultOrg: "cedarville-it",
      repository: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
    });

    expect(prisma.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryDefaultBranch: "trunk",
        repositoryStatus: "FAILED",
        publishErrorSummary: "Repository import failed while mirroring git history.",
      }),
    });
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetRepositoryOwner: "cedarville-it",
        targetRepositoryName: "campus-dashboard",
        targetRepositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        targetRepositoryDefaultBranch: "trunk",
        importStatus: "FAILED",
        importErrorSummary: "Repository import failed while mirroring git history.",
        preparationStatus: "BLOCKED",
      }),
    });
  });

  it("resolves repository metadata before creating ready records", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_124",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    const github = {
      getRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      }),
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi.fn(),
      updateRepositoryDefaultBranch: vi.fn(),
      getBranchHead: vi.fn(),
      readRepositoryTextFiles: vi.fn(),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };
    vi.mocked(createGitHubAppClient).mockReturnValue(github);

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/Cedarville-IT/Campus-Dashboard");
    formData.set("appName", "Campus Dashboard");

    await addExistingAppAction(formData);

    expect(createGitHubAppClient).toHaveBeenCalledWith({
      appId: "123",
      privateKey: "key",
      installationId: "111",
    });
    expect(github.getRepository).toHaveBeenCalledWith({
      owner: "Cedarville-IT",
      name: "Campus-Dashboard",
    });
    expect(prisma.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryDefaultBranch: "trunk",
        repositoryStatus: "READY",
      }),
    });
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceRepositoryOwner: "Cedarville-IT",
        sourceRepositoryName: "Campus-Dashboard",
        sourceRepositoryDefaultBranch: "trunk",
        targetRepositoryOwner: "cedarville-it",
        targetRepositoryName: "campus-dashboard",
        targetRepositoryDefaultBranch: "trunk",
        importStatus: "NOT_REQUIRED",
      }),
    });
  });

  it("does not look up repositories when authentication fails", async () => {
    vi.mocked(resolveCurrentUserId).mockRejectedValue(new Error("unauthorized"));
    const github = {
      getRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi.fn(),
      updateRepositoryDefaultBranch: vi.fn(),
      getBranchHead: vi.fn(),
      readRepositoryTextFiles: vi.fn(),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };
    vi.mocked(createGitHubAppClient).mockReturnValue(github);

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/cedarville-it/campus-dashboard");
    formData.set("appName", "Campus Dashboard");

    await expect(addExistingAppAction(formData)).rejects.toThrow("unauthorized");

    expect(github.getRepository).not.toHaveBeenCalled();
    expect(prisma.appRequest.create).not.toHaveBeenCalled();
  });

  it("prepares an imported app by direct commit", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_123",
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockResolvedValue({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
    });

    const formData = new FormData();
    formData.set("preparationMode", "DIRECT_COMMIT");

    await prepareExistingAppAction("req_123", formData, {
      github: {
        getBranchHead: vi.fn(),
        readRepositoryTextFiles: vi.fn(),
        commitFiles: vi.fn(),
        createPullRequestWithFiles: vi.fn(),
      },
    });

    expect(prepareImportedRepository).toHaveBeenCalledWith({
      appName: "Campus Dashboard",
      owner: "cedarville-it",
      name: "campus-dashboard",
      defaultBranch: "main",
      mode: "DIRECT_COMMIT",
      github: expect.any(Object),
    });
    expect(prisma.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: {
        id: "import_123",
        preparationStatus: { in: ["PENDING_USER_CHOICE", "FAILED"] },
      },
      data: {
        preparationMode: "DIRECT_COMMIT",
        preparationStatus: "RUNNING",
        preparationErrorSummary: null,
      },
    });
    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_123" },
      data: expect.objectContaining({
        preparationMode: "DIRECT_COMMIT",
        preparationStatus: "COMMITTED",
        preparationPullRequestUrl: null,
        preparationErrorSummary: null,
      }),
    });
    expect(preflightPublishingSetup).toHaveBeenCalledWith("req_123");
  });

  it("retries a failed imported app preparation", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_retry_preparation",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_retry_preparation",
        preparationMode: "PULL_REQUEST",
        preparationStatus: "FAILED",
        preparationErrorSummary: "GitHub API rate limit exceeded.",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockResolvedValue({
      status: "PULL_REQUEST_OPENED",
      commitSha: "commit-sha",
      pullRequestUrl: "https://github.com/cedarville-it/campus-dashboard/pull/7",
    });

    const formData = new FormData();
    formData.set("preparationMode", "PULL_REQUEST");

    await prepareExistingAppAction("req_retry_preparation", formData, {
      github: {
        getBranchHead: vi.fn(),
        readRepositoryTextFiles: vi.fn(),
        commitFiles: vi.fn(),
        createPullRequestWithFiles: vi.fn(),
      },
    });

    expect(prisma.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: {
        id: "import_retry_preparation",
        OR: [
          { preparationStatus: { in: ["PENDING_USER_CHOICE", "FAILED"] } },
          {
            compatibilityStatus: "CONFLICTED",
            preparationStatus: "BLOCKED",
          },
        ],
      },
      data: {
        preparationMode: "PULL_REQUEST",
        preparationStatus: "RUNNING",
        preparationErrorSummary: null,
      },
    });
    expect(prepareImportedRepository).toHaveBeenCalledWith({
      appName: "Campus Dashboard",
      owner: "cedarville-it",
      name: "campus-dashboard",
      defaultBranch: "main",
      mode: "PULL_REQUEST",
      github: expect.any(Object),
    });
    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_retry_preparation" },
      data: expect.objectContaining({
        preparationMode: "PULL_REQUEST",
        preparationStatus: "PULL_REQUEST_OPENED",
        preparationPullRequestUrl:
          "https://github.com/cedarville-it/campus-dashboard/pull/7",
        preparationErrorSummary: null,
      }),
    });
    expect(preflightPublishingSetup).not.toHaveBeenCalled();
  });

  it("marks publishing setup as needing repair when committed preparation preflight fails", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_preflight_failed",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_preflight_failed",
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockResolvedValue({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
    });
    vi.mocked(preflightPublishingSetup).mockRejectedValue(
      new Error("Azure app settings are missing."),
    );

    const formData = new FormData();
    formData.set("preparationMode", "DIRECT_COMMIT");

    await expect(
      prepareExistingAppAction("req_preflight_failed", formData, {
        github: {
          getBranchHead: vi.fn(),
          readRepositoryTextFiles: vi.fn(),
          commitFiles: vi.fn(),
          createPullRequestWithFiles: vi.fn(),
        },
      }),
    ).resolves.toBeUndefined();

    expect(preflightPublishingSetup).toHaveBeenCalledWith("req_preflight_failed");
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_preflight_failed" },
      data: {
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary: "Azure app settings are missing.",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/req_preflight_failed");
  });

  it("records publishing-file conflicts as blocked feedback without throwing", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_456",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_456",
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockRejectedValue(
      new Error(
        "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists.",
      ),
    );

    const formData = new FormData();
    formData.set("preparationMode", "PULL_REQUEST");

    await expect(
      prepareExistingAppAction("req_456", formData, {
        github: {
          getBranchHead: vi.fn(),
          readRepositoryTextFiles: vi.fn(),
          commitFiles: vi.fn(),
          createPullRequestWithFiles: vi.fn(),
        },
      }),
    ).resolves.toBeUndefined();

    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_456" },
      data: expect.objectContaining({
        preparationMode: "PULL_REQUEST",
        compatibilityStatus: "CONFLICTED",
        preparationStatus: "BLOCKED",
        preparationErrorSummary:
          "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists. The portal will not overwrite existing publishing files directly. Open an Azure publishing PR to review the generated changes in Git, or resolve them manually and verify readiness here.",
      }),
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_PREPARATION_FAILED",
      {
        requestId: "req_456",
        mode: "PULL_REQUEST",
        targetRepository: "cedarville-it/campus-dashboard",
        error:
          "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists. The portal will not overwrite existing publishing files directly. Open an Azure publishing PR to review the generated changes in Git, or resolve them manually and verify readiness here.",
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/req_456");
  });

  it("opens a preparation PR from a conflict-blocked imported app", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_conflict_pr",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_conflict_pr",
        compatibilityStatus: "CONFLICTED",
        preparationStatus: "BLOCKED",
        preparationErrorSummary:
          "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists.",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockResolvedValue({
      status: "PULL_REQUEST_OPENED",
      commitSha: "commit-sha",
      pullRequestUrl: "https://github.com/cedarville-it/campus-dashboard/pull/8",
    });

    const formData = new FormData();
    formData.set("preparationMode", "PULL_REQUEST");

    await prepareExistingAppAction("req_conflict_pr", formData, {
      github: {
        getBranchHead: vi.fn(),
        readRepositoryTextFiles: vi.fn(),
        commitFiles: vi.fn(),
        createPullRequestWithFiles: vi.fn(),
      },
    });

    expect(prisma.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: {
        id: "import_conflict_pr",
        OR: [
          { preparationStatus: { in: ["PENDING_USER_CHOICE", "FAILED"] } },
          {
            compatibilityStatus: "CONFLICTED",
            preparationStatus: "BLOCKED",
          },
        ],
      },
      data: {
        preparationMode: "PULL_REQUEST",
        preparationStatus: "RUNNING",
        preparationErrorSummary: null,
      },
    });
    expect(prepareImportedRepository).toHaveBeenCalledWith({
      appName: "Campus Dashboard",
      owner: "cedarville-it",
      name: "campus-dashboard",
      defaultBranch: "main",
      mode: "PULL_REQUEST",
      github: expect.any(Object),
    });
    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_conflict_pr" },
      data: expect.objectContaining({
        preparationMode: "PULL_REQUEST",
        preparationStatus: "PULL_REQUEST_OPENED",
        preparationPullRequestUrl:
          "https://github.com/cedarville-it/campus-dashboard/pull/8",
        preparationErrorSummary: null,
      }),
    });
  });

  it("still raises unexpected preparation failures after recording them", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_unexpected",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_unexpected",
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockRejectedValue(
      new Error("GitHub API rate limit exceeded."),
    );

    const formData = new FormData();
    formData.set("preparationMode", "DIRECT_COMMIT");

    await expect(
      prepareExistingAppAction("req_unexpected", formData, {
        github: {
          getBranchHead: vi.fn(),
          readRepositoryTextFiles: vi.fn(),
          commitFiles: vi.fn(),
          createPullRequestWithFiles: vi.fn(),
        },
      }),
    ).rejects.toThrow("GitHub API rate limit exceeded.");

    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_unexpected" },
      data: expect.objectContaining({
        preparationMode: "DIRECT_COMMIT",
        preparationStatus: "FAILED",
        preparationErrorSummary: "GitHub API rate limit exceeded.",
      }),
    });
  });

  it("rejects preparation unless the import is awaiting a user choice", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_stale",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_stale",
        preparationStatus: "PULL_REQUEST_OPENED",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.repositoryImport.updateMany).mockResolvedValueOnce({
      count: 0,
    });

    const formData = new FormData();
    formData.set("preparationMode", "DIRECT_COMMIT");

    await expect(
      prepareExistingAppAction("req_stale", formData, {
        github: {
          getBranchHead: vi.fn(),
          readRepositoryTextFiles: vi.fn(),
          commitFiles: vi.fn(),
          createPullRequestWithFiles: vi.fn(),
        },
      }),
    ).rejects.toThrow(
      "Imported app preparation is not awaiting a user choice.",
    );

    expect(prisma.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: {
        id: "import_stale",
        preparationStatus: { in: ["PENDING_USER_CHOICE", "FAILED"] },
      },
      data: {
        preparationMode: "DIRECT_COMMIT",
        preparationStatus: "RUNNING",
        preparationErrorSummary: null,
      },
    });
    expect(prepareImportedRepository).not.toHaveBeenCalled();
  });

  it("prepares with a case-insensitive installation lookup", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_789",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "Cedarville-IT",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_789",
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockResolvedValue({
      status: "PULL_REQUEST_OPENED",
      commitSha: "commit-sha",
      pullRequestUrl: "https://github.com/Cedarville-IT/campus-dashboard/pull/1",
    });

    const formData = new FormData();
    formData.set("preparationMode", "PULL_REQUEST");

    await prepareExistingAppAction("req_789", formData);

    expect(createGitHubAppClient).toHaveBeenCalledWith({
      appId: "123",
      privateKey: "key",
      installationId: "111",
    });
    expect(prepareImportedRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "Cedarville-IT",
        github: expect.any(Object),
      }),
    );
  });

  it("marks opened preparation PRs committed when publishing files reach the default branch", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_verify",
      userId: "user-123",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_verify",
        preparationStatus: "PULL_REQUEST_OPENED",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": readyPackageJson,
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await verifyExistingAppPreparationAction("req_verify", { github });

    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      ref: "main",
      paths: [
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lock",
        "bun.lockb",
        "pnpm-workspace.yaml",
        "turbo.json",
        "lerna.json",
        "nx.json",
        ...PUBLISHING_BUNDLE_PATHS,
      ],
    });
    expect(prisma.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: {
        id: "import_verify",
        preparationStatus: "PULL_REQUEST_OPENED",
      },
      data: {
        preparationStatus: "COMMITTED",
        preparationErrorSummary: null,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_PREPARATION_VERIFIED",
      {
        requestId: "req_verify",
        targetRepository: "cedarville-it/campus-dashboard",
      },
    );
    expect(preflightPublishingSetup).toHaveBeenCalledWith("req_verify");
  });

  it("marks conflict-blocked repositories committed when required publishing files reach the default branch", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_verify_conflict",
      userId: "user-123",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_verify_conflict",
        compatibilityStatus: "CONFLICTED",
        preparationStatus: "BLOCKED",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": readyPackageJson,
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await verifyExistingAppPreparationAction("req_verify_conflict", { github });

    expect(prisma.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: {
        id: "import_verify_conflict",
        preparationStatus: "BLOCKED",
      },
      data: {
        preparationStatus: "COMMITTED",
        preparationErrorSummary: null,
      },
    });
  });

  it("rejects preparation verification unless the import is awaiting PR merge verification", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_pending",
      userId: "user-123",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_pending",
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": readyPackageJson,
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await expect(
      verifyExistingAppPreparationAction("req_pending", { github }),
    ).rejects.toThrow(
      "Imported app preparation is not awaiting PR merge verification.",
    );

    expect(github.readRepositoryTextFiles).not.toHaveBeenCalled();
    expect(prisma.repositoryImport.update).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalledWith(
      "REPOSITORY_PREPARATION_VERIFIED",
      expect.anything(),
    );
  });

  it("keeps preparation in PR-opened state when publishing files are still missing", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_missing",
      userId: "user-123",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_missing",
        preparationStatus: "PULL_REQUEST_OPENED",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    const [missingPath, ...presentPaths] = PUBLISHING_BUNDLE_PATHS;
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": readyPackageJson,
        ...Object.fromEntries(presentPaths.map((path) => [path, "content"])),
      }),
    };

    await verifyExistingAppPreparationAction("req_missing", { github });

    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_missing" },
      data: {
        preparationStatus: "PULL_REQUEST_OPENED",
        preparationErrorSummary: `Missing publishing files on default branch: ${missingPath}`,
      },
    });
    expect(recordAuditEvent).not.toHaveBeenCalledWith(
      "REPOSITORY_PREPARATION_VERIFIED",
      expect.anything(),
    );
  });

  it("keeps preparation in PR-opened state when package.json readiness is incomplete", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_incomplete_package",
      userId: "user-123",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: {
        id: "import_incomplete_package",
        preparationStatus: "PULL_REQUEST_OPENED",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": JSON.stringify({
          scripts: { build: "next build" },
          dependencies: { next: "15.5.15" },
        }),
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await verifyExistingAppPreparationAction("req_incomplete_package", { github });

    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_incomplete_package" },
      data: {
        preparationStatus: "PULL_REQUEST_OPENED",
        preparationErrorSummary:
          'Repository is not ready for publishing: package.json is missing a start script; the portal can add "next start".; package.json is missing engines.node; the portal can add ">=24".',
      },
    });
    expect(prisma.repositoryImport.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ preparationStatus: "COMMITTED" }),
      }),
    );
  });
});
