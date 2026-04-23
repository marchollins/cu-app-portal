import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/db";
import { getActiveTemplates } from "../src/features/templates/catalog";

export function seedTemplates() {
  return getActiveTemplates().map((template) => ({
    slug: template.slug,
    name: template.name,
    description: template.description,
    version: template.version,
    status: template.status,
    inputSchema: template.fields,
    hostingOptions: [],
  }));
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
