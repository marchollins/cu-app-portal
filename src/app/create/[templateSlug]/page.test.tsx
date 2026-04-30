import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TemplatePage from "./page";

const mockNotFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("notFound");
}));

const mockGetActiveTemplateBySlug = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("@/app/create/actions", () => ({
  createAppAction: vi.fn(),
}));

vi.mock("@/features/templates/catalog", () => ({
  getActiveTemplateBySlug: mockGetActiveTemplateBySlug,
}));

describe("TemplatePage", () => {
  it("renders the selected template form", async () => {
    mockGetActiveTemplateBySlug.mockReturnValue({
      id: "web-app-v1",
      slug: "web-app",
      name: "Web App Starter",
      description:
        "A Cedarville-styled web application starter with Entra setup guidance.",
      version: "1.0.0",
      status: "ACTIVE",
      fields: [
        { name: "appName", label: "App Name", type: "text", required: true },
      ],
    });

    render(
      await TemplatePage({
        params: Promise.resolve({ templateSlug: "web-app" }),
      }),
    );
    expect(
      screen.getByRole("heading", { name: /web app starter/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/app name/i)).toBeInTheDocument();
  });

  it("treats disabled templates as not found", async () => {
    mockGetActiveTemplateBySlug.mockReturnValue(null);

    await expect(
      TemplatePage({
        params: Promise.resolve({ templateSlug: "legacy-web-app" }),
      }),
    ).rejects.toThrow("notFound");
  });

  it("treats unknown templates as not found", async () => {
    mockGetActiveTemplateBySlug.mockReturnValue(null);

    await expect(
      TemplatePage({
        params: Promise.resolve({ templateSlug: "missing" }),
      }),
    ).rejects.toThrow("notFound");
  });
});
