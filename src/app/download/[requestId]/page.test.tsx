import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DownloadPage from "./page";

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  publishToAzureAction: vi.fn(),
  retryPublishAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

describe("DownloadPage", () => {
  it("shows managed repo messaging instead of a manual GitHub checklist", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      repositoryStatus: "READY",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      publishErrorSummary: null,
      artifact: {
        id: "artifact-123",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

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
      screen.queryByText(/create a new github repository/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download zip/i })).toHaveAttribute(
      "href",
      "/api/download/req_123",
    );
    expect(
      screen.getByRole("button", { name: /publish to azure/i }),
    ).toBeInTheDocument();
  });

  it("shows the stored repo bootstrap error as a repo setup note", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_456",
      repositoryStatus: "FAILED",
      repositoryUrl: null,
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      publishErrorSummary: "No GitHub App installation is configured for org \"cedarville-it\".",
      artifact: {
        id: "artifact-456",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_456" }),
      }),
    );

    expect(screen.getByText(/repo setup failed/i)).toBeInTheDocument();
    expect(screen.getByText(/repo setup note:/i)).toBeInTheDocument();
    expect(screen.queryByText(/last publish note:/i)).not.toBeInTheDocument();
  });
});
