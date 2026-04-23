import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("authConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/portal");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "client-id");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "client-secret");
    vi.stubEnv(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
      "https://login.microsoftonline.com/tenant/v2.0",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses jwt sessions and microsoft entra id provider", async () => {
    const { authConfig } = await import("./config");
    const config = await authConfig();
    const [provider] = config.providers;

    expect(config.session?.strategy).toBe("jwt");
    expect(config.providers).toHaveLength(1);
    expect(provider.id).toBe("microsoft-entra-id");
  });

  it("can be imported without auth env variables", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();

    await expect(import("./config")).resolves.toBeDefined();
  });
});
