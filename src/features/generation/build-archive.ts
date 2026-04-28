import JSZip from "jszip";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { buildSourceSnapshot } from "./build-source-snapshot";

function toSlug(value: string) {
  return (
    value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "") || "app"
  );
}

function toArchiveFilename(appName: string) {
  return `${toSlug(appName)}.zip`;
}

export async function buildArchive(input: CreateAppRequestInput) {
  const zip = new JSZip();
  const files = await buildSourceSnapshot(input);

  for (const [filePath, content] of Object.entries(files)) {
    zip.file(filePath, content);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return {
    buffer,
    files,
    filename: toArchiveFilename(input.appName),
  };
}
