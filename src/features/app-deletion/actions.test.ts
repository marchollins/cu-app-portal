import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { deleteArtifact } from "@/features/generation/storage";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { deleteAppAction } from "./actions";
import {
  deleteAzureDeployment,
  deleteManagedGitHubRepository,
} from "./external";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/features/generation/storage", () => ({
  deleteArtifact: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    appRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    generatedArtifact: {
      deleteMany: vi.fn(),
    },
    publishAttempt: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("./external", () => ({
  deleteAzureDeployment: vi.fn(),
  deleteManagedGitHubRepository: vi.fn(),
}));

function deletionForm(scopes: Array<"portal" | "github" | "azure">) {
  const formData = new FormData();

  formData.set("confirmDelete", "on");

  for (const scope of scopes) {
    formData.set(`delete${scope[0].toUpperCase()}${scope.slice(1)}`, "on");
  }

  return formData;
}

const ownedRequest = {
  id: "request-123",
  userId: "user-123",
  appName: "Campus Dashboard",
  supportReference: "CU-123",
  repositoryOwner: "cedarville-it",
  repositoryName: "campus-dashboard",
  repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
  repositoryStatus: "READY",
  repositoryAccessStatus: "GRANTED",
  repositoryAccessNote: "GitHub access is ready.",
  publishStatus: "SUCCEEDED",
  publishUrl: "https://app-campus-dashboard.azurewebsites.net",
  primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
  azureResourceGroup: "rg-cu-apps-published",
  azureWebAppName: "app-campus-dashboard-clx9abc1",
  azurePostgresServer: "psql-cu-apps-published",
  azureDatabaseName: "db_campus_dashboard_clx9abc1",
  azureDefaultHostName: "app-campus-dashboard.azurewebsites.net",
  artifact: {
    storagePath: "/workspace/.artifacts/campus-dashboard.zip",
  },
};

describe("deleteAppAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      ownedRequest as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>,
    );
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      if (typeof callback !== "function") {
        throw new Error("Unexpected batch transaction in test.");
      }

      return callback(prisma);
    });
    vi.mocked(deleteManagedGitHubRepository).mockResolvedValue(undefined);
    vi.mocked(deleteAzureDeployment).mockResolvedValue(undefined);
    vi.mocked(deleteArtifact).mockResolvedValue(undefined);
    vi.mocked(recordAuditEvent).mockResolvedValue(undefined);
    vi.mocked(prisma.appRequest.update).mockResolvedValue(
      ownedRequest as Awaited<ReturnType<typeof prisma.appRequest.update>>,
    );
    vi.mocked(prisma.appRequest.delete).mockResolvedValue(
      ownedRequest as Awaited<ReturnType<typeof prisma.appRequest.delete>>,
    );
    vi.mocked(prisma.generatedArtifact.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.publishAttempt.deleteMany).mockResolvedValue({ count: 2 });
  });

  it("deletes selected GitHub, Azure, artifact, and portal records for the owner", async () => {
    await deleteAppAction("request-123", deletionForm(["portal", "github", "azure"]));

    expect(deleteManagedGitHubRepository).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
    });
    expect(deleteAzureDeployment).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      webAppName: "app-campus-dashboard-clx9abc1",
      postgresServer: "psql-cu-apps-published",
      databaseName: "db_campus_dashboard_clx9abc1",
      primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: null,
    });
    expect(deleteArtifact).toHaveBeenCalledWith(
      "/workspace/.artifacts/campus-dashboard.zip",
    );
    expect(prisma.publishAttempt.deleteMany).toHaveBeenCalledWith({
      where: { appRequestId: "request-123" },
    });
    expect(prisma.generatedArtifact.deleteMany).toHaveBeenCalledWith({
      where: { appRequestId: "request-123" },
    });
    expect(prisma.appRequest.delete).toHaveBeenCalledWith({
      where: { id: "request-123" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_DELETION_SUCCEEDED",
      expect.objectContaining({
        requestId: "request-123",
        deletedPortal: true,
        deletedGithub: true,
        deletedAzure: true,
      }),
    );
  });

  it("keeps the portal record and marks external resources deleted when portal is not selected", async () => {
    await deleteAppAction("request-123", deletionForm(["github", "azure"]));

    expect(deleteArtifact).not.toHaveBeenCalled();
    expect(prisma.appRequest.delete).not.toHaveBeenCalled();
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: expect.objectContaining({
        repositoryStatus: "DELETED",
        repositoryUrl: null,
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishStatus: "DELETED",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
      }),
    });
  });

  it("requires confirmation and at least one deletion target", async () => {
    const formData = new FormData();
    formData.set("deletePortal", "on");

    await expect(deleteAppAction("request-123", formData)).rejects.toThrow(
      "Confirm deletion before continuing.",
    );

    const confirmedForm = new FormData();
    confirmedForm.set("confirmDelete", "on");

    await expect(deleteAppAction("request-123", confirmedForm)).rejects.toThrow(
      "Choose at least one app resource to delete.",
    );
  });
});
