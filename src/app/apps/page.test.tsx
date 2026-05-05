import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyAppsPage from "./page";

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  publishToAzureAction: vi.fn(),
  retryPublishAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppAction: vi.fn(),
}));

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
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
  it("renders breadcrumb links for returning home or creating another app", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    const breadcrumb = screen.getByRole("navigation", {
      name: /breadcrumb/i,
    });
    expect(within(breadcrumb).getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(breadcrumb).getByRole("link", { name: /create new app/i }),
    ).toHaveAttribute("href", "/create");
    expect(within(breadcrumb).getByText("My Apps")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

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
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        publishAttempts: [],
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
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry publish/i }),
    ).toBeInTheDocument();
  });

  it("shows Azure publish and workflow metadata for listed apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_789",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @portalstaff.",
        publishStatus: "DEPLOYING",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        publishUrl: "https://custom.example.edu",
        primaryPublishUrl:
          "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
        azureWebAppName: "app-campus-dashboard-clx9abc1",
        azureDatabaseName: "db_campus_dashboard_clx9abc1",
        publishAttempts: [
          {
            githubWorkflowRunUrl:
              "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
          },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

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
        repositoryOwner: null,
        repositoryName: null,
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        publishAttempts: [],
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
      screen.queryByRole("button", { name: /copy codex handoff prompt/i }),
    ).not.toBeInTheDocument();
  });

  it("presents scoped delete options with a manual cleanup warning", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_delete",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "SUCCEEDED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        publishUrl: "https://app-campus-dashboard.azurewebsites.net",
        primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
        azureWebAppName: "app-campus-dashboard-clx9abc1",
        azureDatabaseName: "db_campus_dashboard_clx9abc1",
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(screen.getByText(/delete app/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/delete portal record and generated zip/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/delete github repository cedarville-it\/campus-dashboard/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/delete azure deployment/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/web app app-campus-dashboard-clx9abc1/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/postgresql database db_campus_dashboard_clx9abc1/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/anything you leave unchecked must be deleted manually later/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/i understand selected resources will be deleted/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete selected resources/i }),
    ).toBeInTheDocument();
  });
});
