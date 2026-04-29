# Portal Azure Publish Runtime Design

## Overview

This design fills in the Azure runtime for the portal-managed publishing model.

The previous portal-managed publishing slice established managed GitHub repositories, publish status, and a queued publish attempt model. This design defines what happens after a user clicks `Publish to Azure`: the portal provisions app-specific Azure resources, configures GitHub Actions OIDC, triggers the generated repository workflow, and verifies the deployed app.

The v1 runtime stays intentionally narrow:

- `web-app` template only
- GitHub repositories managed by the portal
- Azure App Service on Linux
- Azure Database for PostgreSQL Flexible Server
- Node 24 LTS for generated app build and runtime

## Azure Resource Model

Portal-published user apps share a small set of Azure infrastructure and receive app-specific child resources.

Shared resources:

- resource group: `rg-cu-apps-published`
- App Service plan: `asp-cu-apps-published`
- PostgreSQL flexible server: `psql-cu-apps-published`
- publisher identity: `app-cu-apps-publisher`

Per generated app:

- one Azure Web App
- one PostgreSQL database on the shared PostgreSQL server
- app-specific App Service settings
- app-specific GitHub OIDC federated credential
- app-specific managed GitHub repository

The portal runtime should treat the shared resource names as configuration, not as values derived from a generated app manifest. The generated manifest may still carry useful app defaults, but the portal's configured publish target is authoritative for v1.

Recommended portal settings:

```txt
AZURE_PUBLISH_RESOURCE_GROUP=rg-cu-apps-published
AZURE_PUBLISH_APP_SERVICE_PLAN=asp-cu-apps-published
AZURE_PUBLISH_POSTGRES_SERVER=psql-cu-apps-published
AZURE_PUBLISH_POSTGRES_ADMIN_USER=portaladmin
AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD=<secret>
AZURE_PUBLISH_LOCATION=eastus2
AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts
AZURE_PUBLISH_CLIENT_ID=<shared publisher app client id>
AZURE_PUBLISH_TENANT_ID=<tenant id>
AZURE_PUBLISH_SUBSCRIPTION_ID=<subscription id>
```

## Naming

Per-app names must be stable, human-readable, and collision-resistant inside the shared resource group.

The portal derives a publish base name from the app slug and a short stable request id:

```txt
base: <slug>-<shortRequestId>
```

Example:

```txt
app request id: clx9abc123...
app name: Campus Dashboard
base: campus-dashboard-clx9abc1
```

Per-app names:

```txt
web app: app-campus-dashboard-clx9abc1
database: db_campus_dashboard_clx9abc1
federated credential: github-campus-dashboard-clx9abc1
```

The web app name uses Azure Web App-safe hyphenated names. The database name uses a PostgreSQL-safe underscore variant. The short request id makes two apps with the same display name publish safely.

The naming helper must apply deterministic truncation before appending the short request id so Azure resource names stay within service limits while preserving collision resistance. The short request id suffix is never truncated away.

## Tags And Ownership

Every portal-created per-app Azure resource should be tagged with:

```txt
managedBy=cu-app-portal
appRequestId=<requestId>
appName=<display app name>
templateSlug=<templateSlug>
repository=<owner>/<repo>
environment=published
ownerUserId=<portal user id>
supportReference=<supportReference>
createdBy=portal-publish-worker
```

Shared resources should be tagged with:

```txt
managedBy=cu-app-portal
environment=published
shared=true
```

For idempotency and collision protection, the critical per-app ownership pair is:

```txt
managedBy=cu-app-portal
appRequestId=<requestId>
```

If the publish worker finds an existing resource with the expected name and matching ownership tags, it may reuse and update it. If a resource exists with the same name and missing or conflicting ownership tags, publishing must fail with an operator-facing error. The portal must not silently take over unrelated resources.

## GitHub Deployment Identity

Generated app repositories deploy with GitHub Actions and Azure OpenID Connect.

The portal uses one shared Entra application/service principal for generated app deployments. That identity is scoped to `rg-cu-apps-published`, not to the whole subscription. The portal creates one federated credential per generated repository and branch.

Each generated repository receives these GitHub Actions secrets:

```txt
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
```

GitHub does not receive Azure client secrets or database credentials.

The portal itself also needs an Azure control-plane identity for provisioning resources, setting app configuration, creating or updating federated credentials, and updating the shared generated-app Entra registration. The preferred production shape is the portal App Service's managed identity with the least privileges required for the publishing resource group and the relevant app registrations. Local development may use Azure CLI authentication through the standard Azure SDK credential chain.

The generated workflow continues to build and deploy the package with `azure/login` and `azure/webapps-deploy`. It uses Node 24:

```yaml
with:
  node-version: 24
```

The Azure Web App runtime stack is:

```txt
NODE|24-lts
```

## Publish Flow

The user should not wait on the browser request for the full deployment.

Flow:

1. User clicks `Publish to Azure`.
2. Server action verifies the current user owns the app request and the managed repo is ready.
3. Server action creates a new `PublishAttempt` in `QUEUED`.
4. Worker starts orchestration for that attempt.
5. Worker derives or loads durable Azure target names from the `AppRequest`.
6. Worker ensures shared resources exist and have expected shared tags.
7. Worker creates or verifies the per-app PostgreSQL database.
8. Worker creates or verifies the per-app Azure Web App in the shared plan.
9. Worker sets Web App runtime, startup command, HTTPS-only, app settings, and tags.
10. Worker ensures the generated app redirect URI exists on the shared generated-app Entra registration.
11. Worker creates or updates the GitHub OIDC federated credential for the generated repo.
12. Worker sets generated repo Actions secrets.
13. Worker triggers the generated repo deployment workflow.
14. Worker stores GitHub workflow run metadata and moves the request to `DEPLOYING`.
15. A follow-up check polls the workflow run and verifies the published URL.
16. Portal marks the request and attempt `SUCCEEDED` or `FAILED`.

The first implementation can run the worker in-process after queuing if that is the simplest reliable path, but the data model must not assume completion is immediate. The UI should be able to show `QUEUED`, `PROVISIONING`, `DEPLOYING`, `SUCCEEDED`, and `FAILED`.

## Database Strategy

V1 uses one shared PostgreSQL flexible server and one database per generated app.

The portal stores the shared PostgreSQL admin password only in portal App Service settings:

```txt
AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD
```

The portal uses that secret to create or verify each per-app database and to build the generated app's production `DATABASE_URL`.

The generated app receives `DATABASE_URL` only through its Azure Web App application settings. The portal must not store the database password in `AppRequest`, `PublishAttempt`, or GitHub.

V1 may use the shared admin user in each app's `DATABASE_URL`. A later hardening pass can add per-app PostgreSQL users and narrower database permissions.

## Generated App Auth

Portal-published generated apps use one shared Cedarville Entra app registration for Auth.js / Microsoft Entra ID sign-in.

Recommended portal settings:

```txt
AZURE_PUBLISH_AUTH_SECRET=<shared generated app auth secret>
AZURE_PUBLISH_ENTRA_CLIENT_ID=<shared generated app registration client id>
AZURE_PUBLISH_ENTRA_CLIENT_SECRET=<shared generated app registration secret>
AZURE_PUBLISH_ENTRA_ISSUER=<shared generated app issuer>
AZURE_PUBLISH_ENTRA_APP_OBJECT_ID=<shared generated app registration object id>
```

For each generated app, the portal sets:

```txt
AUTH_SECRET
AUTH_MICROSOFT_ENTRA_ID_ID
AUTH_MICROSOFT_ENTRA_ID_SECRET
AUTH_MICROSOFT_ENTRA_ID_ISSUER
AUTH_URL
NEXTAUTH_URL
```

`AUTH_URL` and `NEXTAUTH_URL` use the generated app's current primary publish URL.

For v1, the primary publish URL is the Azure default hostname:

```txt
https://app-<slug>-<shortRequestId>.azurewebsites.net
```

The portal should automatically add this redirect URI to the shared generated-app Entra registration when permissions allow:

```txt
https://app-<slug>-<shortRequestId>.azurewebsites.net/api/auth/callback/microsoft-entra-id
```

The Graph operation is idempotent: read existing `web.redirectUris`, add the URI only when absent, and patch the application. If the portal identity lacks permission to update the app registration, publishing fails with an actionable error that includes the exact redirect URI an operator must add.

The preferred Graph permission is the narrowest workable option, such as `Application.ReadWrite.OwnedBy` with the portal or publisher identity as an owner of the shared generated-app registration. If Cedarville policy requires a broader permission, that must be explicitly documented during setup.

One shared app registration is a v1 simplification. Microsoft Entra app manifests have finite collection limits, so a future high-volume deployment may shard generated app registrations by environment or app group.

## App Service Settings

For each generated app, the portal sets at least:

```txt
DATABASE_URL=<production postgres connection string with sslmode=require>
AUTH_URL=<primary publish URL>
NEXTAUTH_URL=<primary publish URL>
AUTH_SECRET=<shared generated app auth secret>
AUTH_MICROSOFT_ENTRA_ID_ID=<shared generated app client id>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<shared generated app client secret>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=<shared generated app issuer>
NODE_ENV=production
SCM_DO_BUILD_DURING_DEPLOYMENT=false
ENABLE_ORYX_BUILD=false
WEBSITE_RUN_FROM_PACKAGE=1
```

The startup command is:

```txt
npm run prisma:migrate:deploy && npm start
```

Migrations run at app startup for v1. GitHub Actions builds and deploys only. If migrations fail, the publish attempt should eventually fail verification and surface App Service log guidance to the operator.

## Data Model

`AppRequest` owns durable publish target state:

```txt
azureResourceGroup
azureAppServicePlan
azureWebAppName
azurePostgresServer
azureDatabaseName
azureDefaultHostName
customDomain
primaryPublishUrl
publishUrl
publishStatus
```

`PublishAttempt` owns run-specific deployment evidence:

```txt
githubWorkflowRunId
githubWorkflowRunUrl
deploymentStartedAt
verifiedAt
errorSummary
```

`publishUrl` may remain as the user-facing URL on `AppRequest`; `primaryPublishUrl` is the canonical target for auth redirect and future custom-domain support. For v1, both point to the Azure default hostname URL.

## Idempotency And Retry

Provisioning must be safe to rerun.

Retry behavior:

- every retry creates a new `PublishAttempt`
- retries reuse the durable Azure names already stored on `AppRequest`
- existing portal-owned resources are updated in place
- missing resources are created
- existing resources with conflicting ownership tags fail the attempt
- web app settings, startup command, runtime, HTTPS-only, and tags are reapplied every publish
- the database is reused if present
- the GitHub federated credential is reused or updated if present
- generated repo secrets are re-set on each publish

The worker should prefer explicit state transitions and clear failure summaries over partial success claims.

## Verification

Publishing succeeds when:

1. The generated repository GitHub Actions workflow run concludes `success`.
2. The portal checks the generated app's primary publish URL.
3. The response is `200 OK` or an expected auth redirect/sign-in response.
4. The portal records the publish URL and verification timestamp.
5. The `PublishAttempt` and `AppRequest` move to `SUCCEEDED`.

Publishing fails when:

- Azure provisioning fails
- GitHub OIDC or secrets setup fails
- Entra redirect URI registration fails
- the GitHub workflow run concludes `failure`, `cancelled`, or `timed_out`
- the web app cannot be reached after a bounded retry window
- the app returns a startup or runtime failure page

V1 does not require generated apps to expose `/api/health`. A later template hardening pass can add a standard health endpoint and move verification from root URL checks to health checks.

## Custom Domain Future

Custom domains are expected in the future, but v1 publishes to the default Azure hostname.

URL fields support the upgrade path:

```txt
azureDefaultHostName=app-foo-abc123.azurewebsites.net
customDomain=null
primaryPublishUrl=https://app-foo-abc123.azurewebsites.net
```

When custom domains arrive:

```txt
customDomain=foo.apps.cedarville.edu
primaryPublishUrl=https://foo.apps.cedarville.edu
```

Auth redirect registration should use `primaryPublishUrl`. When a custom domain becomes primary, the portal adds the custom-domain callback URI and can keep or remove the Azure default callback according to Cedarville policy.

## Error Handling

The publish worker should capture a concise operator-facing `errorSummary` for every failure. The summary should avoid secrets and include the step that failed.

Examples:

- `Azure Web App app-campus-dashboard-clx9abc1 exists but is not tagged for this app request.`
- `GitHub workflow deploy-azure-app-service.yml could not be triggered for cedarville-it/campus-dashboard.`
- `Missing Microsoft Graph permission to add redirect URI https://.../api/auth/callback/microsoft-entra-id.`
- `Deployment workflow failed. See https://github.com/.../actions/runs/...`

The UI should keep the ZIP and managed repo links available even when publishing fails.

## Setup Requirements

Before portal-managed Azure publishing can work in production, operators must ensure:

- `rg-cu-apps-published` exists or the portal identity can create it
- `asp-cu-apps-published` exists or the portal identity can create it
- `psql-cu-apps-published` exists and the portal has the admin connection secret
- `app-cu-apps-publisher` exists and has appropriate rights scoped to `rg-cu-apps-published`
- the portal runtime identity can provision and configure resources in `rg-cu-apps-published`
- the portal identity can create federated credentials for the publisher app
- the portal can set generated repository Actions secrets through the GitHub App
- the shared generated-app Entra registration exists
- the portal can add redirect URIs to that registration, or operators accept the documented manual fallback

## Implementation Boundaries

In scope for the next implementation plan:

- config loader for the Azure publish runtime
- deterministic publish naming helpers
- Prisma fields for durable Azure state and workflow run metadata
- Azure runtime service with idempotent resource checks
- GitHub App client extensions for Actions secrets and workflow dispatch/run lookup
- Microsoft Graph client for redirect URI registration
- worker integration behind existing publish attempts
- UI surfacing for workflow URL, Azure URL, and failure summaries
- tests for naming, config, idempotency, queueing, and failure paths

Out of scope for the next implementation plan:

- custom domain automation
- per-app PostgreSQL users
- multi-template publishing
- non-Azure hosting targets
- user-selectable Azure resource placement
- deep health checks beyond root URL/auth redirect verification
