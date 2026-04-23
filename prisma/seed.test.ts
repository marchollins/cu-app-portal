import { describe, expect, it } from "vitest";
import { seedTemplates } from "./seed";

describe("seedTemplates", () => {
  it("returns the default web app template seed", () => {
    const rows = seedTemplates();

    expect(rows[0]?.slug).toBe("web-app");
    expect(rows[0]?.status).toBe("ACTIVE");
  });
});
