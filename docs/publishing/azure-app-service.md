# Publish to Azure App Service

This repository supports one first-class publishing path: GitHub Actions plus Azure App Service for the Next.js portal app, backed by Azure Database for PostgreSQL.

For the active product roadmap, prefer a portal-created managed GitHub repository as the source of truth. Manual local GitHub setup is now a fallback/operator path, not the preferred future UX.

## Recommended Path

1. Review `app-portal/deployment-manifest.json`.
2. Create or connect the GitHub repository.
3. Create the Azure resource group, Azure Database for PostgreSQL flexible server, and PostgreSQL database named in the manifest.
4. Configure these App Service application settings:
   - `DATABASE_URL`
   - `AUTH_URL`
   - `NEXTAUTH_URL`
   - `AUTH_SECRET`
   - `AUTH_MICROSOFT_ENTRA_ID_ID`
   - `AUTH_MICROSOFT_ENTRA_ID_SECRET`
   - `AUTH_MICROSOFT_ENTRA_ID_ISSUER`
5. Keep local development on the localhost `DATABASE_URL` from `.env`.
6. Set the App Service `DATABASE_URL` app setting to the Azure PostgreSQL connection string with `sslmode=require`.
7. Set both `AUTH_URL` and `NEXTAUTH_URL` to the public site origin, for example `https://cu-app-portal.azurewebsites.net`, so Auth.js does not fall back to `localhost`.
8. Set the startup command in Azure App Service to `npm run prisma:migrate:deploy && npm start`.
9. Configure GitHub Actions Azure authentication with OpenID Connect.
10. Add these GitHub repository secrets:
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`
11. Push to `main` or run the GitHub Actions workflow manually.
12. Let GitHub Actions build the deployment package and send the built artifact to Azure App Service.

## Recommended Azure CLI Shape

Use values from `app-portal/deployment-manifest.json`.

Typical commands:

```bash
az group create --name rg-cu-app-portal --location eastus
az postgres flexible-server create --resource-group rg-cu-app-portal --location eastus2 --name psql-cu-app-portal-260424 --admin-user portaladmin --admin-password "replace-me" --sku-name Standard_B1ms --tier Burstable --storage-size 32 --public-access 0.0.0.0
az postgres flexible-server db create --resource-group rg-cu-app-portal --server-name psql-cu-app-portal-260424 --database-name cu-app-portal
az appservice plan create --name asp-cu-app-portal-s1 --resource-group rg-cu-app-portal --location eastus2 --is-linux --sku S1
az webapp create --name cu-app-portal --resource-group rg-cu-app-portal --plan asp-cu-app-portal-s1 --runtime "NODE|20-lts"
az webapp config set --resource-group rg-cu-app-portal --name cu-app-portal --startup-file "npm run prisma:migrate:deploy && npm start"
```

Then add the required app settings:

```bash
az webapp config appsettings set \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --settings \
  DATABASE_URL="postgresql://portaladmin:replace-me@psql-cu-app-portal-260424.postgres.database.azure.com:5432/cu-app-portal?sslmode=require" \
  AUTH_URL="https://cu-app-portal.azurewebsites.net" \
  NEXTAUTH_URL="https://cu-app-portal.azurewebsites.net" \
  AUTH_SECRET="replace-me" \
  AUTH_MICROSOFT_ENTRA_ID_ID="replace-me" \
  AUTH_MICROSOFT_ENTRA_ID_SECRET="replace-me" \
  AUTH_MICROSOFT_ENTRA_ID_ISSUER="replace-me"
```

## GitHub CLI Shortcut

If `gh` is authenticated, you can wire the Azure identity secrets without opening the GitHub UI:

```bash
gh secret set AZURE_CLIENT_ID --body "replace-me"
gh secret set AZURE_TENANT_ID --body "81c32413-015d-4ba8-a93b-e1c28e355738"
gh secret set AZURE_SUBSCRIPTION_ID --body "33e13fd4-7e2f-4be5-a1ec-c4ae6e1c1ecc"
```

Then trigger the workflow:

```bash
git push origin main
# or
gh workflow run deploy-azure-app-service.yml
```

## Verification

After deployment:

1. Open the Azure App Service URL.
2. Confirm the home page loads.
3. Confirm sign-in redirects to Microsoft Entra ID.
4. Confirm the database-backed create flow works after migrations.
5. In GitHub Actions, confirm the deploy job built the package and deployed `release/` instead of asking Azure to rebuild source.

## Notes

- This path prefers OpenID Connect for GitHub Actions and only falls back to publish-profile auth if OIDC cannot be used.
- The repo includes `package-lock.json`, so the workflow uses `npm ci`.
- The workflow deploys a built package from GitHub Actions so App Service does not need to Oryx-build the source repository on every release.
- The deployment package must include the repo `templates/` directory because the create flow reads template manifests and source files from `process.cwd()/templates/...` at runtime.
- Generated ZIP artifacts should be written to a writable directory outside `/home/site/wwwroot`; the portal defaults to `/home/artifacts` on Azure App Service and supports `ARTIFACT_STORAGE_ROOT` as an override.
- Set both `AUTH_URL` and `NEXTAUTH_URL` to the public Azure hostname in production so Auth.js does not generate `localhost` sign-in URLs.
- Minimal working baseline: the default `*.azurewebsites.net` hostname can work, but a custom production domain may still be needed if Chrome Safe Browsing distrusts the shared Azure hostname.
- Keep the production `DATABASE_URL` only in Azure App Service settings and keep local development on localhost.
- If deployment is blocked, record the exact failure in `docs/publishing/lessons-learned.md`.
