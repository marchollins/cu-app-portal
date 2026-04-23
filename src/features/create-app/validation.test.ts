import { describe, expect, it } from "vitest";
import { createAppSchema } from "./validation";

describe("createAppSchema", () => {
  it("accepts valid form input", () => {
    const result = createAppSchema.safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a blank app name", () => {
    const result = createAppSchema.safeParse({
      appName: "",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });

    expect(result.success).toBe(false);
  });
});
