import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/portal";

const isValidateCommand = process.argv.slice(2).includes("validate");

if (isValidateCommand && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
});
