import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DownloadPage from "./page";

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  publishToAzureAction: vi.fn(),
  retryPublishAction: vi.fn(),
}));

vi.mock("@/features/repositories/actions", () => ({
  retryRepositoryBootstrapAction: vi.fn(),
  saveGitHubUsernameAndGrantAccessAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

afterEach(() => {
  cleanup();
});

describe("DownloadPage", () => {
  it("shows managed repo messaging instead of a manual GitHub checklist", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      appName: "Campus Dashboard",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: "GitHub access is ready for @portalstaff.",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      artifact: {
        id: "artifact-123",
      },
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_123" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /your app is ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/managed repo ready/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/create a new github repository/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download zip/i })).toHaveAttribute(
      "href",
      "/api/download/req_123",
    );
    expect(screen.getByText(/repo access granted/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /publish to azure/i }),
    ).toBeInTheDocument();
  });

  it("shows Azure publish and workflow metadata when present", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_789",
      appName: "Campus Dashboard",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: "GitHub access is ready for @portalstaff.",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "DEPLOYING",
      publishUrl: "https://custom.example.edu",
      primaryPublishUrl:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      publishErrorSummary: null,
      artifact: {
        id: "artifact-789",
      },
      publishAttempts: [
        {
          githubWorkflowRunUrl:
            "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
        },
      ],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_789" }),
      }),
    );

    expect(
      screen.getByText(/azure app: app-campus-dashboard-clx9abc1/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "https://custom.example.edu",
      }),
    ).toHaveAttribute("href", "https://custom.example.edu");
    expect(
      screen.getByRole("link", { name: /github workflow/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
    );
  });

  it("shows the stored repo bootstrap error as a repo setup note", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_456",
      appName: "Campus Dashboard",
      repositoryStatus: "FAILED",
      repositoryAccessStatus: "NOT_REQUESTED",
      repositoryAccessNote: null,
      repositoryUrl: null,
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: "No GitHub App installation is configured for org \"cedarville-it\".",
      artifact: {
        id: "artifact-456",
      },
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_456" }),
      }),
    );

    expect(screen.getByText(/repo setup failed/i)).toBeInTheDocument();
    expect(screen.getByText(/repo setup note:/i)).toBeInTheDocument();
    expect(screen.queryByText(/last publish note:/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry repo setup/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy codex handoff prompt/i }),
    ).not.toBeInTheDocument();
  });
});
