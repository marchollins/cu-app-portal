# Portal Setup

This guide explains local development, required environment variables, and database setup for the Cedarville App Portal.

## Requirements

- Node.js 24+
- Docker Desktop or another local Docker runtime
- A PostgreSQL database
- Microsoft Entra ID application credentials for Cedarville SSO

## Environment Variables

Add these values to `.env` for local development:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ID`
- `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER`

Keep real secret values only in ignored local env files or managed secret
stores such as Azure App Service application settings and GitHub Actions
secrets. Do not paste real secret values into tracked docs, examples, tests,
or templates.

To enable portal-managed GitHub repository creation during the create flow, also set:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_ALLOWED_ORGS`
- `GITHUB_DEFAULT_ORG`
- `GITHUB_DEFAULT_REPO_VISIBILITY`
- `GITHUB_APP_INSTALLATION_ID` or `GITHUB_APP_INSTALLATIONS_JSON`

Notes for GitHub App setup:

- `GITHUB_APP_PRIVATE_KEY` can be stored as a multi-line PEM or as a single-line value with escaped `\n` characters.
- GitHub App private key PEM downloads should stay outside tracked files. The repo ignores common key and certificate file extensions, and `.env.example` intentionally leaves private-key fields blank.
- Use `GITHUB_APP_INSTALLATION_ID` when all generated repos target one org.
- Use `GITHUB_APP_INSTALLATIONS_JSON` when different Cedarville orgs need different installation ids, for example `{"cedarville-it":"111","cedarville-apps":"222"}`.
- `GITHUB_DEFAULT_ORG` must match one of the orgs allowed by `GITHUB_ALLOWED_ORGS`.
- The GitHub App needs enough repository administration permission to delete portal-managed repositories when a user selects GitHub deletion from `My Apps`.

### Add Existing App

The add-existing-app flow uses the same GitHub App configuration as portal-managed repository creation. In V1, the portal accepts repositories it can read through the configured GitHub App installation or through public GitHub access; there is no user GitHub OAuth or personal access token access in V1.

When a submitted repository is outside `GITHUB_DEFAULT_ORG`, the portal imports it into the default org with a short-lived GitHub App installation token and preserves the source repository history. The GitHub App needs repository creation permission in the target org, plus read access to private source repositories that are imported.

V1 supports root Node/Next apps that build with `npm run build` and run on Azure App Service Node 24. After import or scan, the portal prepares the repository for the supported Azure App Service publishing path.

### Portal-Managed Azure Publishing

To enable portal-managed Azure publishing for generated user apps, configure the portal with the shared Azure publish target and generated-app auth settings:

- `AZURE_PUBLISH_RESOURCE_GROUP=rg-cu-apps-published`
- `AZURE_PUBLISH_APP_SERVICE_PLAN=asp-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_SERVER=psql-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_ADMIN_USER`
- `AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD`
- `AZURE_PUBLISH_LOCATION`
- `AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts`
- `AZURE_PUBLISH_CLIENT_ID`
- `AZURE_PUBLISH_TENANT_ID`
- `AZURE_PUBLISH_SUBSCRIPTION_ID`
- `AZURE_PUBLISH_AUTH_SECRET`
- `AZURE_PUBLISH_ENTRA_CLIENT_ID`
- `AZURE_PUBLISH_ENTRA_CLIENT_SECRET`
- `AZURE_PUBLISH_ENTRA_ISSUER`
- `AZURE_PUBLISH_ENTRA_APP_OBJECT_ID`

Current v1 design decisions:

- Generated user apps share one Azure resource group: `rg-cu-apps-published`.
- Generated user apps share one App Service Plan: `asp-cu-apps-published`.
- Generated user apps share one PostgreSQL flexible server: `psql-cu-apps-published`.
- Each published app gets its own Azure Web App and its own PostgreSQL database on the shared server.
- `AZURE_PUBLISH_RUNTIME_STACK` is fixed to `NODE|24-lts` for the current `web-app` template runtime.

Deletion behavior:

- `My Apps` deletion is scoped. Users can delete the portal record and artifact, the managed GitHub repository, and the Azure deployment independently.
- Azure deletion removes the selected app's Azure Web App and the selected app's PostgreSQL database on the shared server.
- Azure deletion never deletes the shared PostgreSQL flexible server.
- If a user leaves GitHub or Azure unchecked while deleting the portal record, those resources must be deleted manually later because the portal record will no longer appear in `My Apps`.

#### Publishing setup repair

Repair Publishing Setup refreshes portal-managed GitHub Actions secrets and GitHub OIDC federated credentials for a target app when configured Azure, Entra, or GitHub values rotate. Repair removes or resets only the portal-managed publishing secrets and credentials for that app.

Repair does not delete repositories, dispatch deployment workflows, or delete Azure resources.

If Microsoft Graph returns `Authorization_RequestDenied`, first check whether the configured Azure or Entra credential values expired or rotated. Update those values, then run repair for the affected app. If the current values are valid and Graph still denies writes, grant the portal runtime identity permission to update shared app registration redirect URIs and publisher app federated credentials.

## Local Development Flow

1. Install dependencies with `npm install`.
2. Start PostgreSQL with `npm run db:up`.
3. Apply the schema with `npm run prisma:migrate:deploy`.
4. Seed the template catalog with `npm run prisma:seed`.
5. Start the app with `npm run dev`.

## Verification

- `npm test`
- `npm run build`
- `npm run test:e2e -- e2e/create-and-download.spec.ts`

For managed repo bootstrap verification, confirm the GitHub App is installed on the target org and then create an app through the portal. A successful request should end on the download page with a managed repo URL instead of a repository failure state.

## Notes

- Generated ZIP artifacts are written to `.artifacts/`.
- The Playwright flow uses a test-only auth bypass so the end-to-end package flow can be exercised without Cedarville SSO in local automation.
