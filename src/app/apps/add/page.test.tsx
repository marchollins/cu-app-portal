import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddExistingAppPage from "./page";

const mockRedirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/repository-imports/actions", () => ({
  addExistingAppAction: vi.fn(),
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { addExistingAppAction } from "@/features/repository-imports/actions";

function findElementByType(
  element: React.ReactNode,
  type: string,
): React.ReactElement | null {
  if (!React.isValidElement(element)) {
    return null;
  }

  if (element.type === type) {
    return element;
  }

  const children = React.Children.toArray(
    (element.props as { children?: React.ReactNode }).children,
  );

  for (const child of children) {
    const found = findElementByType(child, type);

    if (found) {
      return found;
    }
  }

  return null;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddExistingAppPage", () => {
  it("redirects unauthenticated users home", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue(null);

    await expect(AddExistingAppPage()).rejects.toThrow("redirect:/");
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("renders breadcrumb navigation and the repository analysis form", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    const page = await AddExistingAppPage();
    render(page);

    const breadcrumb = screen.getByRole("navigation", {
      name: /breadcrumb/i,
    });
    expect(within(breadcrumb).getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(breadcrumb).getByRole("link", { name: /my apps/i }),
    ).toHaveAttribute("href", "/apps");
    expect(
      within(breadcrumb).getByText("Add Existing App"),
    ).toHaveAttribute("aria-current", "page");

    expect(
      screen.getByRole("heading", { name: /add existing app/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "type",
      "url",
    );
    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "required",
    );
    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "placeholder",
      "https://github.com/owner/repo",
    );
    expect(screen.getByLabelText(/app name/i)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/app name/i)).toHaveAttribute("required");
    expect(screen.getByLabelText(/description/i)).toHaveAttribute("rows", "4");
    expect(
      screen.getByRole("button", { name: /analyze repository/i }),
    ).toHaveAttribute("type", "submit");

    expect(findElementByType(page, "form")?.props.action).toBe(
      addExistingAppAction,
    );
  });
});
