import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CreatePage from "./page";

describe("CreatePage", () => {
  it("lists active templates", async () => {
    render(await CreatePage());
    expect(
      screen.getByRole("heading", { name: /create new app/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/web app starter/i)).toBeInTheDocument();
  });
});
