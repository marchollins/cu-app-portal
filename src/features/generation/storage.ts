import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const artifactRoot = join(process.cwd(), ".artifacts");

export async function saveArtifact(filename: string, buffer: Buffer) {
  await mkdir(artifactRoot, { recursive: true });

  const storagePath = join(artifactRoot, filename);
  await writeFile(storagePath, buffer);

  return storagePath;
}

export async function loadArtifact(storagePath: string) {
  return readFile(storagePath);
}
