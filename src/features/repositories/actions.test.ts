import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { buildArchive } from "@/features/generation/build-archive";
import { grantManagedRepositoryAccess } from "@/features/repositories/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { bootstrapManagedRepository } from "./bootstrap-managed-repository";
import {
  retryRepositoryBootstrapAction,
  saveGitHubUsernameAndGrantAccessAction,
} from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/features/generation/build-archive", () => ({
  buildArchive: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("./bootstrap-managed-repository", () => ({
  bootstrapManagedRepository: vi.fn(),
}));

vi.mock("./access", () => ({
  grantManagedRepositoryAccess: vi.fn(),
  parseGitHubUsername: vi.fn((value: unknown) => String(value ?? "").trim()),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("retryRepositoryBootstrapAction", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(buildArchive).mockReset();
    vi.mocked(grantManagedRepositoryAccess).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(bootstrapManagedRepository).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.update).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    consoleErrorSpy.mockClear();
  });

  it("retries a failed managed repository bootstrap for the owning user", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      userId: "user-123",
      repositoryStatus: "FAILED",
      supportReference: "SUP-123",
      submittedConfig: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-123",
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(bootstrapManagedRepository).mockResolvedValue({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
      visibility: "private",
    });
    vi.mocked(grantManagedRepositoryAccess).mockResolvedValue({
      status: "GRANTED",
    });

    await retryRepositoryBootstrapAction("req_123");

    expect(buildArchive).toHaveBeenCalledWith({
      templateSlug: "web-app",
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });
    expect(bootstrapManagedRepository).toHaveBeenCalledWith({
      appRequestId: "req_123",
      input: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service",
      },
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      reuseExistingRepository: true,
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: {
        repositoryStatus: "PENDING",
        publishErrorSummary: null,
      },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: {
        repositoryProvider: "GITHUB",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryDefaultBranch: "main",
        repositoryVisibility: "private",
        repositoryStatus: "READY",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishErrorSummary: null,
      },
    });
    expect(grantManagedRepositoryAccess).toHaveBeenCalledWith({
      owner: "cedarville-it",
      repositoryName: "campus-dashboard",
      githubUsername: "portalstaff",
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: {
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @portalstaff.",
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_BOOTSTRAP_SUCCEEDED",
      expect.objectContaining({
        requestId: "req_123",
        retried: true,
      }),
    );
  });

  it("keeps the repo failed and stores the retry error when bootstrap still fails", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_456",
      userId: "user-123",
      repositoryStatus: "FAILED",
      supportReference: "SUP-456",
      submittedConfig: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-123",
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(bootstrapManagedRepository).mockRejectedValue(
      new Error("missing GitHub app config"),
    );

    await retryRepositoryBootstrapAction("req_456");

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_456" },
      data: {
        repositoryStatus: "FAILED",
        publishErrorSummary: "missing GitHub app config",
      },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Managed repository bootstrap retry failed",
      expect.objectContaining({
        requestId: "req_456",
        supportReference: "SUP-456",
        error: expect.any(Error),
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_BOOTSTRAP_FAILED",
      expect.objectContaining({
        requestId: "req_456",
        error: "missing GitHub app config",
        retried: true,
      }),
    );
  });

  it("saves a GitHub username and grants repo access for a ready managed repo", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_789",
      userId: "user-123",
      supportReference: "SUP-789",
      repositoryStatus: "READY",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(grantManagedRepositoryAccess).mockResolvedValue({
      status: "INVITED",
      invitationId: 99,
    });

    const formData = new FormData();
    formData.set("githubUsername", "portalstaff");

    await saveGitHubUsernameAndGrantAccessAction("req_789", formData);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-123" },
      data: { githubUsername: "portalstaff" },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_789" },
      data: {
        repositoryAccessStatus: "INVITED",
        repositoryAccessNote: "GitHub invited @portalstaff to this repository.",
      },
    });
  });
});
