import { describe, expect, it, vi } from "vitest";

import { verifyPublishedUrl } from "./verify-deployment";

describe("verifyPublishedUrl", () => {
  it("accepts 200 responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).resolves.toEqual({ verifiedAt: expect.any(Date) });
  });

  it("accepts auth redirect responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://login.microsoftonline.com/tenant" },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).resolves.toEqual({ verifiedAt: expect.any(Date) });
  });

  it("rejects runtime error pages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("Application Error", { status: 500 }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/did not return a healthy response/);
  });

  it("checks the published URL without following redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await verifyPublishedUrl("https://app.example.test", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("https://app.example.test", {
      method: "GET",
      redirect: "manual",
    });
  });
});
