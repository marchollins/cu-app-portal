# Cedarville App Portal

Internal portal for Cedarville staff to create a new app package from an approved template.

## What It Does

The portal signs staff in with Microsoft Entra ID, guides them through a template-backed app creation form, generates a ZIP package, and gives them a download page with GitHub and deployment instructions.

The current `web-app` template now includes an Azure-first publishing bundle for generated apps:

- a minimal Next.js starter repo skeleton
- Azure App Service publishing docs
- a generated deployment manifest
- a GitHub Actions deployment workflow
- a generated-app Codex publishing skill

## Local Setup

1. Copy `.env.example` to `.env`.
2. Configure PostgreSQL and Microsoft Entra ID values.
3. Run `npm install`.
4. Run `npm run db:up`.
5. Run `npm run prisma:migrate:deploy`.
6. Run `npm run prisma:seed`.
7. Run `npm run dev`.

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
