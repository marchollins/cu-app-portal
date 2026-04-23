import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadEnv", () => {
  beforeEach(() => {
    vi.resetModules();
  });

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

    const { env, loadEnv } = await import("./env");

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.AUTH_SECRET).toBe("test-secret");
    expect(loadEnv()).toEqual(env);
  });

  it("rejects non-postgres database urls", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/portal");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "client-id");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "client-secret");
    vi.stubEnv(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
      "https://login.microsoftonline.com/tenant/v2.0",
    );

    const { loadEnv } = await import("./env");

    expect(() =>
      loadEnv({
        DATABASE_URL: "https://example.com:5432/portal",
        AUTH_SECRET: "test-secret",
        AUTH_MICROSOFT_ENTRA_ID_ID: "client-id",
        AUTH_MICROSOFT_ENTRA_ID_SECRET: "client-secret",
        AUTH_MICROSOFT_ENTRA_ID_ISSUER:
          "https://login.microsoftonline.com/tenant/v2.0",
      }),
    ).toThrowError(/DATABASE_URL must be a PostgreSQL connection string/);
  });
});
