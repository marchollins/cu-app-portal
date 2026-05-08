import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  enablePushToDeployAction,
  publishToAzureAction,
  retryPublishAction,
} from "./actions";
import { runPublishAttempt } from "./run-publish-attempt";

const mockGithub = vi.hoisted(() => ({
  readRepositoryTextFiles: vi.fn(),
  getBranchHead: vi.fn(),
  commitFiles: vi.fn(),
}));

const manualWorkflow = `name: Deploy to Azure App Service

on:
  workflow_dispatch:

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}
  DEPLOY_PACKAGE_PATH: release

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
`;

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/features/repositories/config", () => ({
  loadGitHubAppConfig: vi.fn(() => ({
    appId: "123",
    privateKey: "private-key",
    allowedOrgs: ["cedarville-it"],
    defaultOrg: "cedarville-it",
    defaultRepoVisibility: "private",
    installationIdsByOrg: { "cedarville-it": "456" },
  })),
}));

vi.mock("@/features/repositories/github-app", () => ({
  createGitHubAppClient: vi.fn(() => mockGithub),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    appRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    publishAttempt: {
      create: vi.fn(),
    },
  },
}));

vi.mock("./run-publish-attempt", () => ({
  runPublishAttempt: vi.fn(),
}));

describe("publishing actions", () => {
  const consoleInfo = vi
    .spyOn(console, "info")
    .mockImplementation(() => undefined);
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    consoleInfo.mockClear();
    consoleError.mockClear();
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.appRequest.updateMany).mockReset();
    vi.mocked(prisma.publishAttempt.create).mockReset();
    mockGithub.readRepositoryTextFiles.mockReset();
    mockGithub.getBranchHead.mockReset();
    mockGithub.commitFiles.mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(runPublishAttempt).mockReset();
    vi.mocked(runPublishAttempt).mockResolvedValue(undefined);
    vi.mocked(createGitHubAppClient).mockClear();
    mockGithub.readRepositoryTextFiles.mockResolvedValue({
      ".github/workflows/deploy-azure-app-service.yml": manualWorkflow,
    });
    mockGithub.getBranchHead.mockResolvedValue({ sha: "head-sha" });
    mockGithub.commitFiles.mockResolvedValue({ commitSha: "commit-sha" });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      if (typeof callback !== "function") {
        throw new Error("Unexpected batch transaction in test.");
      }

      return callback(prisma);
    });
    vi.mocked(prisma.appRequest.updateMany).mockResolvedValue({ count: 1 });
  });

  it("rejects publish requests for missing or unauthorized app requests", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(publishToAzureAction("request-123")).rejects.toThrow(
      "App request not found.",
    );
  });

  it("queues a publish attempt for a ready managed repo", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-123",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);

    await publishToAzureAction("request-123");

    expect(prisma.publishAttempt.create).toHaveBeenCalledWith({
      data: {
        appRequestId: "request-123",
        status: "QUEUED",
        stage: "QUEUED",
      },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.appRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        userId: "user-123",
        repositoryStatus: "READY",
        publishStatus: { in: ["NOT_STARTED", "SUCCEEDED"] },
      },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });
  });

  it("rejects imported app publish requests before repository preparation is committed", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryImport: {
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(publishToAzureAction("request-123")).rejects.toThrow(
      "Imported app repository preparation must be committed before publishing.",
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.publishAttempt.create).not.toHaveBeenCalled();
    expect(runPublishAttempt).not.toHaveBeenCalled();
  });

  it("starts the publish worker after queueing an attempt", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-123",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);
    vi.mocked(runPublishAttempt).mockResolvedValue(undefined);

    await publishToAzureAction("request-123");

    expect(runPublishAttempt).toHaveBeenCalledWith("attempt-123");
  });

  it("logs publish worker queueing and background completion", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-123",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);
    vi.mocked(runPublishAttempt).mockResolvedValue(undefined);

    await publishToAzureAction("request-123");
    await Promise.resolve();

    expect(consoleInfo).toHaveBeenCalledWith("[publish-worker]", "queued", {
      requestId: "request-123",
      publishAttemptId: "attempt-123",
    });
    expect(consoleInfo).toHaveBeenCalledWith("[publish-worker]", "started", {
      publishAttemptId: "attempt-123",
    });
    expect(consoleInfo).toHaveBeenCalledWith("[publish-worker]", "completed", {
      publishAttemptId: "attempt-123",
    });
  });

  it("starts the publish worker even when requested audit logging fails", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-123",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);
    vi.mocked(recordAuditEvent).mockRejectedValue(new Error("audit offline"));
    vi.mocked(runPublishAttempt).mockResolvedValue(undefined);

    await expect(publishToAzureAction("request-123")).resolves.toBeUndefined();

    expect(runPublishAttempt).toHaveBeenCalledWith("attempt-123");
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record publish requested audit event.",
      expect.any(Error),
    );
  });

  it("starts the publish worker without awaiting long-running deployment", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-123",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);
    vi.mocked(runPublishAttempt).mockRejectedValue(
      new Error("background deployment failed"),
    );

    await expect(publishToAzureAction("request-123")).resolves.toBeUndefined();
    await Promise.resolve();

    expect(runPublishAttempt).toHaveBeenCalledWith("attempt-123");
    expect(consoleError).toHaveBeenCalledWith(
      "[publish-worker]",
      "failed after queueing",
      {
        publishAttemptId: "attempt-123",
        error: expect.any(Error),
      },
    );
  });

  it("queues and starts a new publish attempt for a succeeded request", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-789",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);
    vi.mocked(runPublishAttempt).mockResolvedValue(undefined);

    await publishToAzureAction("request-123");

    expect(prisma.appRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        userId: "user-123",
        repositoryStatus: "READY",
        publishStatus: { in: ["NOT_STARTED", "SUCCEEDED"] },
      },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });
    expect(runPublishAttempt).toHaveBeenCalledWith("attempt-789");
  });

  it("does not create or start a duplicate publish attempt for stale status", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.appRequest.updateMany).mockResolvedValue({ count: 0 });

    await expect(publishToAzureAction("request-123")).rejects.toThrow(
      "Publish request is already queued or running.",
    );

    expect(prisma.publishAttempt.create).not.toHaveBeenCalled();
    expect(runPublishAttempt).not.toHaveBeenCalled();
  });

  it("creates a new queued attempt when retrying a failed publish", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "FAILED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-456",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);

    await retryPublishAction("request-123");

    expect(prisma.publishAttempt.create).toHaveBeenCalled();
    expect(prisma.appRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        userId: "user-123",
        repositoryStatus: "READY",
        publishStatus: { in: ["FAILED"] },
      },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "PUBLISH_REQUESTED",
      expect.objectContaining({
        requestId: "request-123",
        publishAttemptId: "attempt-456",
      }),
    );
    expect(runPublishAttempt).toHaveBeenCalledWith("attempt-456");
  });

  it("rejects push-to-deploy before a successful publish", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(enablePushToDeployAction("request-123")).rejects.toThrow(
      "Push-to-deploy can only be enabled after a successful publish.",
    );

    expect(mockGithub.readRepositoryTextFiles).not.toHaveBeenCalled();
  });

  it("rejects push-to-deploy for imported repositories", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(enablePushToDeployAction("request-123")).rejects.toThrow(
      "Push-to-deploy is only available for generated template apps.",
    );

    expect(mockGithub.readRepositoryTextFiles).not.toHaveBeenCalled();
  });

  it("commits a push trigger to the managed repository workflow", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      deploymentTriggerMode: "PORTAL_DISPATCH",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await enablePushToDeployAction("request-123");

    expect(createGitHubAppClient).toHaveBeenCalledWith({
      appId: "123",
      privateKey: "private-key",
      installationId: "456",
    });
    expect(mockGithub.readRepositoryTextFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      ref: "main",
      paths: [".github/workflows/deploy-azure-app-service.yml"],
    });
    expect(mockGithub.getBranchHead).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      branch: "main",
    });
    expect(mockGithub.commitFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      branch: "main",
      message: "Enable push-to-deploy",
      expectedHeadSha: "head-sha",
      files: {
        ".github/workflows/deploy-azure-app-service.yml": expect.stringContaining(
          "push:\n    branches:\n      - main",
        ),
      },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: {
        deploymentTriggerMode: "PUSH_TO_DEPLOY",
        publishErrorSummary: null,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "PUSH_TO_DEPLOY_ENABLED",
      expect.objectContaining({
        requestId: "request-123",
        repository: "cedarville-it/campus-dashboard",
        commitSha: "commit-sha",
      }),
    );
  });

  it("refuses to overwrite unrecognized workflow content", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      deploymentTriggerMode: "PORTAL_DISPATCH",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    mockGithub.readRepositoryTextFiles.mockResolvedValue({
      ".github/workflows/deploy-azure-app-service.yml": "name: Custom\n",
    });

    await expect(enablePushToDeployAction("request-123")).rejects.toThrow(
      "Deployment workflow is not a recognized portal-managed Azure workflow.",
    );

    expect(mockGithub.commitFiles).not.toHaveBeenCalled();
    expect(prisma.appRequest.update).not.toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: expect.objectContaining({
        deploymentTriggerMode: "PUSH_TO_DEPLOY",
      }),
    });
  });
});
