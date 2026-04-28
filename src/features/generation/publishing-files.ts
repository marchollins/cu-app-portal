import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildPublishingFiles(input: CreateAppRequestInput) {
  return {
    "docs/publishing/azure-app-service.md": `# Publish to Azure App Service

This bundle includes the recommended portal-managed GitHub + Azure App Service path, even if your selected hosting target is ${input.hostingTarget}.

The usual flow is:

1. Let the portal create and track the managed GitHub repository.
2. Open that repo locally in Codex on your machine.
3. Let Codex clone, edit, commit, and push your changes.
4. Return to the portal and use its publish flow for Azure Database for PostgreSQL and App Service.
5. Keep local development on the localhost \`DATABASE_URL\` in \`.env.example\`.
6. Treat manual GitHub or Azure CLI work as a recovery path, not the primary workflow.

If automation gets blocked, use docs/publishing/lessons-learned.md to record what happened and what to try next.`,
    "docs/publishing/lessons-learned.md": `# Publishing Lessons Learned

The supported hosting path for this bundle is portal-managed GitHub + Azure App Service for Node/Next.js apps.

Keep this file up to date with the operational details that matter:

- which managed GitHub org and repository were created
- what the portal automation completed
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
