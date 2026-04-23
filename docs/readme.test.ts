import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README", () => {
  it("documents local setup and key scripts", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("npm run dev");
    expect(readme).toContain("Microsoft Entra ID");
  });
});
