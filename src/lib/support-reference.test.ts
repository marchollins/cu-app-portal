import { describe, expect, it } from "vitest";
import { createSupportReference } from "./support-reference";

describe("createSupportReference", () => {
  it("creates a user-safe support reference string", () => {
    const value = createSupportReference(new Date("2026-04-22T10:15:30Z"));
    expect(value).toMatch(/^SUP-20260422-/);
  });
});
