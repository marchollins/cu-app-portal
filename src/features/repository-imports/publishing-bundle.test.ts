import { describe, expect, it } from "vitest";
import { planPublishingBundle } from "./publishing-bundle";

describe("planPublishingBundle", () => {
  it("adds publishing files and narrow package.json changes", () => {
    const plan = planPublishingBundle({
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      files: {
        "package.json": JSON.stringify(
          {
            name: "campus-dashboard",
            scripts: { build: "next build" },
            dependencies: { next: "15.5.15" },
          },
          null,
          2,
        ),
      },
    });

    expect(Object.keys(plan.filesToWrite)).toEqual([
      "package.json",
      ".github/workflows/deploy-azure-app-service.yml",
      ".codex/skills/publish-to-azure/SKILL.md",
      "docs/publishing/azure-app-service.md",
      "docs/publishing/lessons-learned.md",
      "app-portal/deployment-manifest.json",
    ]);
    expect(JSON.parse(plan.filesToWrite["package.json"])).toMatchObject({
      scripts: { build: "next build", start: "next start" },
      engines: { node: ">=24" },
    });
    expect(
      JSON.parse(plan.filesToWrite["app-portal/deployment-manifest.json"]),
    ).toMatchObject({
      templateSlug: "imported-web-app",
      defaults: { githubRepository: "campus-dashboard" },
    });
  });

  it("does not rewrite package.json when start and engines already exist", () => {
    const packageJson = JSON.stringify(
      {
        name: "campus-dashboard",
        scripts: { build: "next build", start: "next start" },
        dependencies: { next: "15.5.15" },
        engines: { node: ">=24" },
      },
      null,
      2,
    );

    const plan = planPublishingBundle({
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      files: { "package.json": packageJson },
    });

    expect(plan.filesToWrite["package.json"]).toBeUndefined();
  });

  it("rejects existing target publishing files", () => {
    expect(() =>
      planPublishingBundle({
        appName: "Campus Dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        files: {
          "package.json": JSON.stringify({
            scripts: { build: "next build", start: "next start" },
            dependencies: { next: "15.5.15" },
          }),
          ".github/workflows/deploy-azure-app-service.yml": "name: Custom",
        },
      }),
    ).toThrow(".github/workflows/deploy-azure-app-service.yml already exists");
  });
});
