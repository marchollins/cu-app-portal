import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildPublishingFiles(input: CreateAppRequestInput) {
  return {
    "docs/publishing/azure-app-service.md": `# Publish to Azure App Service

This bundle includes the recommended GitHub + Azure App Service path, even if your selected hosting target is ${input.hostingTarget}.

The usual flow is:

1. Keep the app in a GitHub repository.
2. Provision Azure Database for PostgreSQL and create the production database.
3. Set the App Service \`DATABASE_URL\` app setting to the Azure database connection string.
4. Keep local development on the localhost \`DATABASE_URL\` in \`.env.example\`.
5. Use GitHub Actions to deploy to Azure App Service.
6. Let Codex or the generated publish skill wire up the repo and Azure settings when possible.

If automation gets blocked, use docs/publishing/lessons-learned.md to record what happened and what to try next.`,
    "docs/publishing/lessons-learned.md": `# Publishing Lessons Learned

The supported hosting path for this bundle is GitHub + Azure App Service for Node/Next.js apps.

Keep this file up to date with the operational details that matter:

- what the automation completed
- what required manual setup
- which auth model worked for GitHub Actions
- which Azure PostgreSQL server and database names were used
- how production \`DATABASE_URL\` was wired into App Service
- any Azure permission, naming, or startup issues
- which recovery steps are safe for a non-technical user
- which issues should be escalated to a technical operator

This is the place to capture the small lessons that make the next publish easier.`,
  };
}
