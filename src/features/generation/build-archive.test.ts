import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildArchive } from "./build-archive";

describe("buildArchive", () => {
  it("creates a zip containing starter files and instruction documents", async () => {
    const archive = await buildArchive({
      templateSlug: "web-app",
      appName: "Campus <Beta>",
      description: 'Tracks {housing} and "retention".',
      hostingTarget: "Vercel",
    });

    const zip = await JSZip.loadAsync(archive.buffer);

    expect(archive.filename).toBe("campus-beta.zip");
    await expect(zip.file("README.md")?.async("string")).resolves.toContain(
      "Campus <Beta>",
    );
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain('<h1>{ "Campus <Beta>" }</h1>');
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain(
      '<p>{ "Tracks {housing} and \\"retention\\"." }</p>',
    );
    expect(zip.file("docs/github-setup.md")).toBeTruthy();
    expect(zip.file("docs/deployment-guide.md")).toBeTruthy();
  });
});
