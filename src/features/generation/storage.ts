import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

type ArtifactStorageEnv = Record<string, string | undefined>;

export function resolveArtifactRoot(
  env: ArtifactStorageEnv = process.env,
  cwd = process.cwd(),
) {
  if (env.ARTIFACT_STORAGE_ROOT) {
    return env.ARTIFACT_STORAGE_ROOT;
  }

  if (env.WEBSITE_SITE_NAME) {
    return join(env.HOME ?? "/home", "artifacts");
  }

  return join(cwd, ".artifacts");
}

const artifactRoot = resolveArtifactRoot();

export async function saveArtifact(filename: string, buffer: Buffer) {
  await mkdir(artifactRoot, { recursive: true });

  const storagePath = join(artifactRoot, filename);
  await writeFile(storagePath, buffer);

  return storagePath;
}

export async function loadArtifact(storagePath: string) {
  return readFile(storagePath);
}

export async function deleteArtifact(storagePath: string) {
  await rm(storagePath, { force: true });
}
