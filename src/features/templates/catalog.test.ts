import { describe, expect, it } from "vitest";
import { getActiveTemplates } from "./catalog";

describe("getActiveTemplates", () => {
  it("returns at least one active template", () => {
    const templates = getActiveTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]?.slug).toBe("web-app");
  });
});
