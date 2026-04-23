import { describe, expect, it } from "vitest";
import { prisma } from "./db";

describe("prisma", () => {
  it("exports a prisma client instance", () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
  });
});
