import { describe, expect, it } from "vitest";
import { buildDeploymentManifest } from "./deployment-manifest";
import type { DeploymentManifestInput } from "./deployment-manifest";

describe("buildDeploymentManifest", () => {
  it("builds the supported Node/Next.js Azure App Service manifest", () => {
    const input = {
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
    } satisfies DeploymentManifestInput;

    expect(
      buildDeploymentManifest(input),
    ).toEqual({
      schemaVersion: "1.0.0",
      templateSlug: "web-app",
      runtime: {
        family: "node",
        framework: "nextjs",
      },
      hosting: {
        provider: "azure",
        service: "app-service",
      },
      deployment: {
        method: "github-actions",
      },
      defaults: {
        githubRepository: "campus-hub",
        azure: {
          resourceGroup: "rg-campus-hub",
          webApp: "campus-hub",
          database: {
            server: "psql-campus-hub",
            database: "campus-hub",
            adminUser: "portaladmin",
            sslMode: "require",
          },
        },
      },
      environments: {
        development: {
          databaseUrl:
            "postgresql://portal:portal@localhost:5432/campus-hub?schema=public",
        },
        production: {
          databaseUrlAppSetting: "DATABASE_URL",
        },
      },
      automation: {
        skillPath: ".codex/skills/publish-to-azure/SKILL.md",
      },
    });
  });

  it("includes deterministic naming defaults derived from the app name", () => {
    const input = {
      templateSlug: "web-app",
      appName: "   !!!   ",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
    } satisfies DeploymentManifestInput;

    expect(
      buildDeploymentManifest(input),
    ).toEqual({
      schemaVersion: "1.0.0",
      templateSlug: "web-app",
      runtime: {
        family: "node",
        framework: "nextjs",
      },
      hosting: {
        provider: "azure",
        service: "app-service",
      },
      deployment: {
        method: "github-actions",
      },
      defaults: {
        githubRepository: "app",
        azure: {
          resourceGroup: "rg-app",
          webApp: "app",
          database: {
            server: "psql-app",
            database: "app",
            adminUser: "portaladmin",
            sslMode: "require",
          },
        },
      },
      environments: {
        development: {
          databaseUrl:
            "postgresql://portal:portal@localhost:5432/app?schema=public",
        },
        production: {
          databaseUrlAppSetting: "DATABASE_URL",
        },
      },
      automation: {
        skillPath: ".codex/skills/publish-to-azure/SKILL.md",
      },
    });
  });
});
