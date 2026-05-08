import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DownloadPage from "./page";

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

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  publishToAzureAction: vi.fn(),
  retryPublishAction: vi.fn(),
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
      findFirst: vi.fn(),
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
      screen.getByRole("link", {
        name: "https://github.com/cedarville-it/campus-dashboard",
      }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/create a new github repository/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download zip/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/repo access granted/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /publish to azure/i }),
    ).toBeInTheDocument();
    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          repositoryImport: true,
        }),
      }),
    );
  });

  it("hides publish actions for unprepared imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "FAILED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "NEEDS_ADDITIONS",
        preparationStatus: "PENDING_USER_CHOICE",
      },
      artifact: {
        id: "artifact-import",
      },
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import" }),
      }),
    );

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

  it("shows imported app details even when no generated artifact exists", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_no_artifact",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        preparationStatus: "PENDING_USER_CHOICE",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_no_artifact" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /imported app details/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "https://github.com/cedarville-it/campus-dashboard",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download zip/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /azure publishing unavailable until repository preparation is committed/i,
      ),
    ).toBeInTheDocument();
    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByRole("button", {
        name: /commit azure publishing additions/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /open azure publishing pr/i,
      }),
    ).toBeInTheDocument();
  });

  it("offers a preparation PR for conflict-blocked imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_conflict",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "CONFLICTED",
        preparationStatus: "BLOCKED",
        preparationErrorSummary:
          "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists.",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const { container } = render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_conflict" }),
      }),
    );

    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByText(/Preparation: blocked/i),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /open azure publishing pr/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /verify repository readiness/i,
      }),
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('input[name="preparationMode"]')).map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(["PULL_REQUEST"]);
  });

  it("disables imported app preparation choices and shows live status while pending", async () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_pending_buttons",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "NEEDS_ADDITIONS",
        preparationStatus: "PENDING_USER_CHOICE",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_pending_buttons" }),
      }),
    );

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
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_preparation_failed",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "NEEDS_ADDITIONS",
        preparationMode: "PULL_REQUEST",
        preparationStatus: "FAILED",
        preparationErrorSummary: "GitHub API rate limit exceeded.",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const { container } = render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_preparation_failed" }),
      }),
    );

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
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_ready",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        preparationStatus: "COMMITTED",
      },
      artifact: {
        id: "artifact-import-ready",
      },
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_ready" }),
      }),
    );

    expect(
      screen.getByRole("button", { name: /publish to azure/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /azure publishing unavailable until repository preparation is committed/i,
      ),
    ).not.toBeInTheDocument();
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
    mockUseFormStatus.mockReturnValue({ pending: true });
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
    expect(screen.getByRole("link", { name: /download zip/i })).toHaveAttribute(
      "href",
      "/api/download/req_456",
    );
    expect(screen.getByText(/repo setup note:/i)).toBeInTheDocument();
    expect(screen.queryByText(/last publish note:/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retrying repo setup/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(/retrying managed repo setup/i);
    expect(
      screen.queryByRole("button", { name: /copy codex handoff prompt/i }),
    ).not.toBeInTheDocument();
  });
});
