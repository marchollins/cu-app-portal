import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

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

export function buildArtifactReadPaths(
  storagePath: string,
  env: ArtifactStorageEnv = process.env,
) {
  const artifactRoot = resolveArtifactRoot(env);
  const fallbackPath = join(artifactRoot, basename(storagePath));

  return fallbackPath === storagePath
    ? [storagePath]
    : [storagePath, fallbackPath];
}

export async function saveArtifact(filename: string, buffer: Buffer) {
  const artifactRoot = resolveArtifactRoot();
  await mkdir(artifactRoot, { recursive: true });

  const storagePath = join(artifactRoot, filename);
  await writeFile(storagePath, buffer);

  return storagePath;
}

export async function loadArtifact(storagePath: string) {
  const candidatePaths = buildArtifactReadPaths(storagePath);
  let lastError: unknown;

  for (const candidatePath of candidatePaths) {
    try {
      return await readFile(candidatePath);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError;
}

export async function deleteArtifact(storagePath: string) {
  await rm(storagePath, { force: true });
}

export function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
