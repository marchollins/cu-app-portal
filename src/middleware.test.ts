import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authConfig } from "@/auth/config";

describe("middleware protection", () => {
  beforeEach(() => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = "client-id";
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET = "client-secret";
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER =
      "https://login.microsoftonline.com/tenant/v2.0";
  });

  afterEach(() => {
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
    delete process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  });

  it("denies unauthenticated requests", async () => {
    const config = await authConfig();

    await expect(
      config.callbacks?.authorized?.({
        auth: null,
      } as never),
    ).resolves.toBe(false);
  });

  it("allows authenticated requests", async () => {
    const config = await authConfig();

    await expect(
      config.callbacks?.authorized?.({
        auth: { user: { id: "user-1" } },
      } as never),
    ).resolves.toBe(true);
  });
});
