import { describe, expect, it } from "vitest";
import { createAppSchema } from "./validation";

describe("createAppSchema", () => {
  it("accepts valid form input", () => {
    const result = createAppSchema(["Azure App Service"]).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a blank app name", () => {
    const result = createAppSchema(["Azure App Service"]).safeParse({
      appName: "",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported hosting targets", () => {
    const result = createAppSchema(["Azure App Service"]).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });

    expect(result.success).toBe(false);
  });

  it("rejects app names that do not produce a usable Azure app slug", () => {
    const result = createAppSchema(["Azure App Service"]).safeParse({
      appName: "!!!",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });

    expect(result.success).toBe(false);
  });

  it("rejects app names whose Azure slug would be too long", () => {
    const result = createAppSchema(["Azure App Service"]).safeParse({
      appName: "campus-dashboard-".repeat(4),
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });

    expect(result.success).toBe(false);
  });
});
