import { describe, expect, it } from "vitest";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { buildInstructionFiles } from "./instruction-files";
import { buildPublishingFiles } from "./publishing-files";

const input = {
  templateSlug: "web-app",
  appName: "Campus Hub",
  description: "Student services portal",
  hostingTarget: "Azure App Service",
} satisfies CreateAppRequestInput;

const vercelInput = {
  templateSlug: "web-app",
  appName: "Campus Hub",
  description: "Student services portal",
  hostingTarget: "Vercel",
} satisfies CreateAppRequestInput;

describe("buildPublishingFiles", () => {
  it("returns the publishing docs for the supported GitHub and Azure App Service path", () => {
    const files = buildPublishingFiles(input);

    expect(Object.keys(files).sort()).toEqual([
      "docs/publishing/azure-app-service.md",
      "docs/publishing/lessons-learned.md",
    ]);
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "# Publish to Azure App Service",
    );
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "portal-managed GitHub + Azure App Service",
    );
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "portal create and track the managed GitHub repository",
    );
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "Codex clone, edit, commit, and push",
    );
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "Azure Database for PostgreSQL",
    );
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "dispatch the first GitHub Actions workflow run",
    );
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "enable push-to-deploy",
    );
    expect(files["docs/publishing/lessons-learned.md"]).toContain(
      "# Publishing Lessons Learned",
    );
    expect(files["docs/publishing/lessons-learned.md"]).toContain(
      "supported hosting path",
    );
    expect(files["docs/publishing/lessons-learned.md"]).toContain(
      "Azure App Service",
    );
    expect(files["docs/publishing/lessons-learned.md"]).toContain(
      "DATABASE_URL",
    );
  });

  it("keeps the Azure publishing docs truthful when the selected target is non-Azure", () => {
    const files = buildPublishingFiles(vercelInput);

    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "selected hosting target is Vercel",
    );
    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "portal-managed GitHub + Azure App Service path",
    );
    expect(files["docs/publishing/azure-app-service.md"]).not.toContain(
      "selected hosting target is Azure App Service",
    );
  });
});

describe("buildInstructionFiles", () => {
  it("includes the publishing docs and points users toward them", () => {
    const files = buildInstructionFiles(input);

    expect(Object.keys(files).sort()).toEqual([
      "docs/deployment-guide.md",
      "docs/github-setup.md",
      "docs/publishing/azure-app-service.md",
      "docs/publishing/lessons-learned.md",
    ]);
    expect(files["docs/github-setup.md"]).toContain(
      "docs/publishing/azure-app-service.md",
    );
    expect(files["docs/github-setup.md"]).toContain(
      "docs/publishing/lessons-learned.md",
    );
    expect(files["docs/deployment-guide.md"]).toContain(
      "docs/publishing/azure-app-service.md",
    );
    expect(files["docs/deployment-guide.md"]).toContain(
      "docs/publishing/lessons-learned.md",
    );
  });

  it("keeps the instruction docs truthful for a non-Azure hosting target", () => {
    const files = buildInstructionFiles(vercelInput);

    expect(files["docs/github-setup.md"]).toContain(
      "Your selected hosting target is Vercel",
    );
    expect(files["docs/github-setup.md"]).toContain(
      "recommended publishing docs in docs/publishing/",
    );
    expect(files["docs/deployment-guide.md"]).toContain(
      "Your selected hosting target is Vercel",
    );
    expect(files["docs/deployment-guide.md"]).toContain(
      "recommended GitHub + Azure App Service publishing path",
    );
  });
});
