import type { PortalTemplate } from "./types";

const templates: PortalTemplate[] = [
  {
    id: "web-app-v1",
    slug: "web-app",
    name: "Web App Starter",
    description:
      "A Cedarville-styled web application starter with Entra setup guidance.",
    version: "1.0.0",
    status: "ACTIVE",
    fields: [
      { name: "appName", label: "App Name", type: "text", required: true },
      {
        name: "description",
        label: "Short Description",
        type: "textarea",
        required: true,
      },
      {
        name: "hostingTarget",
        label: "Hosting Target",
        type: "select",
        required: true,
        options: ["Azure App Service", "Vercel", "Other"],
      },
    ],
  },
];

export function getActiveTemplates() {
  return templates.filter((template) => template.status === "ACTIVE");
}

export function getActiveTemplateBySlug(slug: string) {
  return getActiveTemplates().find((template) => template.slug === slug) ?? null;
}

export function getTemplateBySlug(slug: string) {
  return templates.find((template) => template.slug === slug) ?? null;
}

export function serializeTemplateForStorage(template: PortalTemplate) {
  return {
    slug: template.slug,
    name: template.name,
    description: template.description,
    version: template.version,
    status: template.status,
    inputSchema: template.fields,
    hostingOptions: [],
  };
}
