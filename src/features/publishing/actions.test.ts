import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { publishToAzureAction, retryPublishAction } from "./actions";
import { runPublishAttempt } from "./run-publish-attempt";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
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
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.appRequest.updateMany).mockReset();
    vi.mocked(prisma.publishAttempt.create).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(runPublishAttempt).mockReset();
    vi.mocked(runPublishAttempt).mockResolvedValue(undefined);
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

  it("starts the publish worker even when requested audit logging fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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

    consoleError.mockRestore();
  });

  it("starts the publish worker without awaiting long-running deployment", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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
      "Publish worker failed after queueing.",
      expect.any(Error),
    );

    consoleError.mockRestore();
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
});
