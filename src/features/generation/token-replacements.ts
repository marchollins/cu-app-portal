import type { CreateAppRequestInput } from "@/features/app-requests/types";

function toSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "app"
  );
}

export function buildTokenMap(input: CreateAppRequestInput) {
  return {
    APP_NAME: input.appName,
    APP_NAME_SLUG: toSlug(input.appName),
    APP_NAME_JS: JSON.stringify(input.appName),
    APP_DESCRIPTION: input.description,
    APP_DESCRIPTION_JS: JSON.stringify(input.description),
    HOSTING_TARGET: input.hostingTarget,
  };
}
