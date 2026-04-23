import { describe, expect, it, vi } from "vitest";

describe("prisma", () => {
  it("reuses the prisma client across module reloads", async () => {
    vi.resetModules();

    const first = (await import("./db")).prisma;
    vi.resetModules();
    const second = (await import("./db")).prisma;

    expect(second).toBe(first);
  });
});
