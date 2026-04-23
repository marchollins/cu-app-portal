import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let capturedAuthConfigFactory: ((req?: unknown) => Promise<unknown>) | undefined;

vi.mock("next-auth", () => ({
  default: vi.fn((configFactory) => {
    capturedAuthConfigFactory = configFactory;
    return { auth: vi.fn() };
  }),
}));

vi.mock("@/auth/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/config")>();

  return {
    ...actual,
    authConfig: vi.fn(actual.authConfig),
  };
});

describe("middleware protection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "client-id");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "client-secret");
    vi.stubEnv(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
      "https://login.microsoftonline.com/tenant/v2.0",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    capturedAuthConfigFactory = undefined;
  });

  it("protects create and download routes", async () => {
    const { config, middleware } = await import("./middleware");

    expect(config.matcher).toContain("/create/:path*");
    expect(config.matcher).toContain("/download/:path*");
    expect(capturedAuthConfigFactory).toBeTypeOf("function");
    expect(middleware).toBeDefined();
  });

  it("wires NextAuth to the shared auth config and authorization callback", async () => {
    const { authConfig } = await import("@/auth/config");
    await import("./middleware");

    expect(capturedAuthConfigFactory).toBeTypeOf("function");

    const config = await capturedAuthConfigFactory?.();

    expect(authConfig).toHaveBeenCalledTimes(1);

    expect(config).toMatchObject({
      session: { strategy: "jwt" },
    });
    expect((config as { callbacks?: { authorized?: Function } }).callbacks?.authorized).toBeTypeOf(
      "function",
    );
    expect(
      await (config as { callbacks: { authorized: (arg: { auth: null }) => Promise<boolean> } }).callbacks.authorized({
        auth: null,
      }),
    ).toBe(false);
  });
});
