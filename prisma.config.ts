import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

function loadDotEnvFile(filename: string) {
  const filePath = join(process.cwd(), filename);

  try {
    const contents = readFileSync(filePath, "utf8");

    for (const line of contents.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Local env files are optional in some CI and test flows.
  }
}

loadDotEnvFile(".env");
loadDotEnvFile(".env.local");

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/portal";

const isValidateCommand = process.argv.slice(2).includes("validate");

if (isValidateCommand && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
});
