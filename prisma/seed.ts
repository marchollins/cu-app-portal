import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/db";
import {
  getActiveTemplates,
  serializeTemplateForStorage,
} from "../src/features/templates/catalog";

export function seedTemplates() {
  return getActiveTemplates().map(serializeTemplateForStorage);
}

export async function main() {
  for (const template of seedTemplates()) {
    await prisma.template.upsert({
      where: { slug: template.slug },
      update: template,
      create: template,
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
