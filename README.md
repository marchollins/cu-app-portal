# Cedarville App Portal

Internal portal for Cedarville staff to create a new app package from an approved template, track its managed GitHub repository, and move toward portal-managed Azure publishing.

## What It Does

The portal signs staff in with Microsoft Entra ID, guides them through a template-backed app creation form, generates a ZIP package, and now treats a portal-created GitHub repository as the canonical source of truth for supported publishing.

Users can also add an existing compatible GitHub app repository. If the source repository is outside the configured Cedarville GitHub org, the portal imports it into the shared org while preserving history, scans and prepares it for Node/Next Azure App Service publishing, and lets the user choose either direct publishing additions or a review PR.

The current `web-app` template now includes an Azure-first publishing bundle for generated apps:

- a minimal Next.js starter repo skeleton
- Azure App Service publishing docs
- a generated deployment manifest
- a GitHub Actions deployment workflow
- a generated-app Codex publishing skill

Portal-managed Azure publishing for generated apps uses one shared resource group, one shared App Service Plan, and one shared PostgreSQL flexible server. Each published app gets its own Azure Web App and its own PostgreSQL database on that shared server.

The `My Apps` page also supports scoped deletion. A user can delete the portal record and ZIP artifact, the managed GitHub repository, and the app-specific Azure deployment independently. Azure deletion removes the app Web App and that app's PostgreSQL database only; it does not delete the shared PostgreSQL flexible server.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Configure PostgreSQL and Microsoft Entra ID values.
3. If you want managed repo creation to run during app generation, also configure the GitHub App values in `.env`.
4. Run `npm install`.
5. Run `npm run db:up`.
6. Run `npm run prisma:migrate:deploy`.
7. Run `npm run prisma:seed`.
8. Run `npm run dev`.

## Key Scripts

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm test` runs the Vitest suite.
- `npm run test:e2e -- e2e/create-and-download.spec.ts` runs the Playwright create-and-download flow.
- `npm run prisma:seed` syncs the in-code template catalog into the database.

## Docs

- [Portal setup](docs/portal/setup.md)
- [Template authoring](docs/portal/template-authoring.md)
- [Azure publishing](docs/publishing/azure-app-service.md)
- [Portal-managed publishing design](docs/superpowers/specs/2026-04-28-portal-managed-publishing-design.md)
- [Portal Azure publish runtime design](docs/superpowers/specs/2026-04-29-portal-azure-publish-runtime-design.md)
