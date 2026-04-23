import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { buildInstructionFiles } from "./instruction-files";
import { renderTemplateString } from "./render-template";
import { buildTokenMap } from "./token-replacements";

type TemplateManifest = {
  slug: string;
  version: string;
  entryFiles: string[];
};

function toArchiveFilename(appName: string) {
  return `${appName
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")}.zip`;
}

function stripTemplateExtension(filePath: string) {
  return filePath.endsWith(".template")
    ? filePath.slice(0, -".template".length)
    : filePath;
}

async function loadTemplateManifest(templateSlug: string) {
  const manifestPath = path.join(
    process.cwd(),
    "templates",
    templateSlug,
    "template.json",
  );
  const manifest = await readFile(manifestPath, "utf8");

  return JSON.parse(manifest) as TemplateManifest;
}

export async function buildArchive(input: CreateAppRequestInput) {
  const zip = new JSZip();
  const tokens = buildTokenMap(input);
  const manifest = await loadTemplateManifest(input.templateSlug);
  const templateRoot = path.join(
    process.cwd(),
    "templates",
    input.templateSlug,
    "files",
  );

  for (const entryFile of manifest.entryFiles) {
    const sourcePath = path.join(templateRoot, entryFile);
    const source = await readFile(sourcePath, "utf8");

    zip.file(stripTemplateExtension(entryFile), renderTemplateString(source, tokens));
  }

  const instructions = buildInstructionFiles(input);

  for (const [filePath, content] of Object.entries(instructions)) {
    zip.file(filePath, content);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return {
    buffer,
    filename: toArchiveFilename(input.appName),
  };
}
