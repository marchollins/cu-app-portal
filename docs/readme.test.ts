import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README", () => {
  it("documents local setup and key scripts", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("npm run dev");
    expect(readme).toContain("Microsoft Entra ID");
    expect(readme).toContain(
      "add an existing compatible GitHub app repository",
    );
    expect(readme).toContain("review PR");
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

  it("documents add existing app setup constraints", () => {
    const setup = readFileSync("docs/portal/setup.md", "utf8");

    expect(setup).toContain("### Add Existing App");
    expect(setup).toContain("same GitHub App configuration");
    expect(setup).toContain("public GitHub access");
    expect(setup).toContain("no user GitHub OAuth");
    expect(setup).toContain("short-lived GitHub App installation token");
    expect(setup).toContain("repository creation permission");
    expect(setup).toContain("npm run build");
    expect(setup).toContain("Azure App Service Node 24");
  });
});
