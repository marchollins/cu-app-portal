import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MyAppsPage from "./page";

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
      findMany: vi.fn(),
    },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

describe("MyAppsPage", () => {
  it("lists only the current user's app repo and publish states", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_123",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "READY",
        publishStatus: "FAILED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        publishUrl: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await MyAppsPage());

    expect(
      screen.getByRole("heading", { name: /my apps/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/campus dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/repo: ready/i)).toBeInTheDocument();
    expect(screen.getByText(/publish: failed/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry publish/i }),
    ).toBeInTheDocument();
  });
});
