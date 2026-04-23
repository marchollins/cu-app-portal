import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildInstructionFiles(input: CreateAppRequestInput) {
  return {
    "docs/github-setup.md": `# GitHub Setup

1. Create a new GitHub repository named ${input.appName}.
2. Extract this ZIP locally.
3. Commit the generated files to your repository.
4. Follow the deployment guide for ${input.hostingTarget}.`,
    "docs/deployment-guide.md": `# Deployment Guide

This package was prepared for ${input.hostingTarget}.
Review the included environment placeholders before deploying.`,
  };
}
