import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { buildPublishingFiles } from "./publishing-files";

export function buildInstructionFiles(input: CreateAppRequestInput) {
  return {
    ...buildPublishingFiles(input),
    "docs/github-setup.md": `# GitHub Setup

1. Create a GitHub repository for ${input.appName}.
2. Your selected hosting target is ${input.hostingTarget}.
3. This archive still includes the recommended publishing docs in docs/publishing/.
4. Start with docs/publishing/azure-app-service.md for the GitHub + Azure App Service path.
5. Use docs/publishing/lessons-learned.md for recovery notes and operational lessons.`,
    "docs/deployment-guide.md": `# Deployment Guide

Your selected hosting target is ${input.hostingTarget}, and this archive still includes the recommended GitHub + Azure App Service publishing path.
Read docs/publishing/azure-app-service.md first, then check docs/publishing/lessons-learned.md for the operational details.`,
  };
}
