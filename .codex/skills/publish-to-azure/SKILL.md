---
name: publish-to-azure
description: Use when publishing this repository to Azure App Service with the local manifest, workflow, and fallback docs.
---

# Publish to Azure

Use this skill to publish the Cedarville App Portal to Azure App Service through the supported GitHub Actions path.

## Required Behavior

1. Read `app-portal/deployment-manifest.json` before choosing names, commands, or Azure resources.
2. Check that `git`, `gh`, and `az` are installed and that the current user is authenticated where required.
3. Confirm the repo state before creating or updating a GitHub repository.
4. Create or connect the GitHub repository using the manifest defaults unless the operator provides replacements.
5. Create or verify the Azure resource group, Azure Database for PostgreSQL flexible server, and Azure database described by the manifest.
6. Build the production `DATABASE_URL` from the Azure PostgreSQL server, database, admin user, and password, using `sslmode=require`.
7. Set the App Service `DATABASE_URL` app setting to the Azure database connection string while leaving local development on localhost.
8. Create or verify the App Service plan and web app described by the manifest.
9. Configure the remaining application settings documented in `docs/publishing/azure-app-service.md`.
10. Wire the `AZURE_WEBAPP_PUBLISH_PROFILE` repository secret expected by `.github/workflows/deploy-azure-app-service.yml`.
11. Prefer the GitHub Actions workflow to build the deployable package and send the built artifact to Azure App Service instead of relying on App Service to Oryx-build the raw repository.
12. Run the safest available verification after wiring deployment and report what succeeded, what still needs manual work, and where the release is blocked.
13. If `gh` or `az` cannot complete the flow, fall back to `docs/publishing/azure-app-service.md` and capture the blocked step in `docs/publishing/lessons-learned.md`.

## Notes

- Prefer the local manifest over guessed names.
- Keep development `DATABASE_URL` on localhost and put the production `DATABASE_URL` only in Azure App Service settings.
- Prefer the existing GitHub Actions workflow over inventing a second deployment path.
- Keep operator-facing updates concise and actionable.
