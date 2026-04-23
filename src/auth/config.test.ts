import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordAuditEventMock = vi.hoisted(() => vi.fn());
const prismaUserUpsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      upsert: prismaUserUpsertMock,
    },
  },
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
    prismaUserUpsertMock.mockReset();
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

  it("leaves session user id undefined when token.userId is missing", async () => {
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
    prismaUserUpsertMock.mockResolvedValueOnce({ id: "user-123" });
    recordAuditEventMock.mockRejectedValueOnce(new Error("audit sink down"));

    const { authConfig } = await import("./config");
    const config = await authConfig();

    await expect(
      config.callbacks?.signIn?.({
        user: { email: "staff@cedarville.edu", name: "Portal Staff" },
        account: { provider: "microsoft-entra-id" },
        profile: { oid: "entra-oid" },
      } as never),
    ).resolves.toBe(true);
  });

  it("allows authorized requests in e2e bypass mode", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("E2E_AUTH_BYPASS", "true");

    const { authConfig } = await import("./config");
    const config = await authConfig();

    await expect(
      config.callbacks?.authorized?.({
        auth: null,
      } as never),
    ).resolves.toBe(true);
  });

  it("syncs authenticated users into the local database", async () => {
    prismaUserUpsertMock.mockResolvedValueOnce({ id: "user-123" });

    const { authConfig } = await import("./config");
    const config = await authConfig();
    const user = { email: "staff@cedarville.edu", name: "Portal Staff" };

    await expect(
      config.callbacks?.signIn?.({
        user,
        account: { provider: "microsoft-entra-id" },
        profile: { oid: "entra-oid" },
      } as never),
    ).resolves.toBe(true);

    expect(prismaUserUpsertMock).toHaveBeenCalledWith({
      where: { entraOid: "entra-oid" },
      update: {
        email: "staff@cedarville.edu",
        displayName: "Portal Staff",
      },
      create: {
        entraOid: "entra-oid",
        email: "staff@cedarville.edu",
        displayName: "Portal Staff",
      },
    });
  });

  it("stores the local user id in the session token", async () => {
    const { authConfig } = await import("./config");
    const config = await authConfig();

    const token = await config.callbacks?.jwt?.({
      token: {},
      user: { id: "user-123" },
      profile: { oid: "entra-oid" },
    } as never);

    const session = await config.callbacks?.session?.({
      session: { user: {} },
      token,
    } as never);

    expect(token?.userId).toBe("user-123");
    expect(session?.user?.id).toBe("user-123");
    expect(session?.user?.entraOid).toBe("entra-oid");
  });
});
