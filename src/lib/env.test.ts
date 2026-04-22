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

    const { env, loadEnv } = await import("./env");

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.AUTH_SECRET).toBe("test-secret");
    expect(loadEnv()).toEqual(env);
  });
});
