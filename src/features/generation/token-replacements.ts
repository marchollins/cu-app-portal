import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildTokenMap(input: CreateAppRequestInput) {
  return {
    APP_NAME: input.appName,
    APP_NAME_JS: JSON.stringify(input.appName),
    APP_DESCRIPTION: input.description,
    APP_DESCRIPTION_JS: JSON.stringify(input.description),
    HOSTING_TARGET: input.hostingTarget,
  };
}
