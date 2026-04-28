import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyAppsPage from "./page";

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
      findMany: vi.fn(),
    },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

afterEach(() => {
  cleanup();
});

describe("MyAppsPage", () => {
  it("lists only the current user's app repo and publish states", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_123",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @portalstaff.",
        publishStatus: "FAILED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        publishUrl: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(
      screen.getByRole("heading", { name: /my apps/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/campus dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/repo: ready/i)).toBeInTheDocument();
    expect(screen.getByText(/repo access: granted/i)).toBeInTheDocument();
    expect(screen.getByText(/publish: failed/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open repo in codex/i }),
    ).toHaveAttribute("href", expect.stringContaining("chatgpt.com/codex"));
    expect(
      screen.getByRole("button", { name: /retry publish/i }),
    ).toBeInTheDocument();
  });

  it("shows a repo retry action when managed repo bootstrap failed", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_456",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "FAILED",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: null,
        publishUrl: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(
      screen.getByRole("button", { name: /retry repo setup/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish to azure/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open repo in codex/i }),
    ).not.toBeInTheDocument();
  });
});
