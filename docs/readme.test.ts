import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README", () => {
  it("documents local setup and key scripts", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("npm run dev");
    expect(readme).toContain("Microsoft Entra ID");
  });
});

describe("portal setup docs", () => {
  it("documents portal-managed azure publish runtime settings", () => {
    const setup = readFileSync("docs/portal/setup.md", "utf8");

    expect(setup).toContain("AZURE_PUBLISH_RESOURCE_GROUP");
    expect(setup).toContain("rg-cu-apps-published");
    expect(setup).toContain("AZURE_PUBLISH_RUNTIME_STACK");
    expect(setup).toContain("NODE|24-lts");
  });
});
