import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildArchive } from "./build-archive";
import { buildDeploymentManifest } from "./deployment-manifest";

describe("buildArchive", () => {
  it("creates a zip containing starter files and publishing bundle assets", async () => {
    const input = {
      templateSlug: "web-app",
      appName: "Campus <Beta>",
      description: 'Tracks {housing} and "retention".',
      hostingTarget: "Azure App Service",
    } as const;
    const archive = await buildArchive(input);

    const zip = await JSZip.loadAsync(archive.buffer);
    const expectedDeploymentManifest = `${JSON.stringify(
      buildDeploymentManifest(input),
      null,
      2,
    )}\n`;

    expect(archive.filename).toBe("campus-beta.zip");
    expect(zip.file("package.json")).toBeTruthy();
    expect(zip.file("tsconfig.json")).toBeTruthy();
    expect(zip.file("next-env.d.ts")).toBeTruthy();
    await expect(zip.file("README.md")?.async("string")).resolves.toContain(
      "Campus <Beta>",
    );
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"build": "next build"');
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"name": "campus-beta"');
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"next": "15.5.15"');
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"react": "19.0.0"');
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.toContain(
      "DATABASE_URL=postgresql://portal:portal@localhost:5432/campus-beta?schema=public",
    );
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain('<h1>{ "Campus <Beta>" }</h1>');
    await expect(
      zip.file("src/app/layout.tsx")?.async("string"),
    ).resolves.toContain('title: "Campus <Beta>"');
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain(
      '<p>{ "Tracks {housing} and \\"retention\\"." }</p>',
    );
    expect(zip.file("docs/github-setup.md")).toBeTruthy();
    expect(zip.file("docs/deployment-guide.md")).toBeTruthy();
    expect(zip.file("docs/publishing/azure-app-service.md")).toBeTruthy();
    expect(zip.file("docs/publishing/lessons-learned.md")).toBeTruthy();
    expect(zip.file("app-portal/deployment-manifest.json")).toBeTruthy();
    expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml"),
    ).toBeTruthy();
    expect(zip.file(".codex/skills/publish-to-azure/SKILL.md")).toBeTruthy();
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toBe(expectedDeploymentManifest);
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("Publish to Azure");
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("DATABASE_URL");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("azure/webapps-deploy");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain(
      "AZURE_WEBAPP_NAME: ${{ secrets.AZURE_WEBAPP_NAME }}",
    );
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("if [ -f package-lock.json ]; then");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("npm install");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("node-version: 24");
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"node": ">=24"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"framework": "nextjs"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"runtimeStack": "NODE|24-lts"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"server": "psql-campus-beta"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"databaseUrlAppSetting": "DATABASE_URL"');
    await expect(
      zip.file("docs/publishing/azure-app-service.md")?.async("string"),
    ).resolves.toContain("Azure Database for PostgreSQL");
    await expect(
      zip.file("docs/publishing/azure-app-service.md")?.async("string"),
    ).resolves.toContain("DATABASE_URL");
    expect(archive.files["README.md"]).toContain("Campus <Beta>");
    expect(archive.files["app-portal/deployment-manifest.json"]).toBe(
      expectedDeploymentManifest,
    );
    await expect(zip.file("README.md")?.async("string")).resolves.toBe(
      archive.files["README.md"],
    );

    const renderedWorkflow = await zip
      .file(".github/workflows/deploy-azure-app-service.yml")!
      .async("string");

    expect(renderedWorkflow).toContain(
      "AZURE_WEBAPP_NAME: ${{ secrets.AZURE_WEBAPP_NAME }}",
    );
    expect(renderedWorkflow).toContain(
      "for file in package-lock.json next.config.js next.config.mjs next.config.ts next-env.d.ts prisma.config.ts; do",
    );
    expect(renderedWorkflow).toContain("for dir in public prisma; do");
    expect(renderedWorkflow).not.toContain(
      "cp package.json package-lock.json next.config.ts next-env.d.ts prisma.config.ts",
    );

    const templateManifest = JSON.parse(
      await readFile("templates/web-app/template.json", "utf8"),
    ) as { generatedFiles: string[] };

    expect(templateManifest.generatedFiles.sort()).toEqual([
      "app-portal/deployment-manifest.json",
      "docs/deployment-guide.md",
      "docs/github-setup.md",
    ]);

    for (const generatedFile of templateManifest.generatedFiles) {
      expect(zip.file(generatedFile)).toBeTruthy();
    }

    expect(templateManifest.entryFiles).toEqual(
      expect.arrayContaining([
        "package.json.template",
        "tsconfig.json.template",
        "next-env.d.ts",
        ".github/workflows/deploy-azure-app-service.yml.template",
        ".codex/skills/publish-to-azure/SKILL.md.template",
        "docs/publishing/azure-app-service.md.template",
        "docs/publishing/lessons-learned.md.template",
        "src/app/layout.tsx.template",
      ]),
    );
  });

  it('falls back to "app.zip" when the app name normalizes to an empty slug', async () => {
    const archive = await buildArchive({
      templateSlug: "web-app",
      appName: "!!!",
      description: "Fallback filename coverage.",
      hostingTarget: "Azure App Service",
    });

    expect(archive.filename).toBe("app.zip");
  });

  it("rejects unsupported hosting targets for the Azure-first publishing bundle", async () => {
    await expect(
      buildArchive({
        templateSlug: "web-app",
        appName: "Campus Hub",
        description: "Unsupported target coverage.",
        hostingTarget: "Vercel",
      }),
    ).rejects.toThrow(
      'Deployment manifest generation requires "Azure App Service" hosting, received "Vercel".',
    );
  });
});
