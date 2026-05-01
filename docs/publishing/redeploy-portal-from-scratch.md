# Redeploy the Portal from Scratch

This runbook rebuilds the Cedarville App Portal production environment from an empty Azure App Service deployment. It covers the portal app itself, the GitHub Actions deployment path, the custom domain, and the runtime configuration needed for portal-managed publishing of generated user apps.

Do not store real passwords, client secrets, private keys, publish profiles, or PostgreSQL connection strings in this repository. Use this document for names, IDs, settings, and procedures; store secret values in Azure App Service app settings, GitHub Actions secrets, and the Cedarville credential vault.

## Current Production Values

| Item | Value |
| --- | --- |
| Azure tenant | `81c32413-015d-4ba8-a93b-e1c28e355738` |
| Azure subscription | `33e13fd4-7e2f-4be5-a1ec-c4ae6e1c1ecc` |
| Subscription name | `TechPros-PAYG` |
| GitHub repo | `marchollins/cu-app-portal` |
| Production origin | `https://portal.apps.cedarville.edu` |
| Azure default origin | `https://cu-app-portal.azurewebsites.net` |
| Portal resource group | `rg-cu-app-portal` |
| Portal App Service plan | `asp-cu-app-portal-s1` |
| Portal web app | `cu-app-portal` |
| Portal PostgreSQL server | `psql-cu-app-portal-260424` |
| Portal PostgreSQL database | `cu-app-portal` |
| Portal PostgreSQL admin user | `portaladmin` |
| Portal runtime stack | `NODE\|24-lts` |
| Portal startup command | `npm run prisma:migrate:deploy && npm start` |
| Portal Entra app client id | `c5220099-29e1-4fea-98d6-a12515273fee` |
| Portal Entra app object id | `7b221388-d4bf-404a-a629-be18e12dd7c0` |
| Portal GitHub Actions app client id | `eefddd13-e7b9-4c90-b177-2f9a54ed86f5` |
| Portal GitHub Actions app object id | `20270c30-4c60-4d9b-9471-8ce469edd19e` |
| Portal GitHub Actions service principal object id | `8b3e64df-5f37-429e-881e-07604c88ff1f` |

Generated user apps use shared Azure resources:

| Item | Value |
| --- | --- |
| Shared generated-app resource group | `rg-cu-apps-published` |
| Shared generated-app App Service plan | `asp-cu-apps-published` |
| Shared generated-app PostgreSQL server | `psql-cu-apps-published` |
| Shared generated-app PostgreSQL FQDN | `psql-cu-apps-published.postgres.database.azure.com` |
| Shared generated-app PostgreSQL admin user | `portaladmin` |
| Publisher app client id | `85df2d54-5260-4140-acea-d9d0c5507e22` |
| Publisher app object id | `56000250-5cdc-4046-8345-2095c97116b5` |
| Publisher service principal object id | `acc48db2-3374-4f50-85a8-45d6d4481c7e` |
| Shared generated-app auth client id | `e056b3c9-5ab7-45dc-b2ee-a56729d84c0b` |
| Shared generated-app auth object id | `6744142c-5bdc-4594-9f06-3d07efa3c45a` |
| GitHub App name | `portal-repo-deployer` |
| GitHub App id | `3534692` |
| GitHub App installation id | `127879357` |
| Generated repo org | `cu-app-portal-repos` |
| Generated repo visibility | `private` |

## Required Operator Access

The operator needs:

- Azure CLI access to subscription `33e13fd4-7e2f-4ba8-a93b-e1c28e355738`.
- Permission to create resource groups, App Service plans, web apps, PostgreSQL flexible servers, role assignments, and app registrations.
- Permission to grant Microsoft Graph tenant admin consent, or an Entra admin available to do that step.
- GitHub admin access to `marchollins/cu-app-portal`.
- GitHub organization/admin access to install `portal-repo-deployer` on `cu-app-portal-repos`.
- DNS access for `apps.cedarville.edu` if the custom domain must be recreated.

Local tools:

```bash
az --version
gh --version
git --version
node --version
npm --version
```

Authenticate before starting:

```bash
az login --tenant 81c32413-015d-4ba8-a93b-e1c28e355738
az account set --subscription 33e13fd4-7e2f-4be5-a1ec-c4ae6e1c1ecc
gh auth login
```

## Secret Inventory

Collect or generate these values before setting App Service configuration. Keep them out of source control.

| Secret | Where it is used |
| --- | --- |
| Portal PostgreSQL admin password | `DATABASE_URL` for the portal web app |
| Portal `AUTH_SECRET` | Portal Auth.js session signing |
| Portal Entra client secret | `AUTH_MICROSOFT_ENTRA_ID_SECRET` for portal sign-in |
| Portal GitHub Actions OIDC identity client id | GitHub secret `AZURE_CLIENT_ID` |
| Publisher app client secret | Portal App Service `AZURE_CLIENT_SECRET` for `DefaultAzureCredential` |
| Shared generated-app PostgreSQL admin password | Portal App Service `AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD` |
| Shared generated-app `AUTH_SECRET` | Portal App Service `AZURE_PUBLISH_AUTH_SECRET`; copied to generated apps |
| Shared generated-app Entra client secret | Portal App Service `AZURE_PUBLISH_ENTRA_CLIENT_SECRET`; copied to generated apps |
| GitHub App private key | Portal App Service `GITHUB_APP_PRIVATE_KEY` |

Generate Auth.js secrets with:

```bash
openssl rand -base64 32
```

Create or rotate an Entra app client secret with:

```bash
az ad app credential reset \
  --id <app-client-id> \
  --append \
  --display-name "<purpose-and-date>" \
  --years 1 \
  --query password \
  --output tsv
```

## Recreate Portal Azure Resources

Use the values in `app-portal/deployment-manifest.json` as authoritative defaults.

```bash
az group create \
  --name rg-cu-app-portal \
  --location eastus2

az postgres flexible-server create \
  --resource-group rg-cu-app-portal \
  --location eastus2 \
  --name psql-cu-app-portal-260424 \
  --admin-user portaladmin \
  --admin-password "<portal-postgres-admin-password>" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --public-access 0.0.0.0

az postgres flexible-server db create \
  --resource-group rg-cu-app-portal \
  --server-name psql-cu-app-portal-260424 \
  --database-name cu-app-portal

az appservice plan create \
  --name asp-cu-app-portal-s1 \
  --resource-group rg-cu-app-portal \
  --location eastus2 \
  --is-linux \
  --sku S1

az webapp create \
  --name cu-app-portal \
  --resource-group rg-cu-app-portal \
  --plan asp-cu-app-portal-s1 \
  --runtime "NODE|24-lts"

az webapp config set \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --linux-fx-version "NODE|24-lts" \
  --startup-file "npm run prisma:migrate:deploy && npm start"
```

## Recreate Portal Entra Sign-In

If reusing the existing app registration, verify these redirect URIs exist:

```text
https://portal.apps.cedarville.edu/api/auth/callback/microsoft-entra-id
https://cu-app-portal.azurewebsites.net/api/auth/callback/microsoft-entra-id
http://localhost:3000/api/auth/callback/microsoft-entra-id
```

If creating a new portal Entra app registration, create it as a web app registration, add those redirect URIs, create a client secret, and set:

```text
AUTH_MICROSOFT_ENTRA_ID_ID=<portal-app-client-id>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<portal-app-client-secret>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/81c32413-015d-4ba8-a93b-e1c28e355738/v2.0
```

CLI shape for an existing app:

```bash
az ad app update \
  --id c5220099-29e1-4fea-98d6-a12515273fee \
  --web-redirect-uris \
    "https://portal.apps.cedarville.edu/api/auth/callback/microsoft-entra-id" \
    "https://cu-app-portal.azurewebsites.net/api/auth/callback/microsoft-entra-id" \
    "http://localhost:3000/api/auth/callback/microsoft-entra-id"
```

## Recreate Portal GitHub Actions Deployment Identity

The portal deploy workflow uses `.github/workflows/deploy-azure-app-service.yml`, OIDC, and these GitHub repository secrets:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
```

The current portal GitHub Actions identity is:

```text
App registration: cu-app-portal-github-actions
Client id: eefddd13-e7b9-4c90-b177-2f9a54ed86f5
Service principal object id: 8b3e64df-5f37-429e-881e-07604c88ff1f
Federated credential name: github-main
Federated credential subject: repo:marchollins/cu-app-portal:ref:refs/heads/main
Role assignment: Website Contributor on /subscriptions/33e13fd4-7e2f-4be5-a1ec-c4ae6e1c1ecc/resourceGroups/rg-cu-app-portal/providers/Microsoft.Web/sites/cu-app-portal
```

If the identity must be recreated:

```bash
az ad app create --display-name cu-app-portal-github-actions
az ad sp create --id <portal-github-actions-client-id>

az ad app federated-credential create \
  --id <portal-github-actions-client-id> \
  --parameters '{
    "name": "github-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:marchollins/cu-app-portal:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

az role assignment create \
  --assignee <portal-github-actions-service-principal-object-id> \
  --role "Website Contributor" \
  --scope "/subscriptions/33e13fd4-7e2f-4ba8-a93b-e1c28e355738/resourceGroups/rg-cu-app-portal/providers/Microsoft.Web/sites/cu-app-portal"

gh secret set AZURE_CLIENT_ID --body "<portal-github-actions-client-id>"
gh secret set AZURE_TENANT_ID --body "81c32413-015d-4ba8-a93b-e1c28e355738"
gh secret set AZURE_SUBSCRIPTION_ID --body "33e13fd4-7e2f-4ba8-a93b-e1c28e355738"
```

## Recreate Shared Generated-App Azure Resources

The portal-managed publishing runtime expects the shared generated-app resource group, App Service plan, and PostgreSQL server to exist.

```bash
az group create \
  --name rg-cu-apps-published \
  --location eastus2

az appservice plan create \
  --name asp-cu-apps-published \
  --resource-group rg-cu-apps-published \
  --location eastus2 \
  --is-linux \
  --sku S1

az postgres flexible-server create \
  --resource-group rg-cu-apps-published \
  --location eastus2 \
  --name psql-cu-apps-published \
  --admin-user portaladmin \
  --admin-password "<generated-app-postgres-admin-password>" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --public-access 0.0.0.0
```

The portal creates one database per generated app later, so do not create per-app databases during portal redeploy.

## Recreate Publisher Azure Identity

The publisher app is used by the portal runtime to call Azure Resource Manager and Microsoft Graph. The current identity is:

```text
App registration: cu-apps-published-github-oidc
Client id: 85df2d54-5260-4140-acea-d9d0c5507e22
App object id: 56000250-5cdc-4046-8345-2095c97116b5
Service principal object id: acc48db2-3374-4f50-85a8-45d6d4481c7e
Azure role assignment: Contributor on rg-cu-apps-published
Microsoft Graph application permission: Application.ReadWrite.OwnedBy
```

If recreating:

```bash
az ad app create --display-name cu-apps-published-github-oidc
az ad sp create --id <publisher-client-id>

az role assignment create \
  --assignee <publisher-service-principal-object-id> \
  --role Contributor \
  --scope "/subscriptions/33e13fd4-7e2f-4ba8-a93b-e1c28e355738/resourceGroups/rg-cu-apps-published"
```

Add Microsoft Graph application permission `Application.ReadWrite.OwnedBy` to the publisher app and have an Entra admin grant tenant-wide admin consent. The Azure Portal path is:

1. Microsoft Entra admin center.
2. Identity.
3. Applications.
4. App registrations.
5. Open `cu-apps-published-github-oidc`.
6. API permissions.
7. Add a permission.
8. Microsoft Graph.
9. Application permissions.
10. Search `Application.ReadWrite.OwnedBy`.
11. Select `Manage apps that this app creates or owns`.
12. Add permissions.
13. Grant admin consent for Cedarville University.

Do not grant `Application.ReadWrite.All` unless Cedarville policy explicitly requires it.

The direct admin consent URL for the current publisher app is:

```text
https://login.microsoftonline.com/81c32413-015d-4ba8-a93b-e1c28e355738/adminconsent?client_id=85df2d54-5260-4140-acea-d9d0c5507e22
```

Add the publisher service principal as an owner of the publisher app and the shared generated-app auth registration:

```bash
az ad app owner add \
  --id <publisher-app-object-id> \
  --owner-object-id <publisher-service-principal-object-id>

az ad app owner add \
  --id <generated-app-auth-object-id> \
  --owner-object-id <publisher-service-principal-object-id>
```

Generate a publisher client secret for the portal runtime:

```bash
az ad app credential reset \
  --id <publisher-client-id> \
  --append \
  --display-name "cu-app-portal-runtime-<date>" \
  --years 1 \
  --query password \
  --output tsv
```

## Recreate Shared Generated-App Auth Registration

Portal-published generated apps share one Entra app registration for Auth.js.

Current app:

```text
Display name: cu-apps-published-auth
Client id: e056b3c9-5ab7-45dc-b2ee-a56729d84c0b
Object id: 6744142c-5bdc-4594-9f06-3d07efa3c45a
Issuer: https://login.microsoftonline.com/81c32413-015d-4ba8-a93b-e1c28e355738/v2.0
```

If recreating, create a web app registration, create a client secret, and use the new values in:

```text
AZURE_PUBLISH_ENTRA_CLIENT_ID
AZURE_PUBLISH_ENTRA_CLIENT_SECRET
AZURE_PUBLISH_ENTRA_ISSUER
AZURE_PUBLISH_ENTRA_APP_OBJECT_ID
```

Do not manually pre-create redirect URIs for every future generated app. The portal adds generated app redirect URIs automatically through Graph after the publisher app has `Application.ReadWrite.OwnedBy` admin consent and owner assignment.

## Recreate GitHub App for Managed Repositories

The portal uses a GitHub App to create generated-app repos, set Actions secrets, and dispatch workflows.

Current expected settings:

```text
Name: portal-repo-deployer
App id: 3534692
Installation id: 127879357
Installed org: cu-app-portal-repos
Repository selection: all
Default generated repo visibility: private
```

Required repository permissions:

```text
Administration: Read and write
Actions: Read and write
Contents: Read and write
Metadata: Read-only
Secrets: Read and write
Workflows: Read and write
```

After creating or reconfiguring the GitHub App:

1. Generate and download a private key.
2. Install the app on `cu-app-portal-repos`.
3. Approve updated permissions if prompted.
4. Record the app id and installation id.
5. Store the private key in the portal App Service setting `GITHUB_APP_PRIVATE_KEY`.

## Configure Portal App Settings

Build the portal database URL with `sslmode=require`:

```text
postgresql://portaladmin:<portal-postgres-admin-password>@psql-cu-app-portal-260424.postgres.database.azure.com:5432/cu-app-portal?sslmode=require
```

Set the portal App Service app settings. Use `--output none` to avoid printing secrets.

```bash
az webapp config appsettings set \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --output none \
  --settings \
    DATABASE_URL="<portal-database-url>" \
    AUTH_URL="https://portal.apps.cedarville.edu" \
    NEXTAUTH_URL="https://portal.apps.cedarville.edu" \
    AUTH_TRUST_HOST="true" \
    AUTH_SECRET="<portal-auth-secret>" \
    AUTH_MICROSOFT_ENTRA_ID_ID="<portal-auth-client-id>" \
    AUTH_MICROSOFT_ENTRA_ID_SECRET="<portal-auth-client-secret>" \
    AUTH_MICROSOFT_ENTRA_ID_ISSUER="https://login.microsoftonline.com/81c32413-015d-4ba8-a93b-e1c28e355738/v2.0" \
    NODE_ENV="production" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="false" \
    ENABLE_ORYX_BUILD="false" \
    WEBSITE_RUN_FROM_PACKAGE="1" \
    GITHUB_APP_ID="3534692" \
    GITHUB_APP_PRIVATE_KEY="<github-app-private-key>" \
    GITHUB_ALLOWED_ORGS="cu-app-portal-repos" \
    GITHUB_DEFAULT_ORG="cu-app-portal-repos" \
    GITHUB_DEFAULT_REPO_VISIBILITY="private" \
    GITHUB_APP_INSTALLATION_ID="127879357" \
    AZURE_CLIENT_ID="<publisher-client-id>" \
    AZURE_TENANT_ID="81c32413-015d-4ba8-a93b-e1c28e355738" \
    AZURE_SUBSCRIPTION_ID="33e13fd4-7e2f-4ba8-a93b-e1c28e355738" \
    AZURE_CLIENT_SECRET="<publisher-client-secret>" \
    AZURE_PUBLISH_RESOURCE_GROUP="rg-cu-apps-published" \
    AZURE_PUBLISH_APP_SERVICE_PLAN="asp-cu-apps-published" \
    AZURE_PUBLISH_POSTGRES_SERVER="psql-cu-apps-published" \
    AZURE_PUBLISH_POSTGRES_ADMIN_USER="portaladmin" \
    AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD="<generated-app-postgres-admin-password>" \
    AZURE_PUBLISH_LOCATION="eastus2" \
    AZURE_PUBLISH_RUNTIME_STACK="NODE|24-lts" \
    AZURE_PUBLISH_CLIENT_ID="<publisher-client-id>" \
    AZURE_PUBLISH_TENANT_ID="81c32413-015d-4ba8-a93b-e1c28e355738" \
    AZURE_PUBLISH_SUBSCRIPTION_ID="33e13fd4-7e2f-4ba8-a93b-e1c28e355738" \
    AZURE_PUBLISH_AUTH_SECRET="<generated-app-auth-secret>" \
    AZURE_PUBLISH_ENTRA_CLIENT_ID="<generated-app-auth-client-id>" \
    AZURE_PUBLISH_ENTRA_CLIENT_SECRET="<generated-app-auth-client-secret>" \
    AZURE_PUBLISH_ENTRA_ISSUER="https://login.microsoftonline.com/81c32413-015d-4ba8-a93b-e1c28e355738/v2.0" \
    AZURE_PUBLISH_ENTRA_APP_OBJECT_ID="<generated-app-auth-object-id>"
```

`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` are for the portal runtime's `DefaultAzureCredential`. In the current setup they use the publisher app identity.

`ARTIFACT_STORAGE_ROOT` is optional. On Azure App Service the portal defaults to `/home/artifacts`, which keeps generated ZIP artifacts outside `/home/site/wwwroot`.

## Configure the Custom Domain

DNS should point `portal.apps.cedarville.edu` at the portal App Service. For a subdomain, the usual record is:

```text
portal.apps.cedarville.edu CNAME cu-app-portal.azurewebsites.net
```

If Azure requires domain ownership validation before adding the hostname, add the TXT record Azure displays in the custom domain blade. It usually uses the `asuid.portal.apps.cedarville.edu` host name and the App Service custom domain verification ID.

After DNS is in place:

```bash
az webapp config hostname add \
  --resource-group rg-cu-app-portal \
  --webapp-name cu-app-portal \
  --hostname portal.apps.cedarville.edu

az webapp config ssl create \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --hostname portal.apps.cedarville.edu

az webapp config ssl bind \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --certificate-thumbprint "<managed-certificate-thumbprint>" \
  --ssl-type SNI
```

Restart after changing auth URLs or credential settings:

```bash
az webapp restart \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal
```

## Deploy the Portal Code

Make sure `main` contains the intended code:

```bash
git checkout main
git pull origin main
npm ci
npm test
npm run build
```

Trigger the GitHub Actions workflow:

```bash
gh workflow run deploy-azure-app-service.yml --ref main
gh run list --workflow deploy-azure-app-service.yml --limit 5
```

The workflow builds with Node 24, prepares the `release/` package, logs in to Azure via OIDC, and deploys to `cu-app-portal`.

For a brand-new portal database, seed the template catalog once after the first successful deploy and startup migration:

```bash
az webapp ssh \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal
```

Then inside the App Service shell:

```bash
cd /home/site/wwwroot
npm run prisma:seed
```

Do not add seeding to the normal startup command unless the seed script has been reviewed to be safe for every restart. The current startup command intentionally runs migrations only.

## Verification

Verify Azure configuration:

```bash
az webapp config show \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --query '{linuxFxVersion:linuxFxVersion,appCommandLine:appCommandLine,alwaysOn:alwaysOn}' \
  --output json

az webapp show \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --query '{defaultHostName:defaultHostName,hostNames:hostNames,hostNameSslStates:hostNameSslStates[].{name:name,sslState:sslState}}' \
  --output json
```

Verify the public site:

```bash
curl -sS -I https://portal.apps.cedarville.edu/
curl -sS -I https://portal.apps.cedarville.edu/create
curl -sS -D - "https://portal.apps.cedarville.edu/api/auth/signin?callbackUrl=https%3A%2F%2Fportal.apps.cedarville.edu%2Fcreate" -o /tmp/portal-signin.html
```

Expected results:

- `/` returns `200`.
- `/create` returns a redirect to `https://portal.apps.cedarville.edu/api/auth/signin?...`.
- The sign-in page returns `200` for a normal `GET`.
- No protected route redirects to `cu-app-portal.azurewebsites.net` unless that host was intentionally used.

Verify GitHub App installation permissions with an installation token or the GitHub App settings page. Required installation token permissions are:

```text
actions: write
administration: write
contents: write
metadata: read
secrets: write
workflows: write
```

Verify publisher Graph consent:

```bash
az rest \
  --method GET \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/<publisher-service-principal-object-id>/appRoleAssignments" \
  --query "value[].{resourceDisplayName:resourceDisplayName,appRoleId:appRoleId}" \
  --output json
```

The result should include Microsoft Graph app role id `18a4783c-866b-4cc7-a460-3d5e5662c884`, which is `Application.ReadWrite.OwnedBy`.

## End-to-End Publish Test

After portal sign-in works:

1. Open `https://portal.apps.cedarville.edu`.
2. Sign in with Cedarville Entra ID.
3. Create a test app.
4. Confirm the generated app request reaches the download page and has a managed GitHub repo URL.
5. Click `Publish to Azure`.
6. Confirm the portal creates or updates:
   - a PostgreSQL database on `psql-cu-apps-published`
   - a web app in `rg-cu-apps-published`
   - app settings on the generated web app
   - a generated-app redirect URI on `cu-apps-published-auth`
   - GitHub Actions secrets in the generated repo
   - a workflow run in the generated repo
7. Confirm the generated app URL loads or redirects to Microsoft Entra ID.

## Common Failure Points

`Resource not accessible by integration` from GitHub means the GitHub App installation is missing a repository permission, commonly `actions: write`, `secrets: write`, or `workflows: write`. Update the app permissions, then approve the installation changes on `cu-app-portal-repos`.

Auth redirects to `cu-app-portal.azurewebsites.net` mean `AUTH_URL` or `NEXTAUTH_URL` is stale in App Service, or the App Service needs a restart.

Azure publishing fails before creating resources when the portal runtime cannot obtain Azure credentials. Verify `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` are present on the portal App Service.

Graph redirect URI updates fail with authorization errors when the publisher app lacks `Application.ReadWrite.OwnedBy` admin consent or is not an owner of the shared generated-app auth registration.

Generated app workflow dependency errors usually mean an old generated repository still has stale template dependencies. The current template expects Node 24 and `next@15.5.15`.

If the portal app deploys but requests fail at runtime, check App Service logs and confirm migrations ran from the startup command:

```bash
az webapp log tail \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal
```
