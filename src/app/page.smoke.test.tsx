import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the create new app call to action", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /cedarville app portal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create new app/i }),
    ).toHaveAttribute("href", "/create");
    expect(
      screen.getByRole("link", { name: /add existing app/i }),
    ).toHaveAttribute("href", "/apps/add");
  });
});
