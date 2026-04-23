import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordAuditEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

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
    recordAuditEventMock.mockReset();
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

  it("leaves session user id undefined when token.sub is missing", async () => {
    const { authConfig } = await import("./config");
    const config = await authConfig();
    const session = await config.callbacks?.session?.({
      session: { user: {} },
      token: { entraOid: "entra-oid" },
    } as never);

    expect(session?.user?.id).toBeUndefined();
    expect(session?.user?.entraOid).toBe("entra-oid");
  });

  it("keeps sign-in successful when audit logging fails", async () => {
    recordAuditEventMock.mockRejectedValueOnce(new Error("audit sink down"));

    const { authConfig } = await import("./config");
    const config = await authConfig();

    await expect(
      config.callbacks?.signIn?.({
        account: { provider: "microsoft-entra-id" },
        profile: { oid: "entra-oid" },
      } as never),
    ).resolves.toBe(true);
  });
});
