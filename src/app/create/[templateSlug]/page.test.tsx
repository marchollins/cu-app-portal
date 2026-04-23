import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TemplatePage from "./page";

describe("TemplatePage", () => {
  it("renders the selected template form", async () => {
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
});
