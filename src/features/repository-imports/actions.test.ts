import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { addExistingAppAction, prepareExistingAppAction } from "./actions";
import { prepareImportedRepository } from "./prepare-repository";

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
    getBranchHead: vi.fn(),
    readRepositoryTextFiles: vi.fn(),
    commitFiles: vi.fn(),
    createPullRequestWithFiles: vi.fn(),
  })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    template: { upsert: vi.fn() },
    appRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    repositoryImport: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("./prepare-repository", () => ({
  prepareImportedRepository: vi.fn(),
}));

describe("repository import actions", () => {
  beforeEach(() => {
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(prisma.template.upsert).mockReset();
    vi.mocked(prisma.appRequest.create).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.repositoryImport.create).mockReset();
    vi.mocked(prisma.repositoryImport.update).mockReset();
    vi.mocked(prepareImportedRepository).mockReset();
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
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "EXISTING_APP_ADD_REQUESTED",
      expect.objectContaining({
        requestId: "req_123",
        supportReference: "SUP-123",
      }),
    );
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
      repositoryImport: { id: "import_123" },
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
    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_123" },
      data: expect.objectContaining({
        preparationMode: "DIRECT_COMMIT",
        preparationStatus: "COMMITTED",
        preparationPullRequestUrl: null,
        preparationErrorSummary: null,
      }),
    });
  });

  it("records failed preparation errors", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_456",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: { id: "import_456" },
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
    ).rejects.toThrow("Repository has publishing file conflicts");

    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_456" },
      data: expect.objectContaining({
        preparationMode: "PULL_REQUEST",
        preparationStatus: "FAILED",
        preparationErrorSummary:
          "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists.",
      }),
    });
  });
});
