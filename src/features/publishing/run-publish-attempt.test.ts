import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { runPublishAttempt } from "./run-publish-attempt";

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    publishAttempt: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appRequest: {
      update: vi.fn(),
    },
  },
}));

describe("runPublishAttempt", () => {
  beforeEach(() => {
    vi.mocked(prisma.publishAttempt.findUnique).mockReset();
    vi.mocked(prisma.publishAttempt.update).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
  });

  it("moves a queued publish attempt through provisioning, deploy, and success", async () => {
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue({
      id: "attempt-123",
      appRequestId: "request-123",
      appRequest: {
        id: "request-123",
      },
    } as Awaited<ReturnType<typeof prisma.publishAttempt.findUnique>>);

    await runPublishAttempt("attempt-123", {
      provisionInfrastructure: vi.fn().mockResolvedValue({
        azureResourceGroup: "rg-cu-apps-published",
        azureAppServicePlan: "asp-cu-apps-published",
        azureWebAppName: "app-campus-dashboard",
        azurePostgresServer: "psql-cu-apps-published",
        azureDatabaseName: "db_campus_dashboard",
        azureDefaultHostName: "campus-dashboard.azurewebsites.net",
        primaryPublishUrl: "https://campus-dashboard.azurewebsites.net",
      }),
      deployRepository: vi.fn().mockResolvedValue({
        publishUrl: "https://campus-dashboard.azurewebsites.net",
        githubWorkflowRunId: "123456789",
        githubWorkflowRunUrl:
          "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
      }),
      verifyDeployment: vi.fn().mockResolvedValue({
        verifiedAt: new Date("2026-04-30T12:00:00.000Z"),
      }),
    });

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: expect.objectContaining({
        publishStatus: "PROVISIONING",
      }),
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: expect.objectContaining({
        publishStatus: "DEPLOYING",
      }),
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: expect.objectContaining({
        publishStatus: "SUCCEEDED",
        publishUrl: "https://campus-dashboard.azurewebsites.net",
      }),
    });
  });

  it("stores durable azure target and workflow metadata when publishing succeeds", async () => {
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue({
      id: "attempt-123",
      appRequestId: "request-123",
      appRequest: {
        id: "request-123",
        azureWebAppName: "app-campus-dashboard-clx9abc1",
      },
    } as Awaited<ReturnType<typeof prisma.publishAttempt.findUnique>>);

    await runPublishAttempt("attempt-123", {
      provisionInfrastructure: vi.fn().mockResolvedValue({
        azureResourceGroup: "rg-cu-apps-published",
        azureAppServicePlan: "asp-cu-apps-published",
        azureWebAppName: "app-campus-dashboard-clx9abc1",
        azurePostgresServer: "psql-cu-apps-published",
        azureDatabaseName: "db_campus_dashboard_clx9abc1",
        azureDefaultHostName: "app-campus-dashboard-clx9abc1.azurewebsites.net",
        primaryPublishUrl:
          "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      }),
      deployRepository: vi.fn().mockResolvedValue({
        publishUrl: "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
        githubWorkflowRunId: "123456789",
        githubWorkflowRunUrl:
          "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
      }),
      verifyDeployment: vi.fn().mockResolvedValue({
        verifiedAt: new Date("2026-04-30T12:00:00.000Z"),
      }),
    });

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: expect.objectContaining({
        azureResourceGroup: "rg-cu-apps-published",
        azureAppServicePlan: "asp-cu-apps-published",
        azureWebAppName: "app-campus-dashboard-clx9abc1",
        azurePostgresServer: "psql-cu-apps-published",
        azureDatabaseName: "db_campus_dashboard_clx9abc1",
        azureDefaultHostName: "app-campus-dashboard-clx9abc1.azurewebsites.net",
        primaryPublishUrl:
          "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      }),
    });
    expect(prisma.publishAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt-123" },
      data: expect.objectContaining({
        githubWorkflowRunId: "123456789",
        githubWorkflowRunUrl:
          "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
        deploymentStartedAt: expect.any(Date),
      }),
    });
    expect(prisma.publishAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt-123" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        stage: "COMPLETED",
        verifiedAt: new Date("2026-04-30T12:00:00.000Z"),
      }),
    });
  });

  it("marks the attempt and request failed when publishing throws", async () => {
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue({
      id: "attempt-456",
      appRequestId: "request-456",
      appRequest: {
        id: "request-456",
      },
    } as Awaited<ReturnType<typeof prisma.publishAttempt.findUnique>>);

    await expect(
      runPublishAttempt("attempt-456", {
        provisionInfrastructure: vi.fn().mockRejectedValue(
          new Error("azure permission denied"),
        ),
        deployRepository: vi.fn(),
        verifyDeployment: vi.fn(),
      }),
    ).rejects.toThrow("azure permission denied");

    expect(prisma.publishAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt-456" },
      data: expect.objectContaining({
        status: "FAILED",
        stage: "FAILED",
        errorSummary: "azure permission denied",
      }),
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-456" },
      data: {
        publishStatus: "FAILED",
        publishErrorSummary: "azure permission denied",
      },
    });
  });
});
