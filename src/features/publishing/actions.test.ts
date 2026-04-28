import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { publishToAzureAction, retryPublishAction } from "./actions";

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
    appRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    publishAttempt: {
      create: vi.fn(),
    },
  },
}));

describe("publishing actions", () => {
  beforeEach(() => {
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.publishAttempt.create).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
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
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });
  });

  it("creates a new queued attempt when retrying a failed publish", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      repositoryStatus: "READY",
      publishStatus: "FAILED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
      id: "attempt-456",
    } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);

    await retryPublishAction("request-123");

    expect(prisma.publishAttempt.create).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "PUBLISH_REQUESTED",
      expect.objectContaining({
        requestId: "request-123",
        publishAttemptId: "attempt-456",
      }),
    );
  });
});
