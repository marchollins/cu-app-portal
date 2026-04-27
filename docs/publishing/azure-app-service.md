# Publish to Azure App Service

This repository supports one first-class publishing path: GitHub Actions plus Azure App Service for the Next.js portal app, backed by Azure Database for PostgreSQL.

## Recommended Path

1. Review `app-portal/deployment-manifest.json`.
2. Create or connect the GitHub repository.
3. Create the Azure resource group, Azure Database for PostgreSQL flexible server, and PostgreSQL database named in the manifest.
4. Configure these App Service application settings:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `AUTH_MICROSOFT_ENTRA_ID_ID`
   - `AUTH_MICROSOFT_ENTRA_ID_SECRET`
   - `AUTH_MICROSOFT_ENTRA_ID_ISSUER`
5. Keep local development on the localhost `DATABASE_URL` from `.env`.
6. Set the App Service `DATABASE_URL` app setting to the Azure PostgreSQL connection string with `sslmode=require`.
7. Set the startup command in Azure App Service to `npm run prisma:migrate:deploy && npm start`.
8. Download the App Service publish profile and save it as the GitHub repository secret `AZURE_WEBAPP_PUBLISH_PROFILE`.
9. Push to `main` or run the GitHub Actions workflow manually.
10. Let GitHub Actions build the deployment package and send the built artifact to Azure App Service.

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
  AUTH_SECRET="replace-me" \
  AUTH_MICROSOFT_ENTRA_ID_ID="replace-me" \
  AUTH_MICROSOFT_ENTRA_ID_SECRET="replace-me" \
  AUTH_MICROSOFT_ENTRA_ID_ISSUER="replace-me"
```

## GitHub CLI Shortcut

If `gh` is authenticated, you can wire the publish-profile secret without opening the GitHub UI:

```bash
az webapp deployment list-publishing-profiles \
  --resource-group rg-cu-app-portal \
  --name cu-app-portal \
  --xml \
  | gh secret set AZURE_WEBAPP_PUBLISH_PROFILE
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

- This path currently uses a publish-profile secret for GitHub Actions.
- The repo includes `package-lock.json`, so the workflow uses `npm ci`.
- The workflow deploys a built package from GitHub Actions so App Service does not need to Oryx-build the source repository on every release.
- Keep the production `DATABASE_URL` only in Azure App Service settings and keep local development on localhost.
- If deployment is blocked, record the exact failure in `docs/publishing/lessons-learned.md`.
