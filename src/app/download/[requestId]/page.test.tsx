import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DownloadPage from "./page";

describe("DownloadPage", () => {
  it("shows the package-ready message and GitHub checklist", async () => {
    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_123" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /your app package is ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/create a new github repository/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download zip/i })).toHaveAttribute(
      "href",
      "/api/download/req_123",
    );
  });
});
