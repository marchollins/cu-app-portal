import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildTokenMap(input: CreateAppRequestInput) {
  return {
    APP_NAME: input.appName,
    APP_DESCRIPTION: input.description,
    HOSTING_TARGET: input.hostingTarget,
  };
}
