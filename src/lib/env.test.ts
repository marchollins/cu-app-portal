import { afterEach, describe, expect, it, vi } from "vitest";

describe("loadEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the validated environment values", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/portal");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "client-id");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "client-secret");
    vi.stubEnv(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
      "https://login.microsoftonline.com/tenant/v2.0",
    );

    const { loadEnv } = await import("./env");
    const env = loadEnv({
      DATABASE_URL: "postgresql://localhost:5432/portal",
      AUTH_SECRET: "test-secret",
      AUTH_MICROSOFT_ENTRA_ID_ID: "client-id",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "client-secret",
      AUTH_MICROSOFT_ENTRA_ID_ISSUER:
        "https://login.microsoftonline.com/tenant/v2.0",
    });

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.AUTH_SECRET).toBe("test-secret");
  });
});
