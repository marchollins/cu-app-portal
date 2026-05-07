import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyAppsPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

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

vi.mock("@/features/repository-imports/actions", () => ({
  prepareExistingAppAction: vi.fn(),
  verifyExistingAppPreparationAction: vi.fn(),
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

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

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
    expect(prisma.appRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          repositoryImport: true,
        }),
      }),
    );
  });

  it("hides publish actions for unprepared imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/cedarville-it/source-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "NEEDS_ADDITIONS",
          preparationStatus: "PENDING_USER_CHOICE",
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(
      screen.getByText(
        /azure publishing unavailable until repository preparation is committed/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish to azure/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry publish/i }),
    ).not.toBeInTheDocument();
  });

  it("shows import failure details for blocked imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import_failed",
        appName: "External Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "FAILED",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: null,
        repositoryOwner: "cedarville-it",
        repositoryName: "external-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/example/external-dashboard",
          importStatus: "FAILED",
          importErrorSummary:
            "Repository import failed while cloning source repository: fatal: repository not found",
          compatibilityStatus: "NOT_SCANNED",
          preparationStatus: "BLOCKED",
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(screen.getByText("Import: failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Import error: Repository import failed while cloning source repository: fatal: repository not found",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Preparation: blocked")).toBeInTheDocument();
  });

  it("shows conflict guidance and readiness verification for blocked imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import_conflict",
        appName: "Conflicted Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/conflicted-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "conflicted-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/example/conflicted-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "CONFLICTED",
          preparationStatus: "BLOCKED",
          preparationErrorSummary:
            "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists. The portal will not overwrite existing publishing files. Continue in Codex to inspect and merge the existing publishing files, then return to verify readiness.",
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    const conflictedCard = screen
      .getByRole("heading", { name: /conflicted dashboard/i })
      .closest("li");
    expect(conflictedCard).not.toBeNull();
    expect(
      within(conflictedCard as HTMLElement).getAllByText(
        /portal will not overwrite existing publishing files/i,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(conflictedCard as HTMLElement).getAllByText(/continue in codex/i)
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(conflictedCard as HTMLElement).getByText(
        /verify readiness here/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(conflictedCard as HTMLElement).getByRole("button", {
        name: /verify repository readiness/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows imported repository status and preparation choices", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import_choice",
        appName: "Imported Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/imported-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "imported-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/example/source-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "NEEDS_ADDITIONS",
          preparationStatus: "PENDING_USER_CHOICE",
          preparationPullRequestUrl:
            "https://github.com/cedarville-it/imported-dashboard/pull/42",
          preparationErrorSummary: "Could not update workflow file.",
        },
        publishAttempts: [],
      },
      {
        id: "req_generated",
        appName: "Generated Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "PORTAL_MANAGED_REPO",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/generated-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "generated-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: null,
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const { container } = render(await MyAppsPage());

    const importedCard = screen
      .getByRole("heading", { name: /imported dashboard/i })
      .closest("li");
    expect(importedCard).not.toBeNull();
    expect(
      within(importedCard as HTMLElement).getByText(/imported repository status/i),
    ).toBeInTheDocument();
    expect(
      within(importedCard as HTMLElement).getByText(
        "Source repo: https://github.com/example/source-dashboard",
      ),
    ).toBeInTheDocument();
    expect(
      within(importedCard as HTMLElement).getByText("Import: succeeded"),
    ).toBeInTheDocument();
    expect(
      within(importedCard as HTMLElement).getByText(
        "Compatibility: needs additions",
      ),
    ).toBeInTheDocument();
    expect(
      within(importedCard as HTMLElement).getByText(
        "Preparation: pending user choice",
      ),
    ).toBeInTheDocument();
    expect(
      within(importedCard as HTMLElement).getByRole("link", {
        name: "https://github.com/cedarville-it/imported-dashboard/pull/42",
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/cedarville-it/imported-dashboard/pull/42",
    );
    expect(
      within(importedCard as HTMLElement).getByText(
        "Preparation error: Could not update workflow file.",
      ),
    ).toBeInTheDocument();
    expect(
      within(importedCard as HTMLElement).getByRole("button", {
        name: /commit azure publishing additions/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(importedCard as HTMLElement).getByRole("button", {
        name: /open azure publishing pr/i,
      }),
    ).toBeInTheDocument();

    const modeInputs = Array.from(
      container.querySelectorAll('input[name="preparationMode"]'),
    ).map((input) => (input as HTMLInputElement).value);
    expect(modeInputs).toEqual(["DIRECT_COMMIT", "PULL_REQUEST"]);

    const generatedCard = screen
      .getByRole("heading", { name: /generated dashboard/i })
      .closest("li");
    expect(generatedCard).not.toBeNull();
    expect(
      within(generatedCard as HTMLElement).queryByText(
        /imported repository status/i,
      ),
    ).not.toBeInTheDocument();
    expect(
      within(generatedCard as HTMLElement).queryByRole("button", {
        name: /commit azure publishing additions/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("disables imported app preparation choices and shows live status while pending", async () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import_pending_buttons",
        appName: "Imported Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/imported-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "imported-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/example/source-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "NEEDS_ADDITIONS",
          preparationStatus: "PENDING_USER_CHOICE",
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByRole("button", {
        name: /committing azure publishing additions/i,
      }),
    ).toBeDisabled();
    expect(
      within(importedStatus).getByRole("button", {
        name: /opening azure publishing pr/i,
      }),
    ).toBeDisabled();
    const pendingStatuses = within(importedStatus).getAllByRole("status");
    expect(pendingStatuses).toHaveLength(2);
    expect(pendingStatuses[0]).toHaveTextContent(
      /committing azure publishing additions/i,
    );
    expect(pendingStatuses[1]).toHaveTextContent(
      /opening azure publishing pull request/i,
    );
  });

  it("shows a retry action for failed imported app preparation", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import_preparation_failed",
        appName: "Imported Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/imported-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "imported-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/example/source-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "NEEDS_ADDITIONS",
          preparationMode: "PULL_REQUEST",
          preparationStatus: "FAILED",
          preparationErrorSummary: "GitHub API rate limit exceeded.",
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const { container } = render(await MyAppsPage());

    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByText(
        "Preparation error: GitHub API rate limit exceeded.",
      ),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /retry azure publishing preparation/i,
      }),
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('input[name="preparationMode"]')).map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(["PULL_REQUEST"]);
  });

  it("shows publish actions for committed imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import_ready",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "FAILED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/cedarville-it/source-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "COMPATIBLE",
          preparationStatus: "COMMITTED",
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(
      screen.getByRole("button", { name: /retry publish/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /azure publishing unavailable until repository preparation is committed/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a verification action for imported apps with opened preparation PRs", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_import_pr",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/cedarville-it/source-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "NEEDS_ADDITIONS",
          preparationStatus: "PULL_REQUEST_OPENED",
          preparationPullRequestUrl:
            "https://github.com/cedarville-it/campus-dashboard/pull/42",
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(
      screen.getByRole("button", { name: /verify pr merge/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /commit azure publishing additions/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open azure publishing pr/i }),
    ).not.toBeInTheDocument();
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

  it("disables the scoped delete action and shows live status while pending", async () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_delete_pending",
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

    const deletePanel = screen.getByText(/delete app/i).closest("details");
    expect(deletePanel).not.toBeNull();

    expect(
      within(deletePanel as HTMLElement).getByRole("button", {
        name: /deleting selected resources/i,
      }),
    ).toBeDisabled();
    expect(
      within(deletePanel as HTMLElement).getByRole("status"),
    ).toHaveTextContent(/deleting selected resources/i);
  });
});
