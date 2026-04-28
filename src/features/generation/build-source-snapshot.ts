import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import {
  buildDeploymentManifest,
  type DeploymentManifestInput,
} from "./deployment-manifest";
import { buildInstructionFiles } from "./instruction-files";
import { renderTemplateString } from "./render-template";
import { buildTokenMap } from "./token-replacements";
import { getTemplateBySlug } from "@/features/templates/catalog";

type TemplateManifest = {
  slug: string;
  version: string;
  entryFiles: string[];
  generatedFiles: string[];
};

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

function assertTemplateManifestMatchesCatalog(
  templateSlug: string,
  manifest: TemplateManifest,
) {
  const template = getTemplateBySlug(templateSlug);

  if (!template) {
    throw new Error(`Template "${templateSlug}" not found in catalog.`);
  }

  if (manifest.slug !== template.slug) {
    throw new Error(
      `Template manifest slug "${manifest.slug}" does not match catalog slug "${template.slug}".`,
    );
  }

  if (manifest.version !== template.version) {
    throw new Error(
      `Template manifest version "${manifest.version}" does not match catalog version "${template.version}".`,
    );
  }
}

function buildGeneratedTemplateFiles(
  input: CreateAppRequestInput,
): Record<string, string> {
  const instructionFiles = buildInstructionFiles(input);
  const {
    "docs/github-setup.md": githubSetup,
    "docs/deployment-guide.md": deploymentGuide,
  } = instructionFiles;

  if (input.hostingTarget !== "Azure App Service") {
    throw new Error(
      `Deployment manifest generation requires "Azure App Service" hosting, received "${input.hostingTarget}".`,
    );
  }

  const deploymentInput = input as DeploymentManifestInput;
  const deploymentManifest = `${JSON.stringify(
    buildDeploymentManifest(deploymentInput),
    null,
    2,
  )}\n`;

  return {
    "docs/github-setup.md": githubSetup,
    "docs/deployment-guide.md": deploymentGuide,
    "app-portal/deployment-manifest.json": deploymentManifest,
  };
}

export async function buildSourceSnapshot(
  input: CreateAppRequestInput,
): Promise<Record<string, string>> {
  const tokens = buildTokenMap(input);
  const manifest = await loadTemplateManifest(input.templateSlug);
  assertTemplateManifestMatchesCatalog(input.templateSlug, manifest);
  const generatedTemplateFiles = buildGeneratedTemplateFiles(input);
  const templateRoot = path.join(
    process.cwd(),
    "templates",
    input.templateSlug,
    "files",
  );
  const files: Record<string, string> = {};

  for (const entryFile of manifest.entryFiles) {
    const sourcePath = path.join(templateRoot, entryFile);
    const source = await readFile(sourcePath, "utf8");
    files[stripTemplateExtension(entryFile)] = renderTemplateString(
      source,
      tokens,
    );
  }

  for (const filePath of manifest.generatedFiles) {
    const content = generatedTemplateFiles[filePath];

    if (content === undefined) {
      throw new Error(
        `Missing generated archive content for "${filePath}" in template "${input.templateSlug}".`,
      );
    }

    files[filePath] = content;
  }

  return files;
}
