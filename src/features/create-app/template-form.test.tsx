import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateForm } from "./template-form";
import type { PortalTemplate } from "@/features/templates/types";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/app/create/actions", () => ({
  createAppAction: vi.fn(),
}));

const template: PortalTemplate = {
  id: "web-app-v1",
  slug: "web-app",
  name: "Web App Starter",
  description: "A Cedarville-styled web application starter.",
  version: "1.0.0",
  status: "ACTIVE",
  fields: [
    { name: "appName", label: "App Name", type: "text", required: true },
  ],
};

describe("TemplateForm", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  it("disables submit and shows progress text while generation is pending", () => {
    mockUseFormStatus.mockReturnValue({ pending: true });

    render(<TemplateForm template={template} />);

    expect(
      screen.getByRole("button", { name: /generating/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(/generating your app package/i);
  });
});
