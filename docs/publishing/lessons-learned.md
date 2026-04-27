# Publishing Lessons Learned

Use this file to capture the operational details that make the next publish easier for the portal app.

## Record Here

- Which git, GitHub, and Azure steps completed successfully
- Which steps required manual intervention
- Which repository or Azure names changed from the manifest defaults
- Which PostgreSQL server, database, and `DATABASE_URL` values were used in production
- Which application settings, secrets, or publish profile issues blocked automation
- Which recovery steps are safe to repeat
- Which unresolved issues need a technical operator

## Current Starting Notes

- The supported path is GitHub Actions plus Azure App Service.
- The App Service startup command should run Prisma migrations before `npm start`.
- Keep local development on `localhost` and put the production `DATABASE_URL` only in Azure App Service settings.
- Production deployment requires real Entra credentials and a reachable PostgreSQL database.

## 2026-04-24 Live Publish Attempt

- Azure subscription used: `TechPros-PAYG`
- Resource group created: `rg-cu-app-portal` in `eastus`
- Azure Database for PostgreSQL flexible server created: `psql-cu-app-portal-260424` in `eastus2`
- Azure PostgreSQL database created: `cu-app-portal`
- PostgreSQL server status after provisioning: `Ready`
- The portal repo manifest was updated to keep development on localhost and point production `DATABASE_URL` at the Azure PostgreSQL server through the `DATABASE_URL` App Service setting.
- GitHub remote already existed as `git@github.com:marchollins/cu-app-portal.git`
- `gh auth status` showed the local GitHub CLI token was invalid, so the deployment flow could not finish the GitHub-secret wiring path automatically.
- Azure App Service provisioning is currently blocked by subscription quota. App Service plan creation failed for `F1`, `B1`, and `S1`, and the subscription currently has no reusable App Service plans or web apps.
- Safe next step: restore or obtain App Service quota in this subscription, then continue with App Service plan creation, web app creation, App Service app settings, and deployment.

## 2026-04-27 Retry

- App Service quota became available and the Linux App Service plan `asp-cu-app-portal-s1` was created successfully in `eastus2`.
- Web app `cu-app-portal` was created successfully and assigned the default host `https://cu-app-portal.azurewebsites.net`.
- App Service configuration was applied:
  - startup command: `npm run prisma:migrate:deploy && npm start`
  - HTTPS-only enabled
  - production app settings loaded, including Azure PostgreSQL `DATABASE_URL`
- The first zip deployment failed because the SCM container restarted while App Service configuration changes were still being applied. Azure reported: deployment stopped due to SCM container restart caused by a management operation in quick succession.
- Retrying the zip deployment after configuration settled avoided the SCM-restart error, but the deployment remained in the `Running oryx build...` phase for an extended period and the public site still timed out.
- Practical lesson: finish all App Service configuration first, then start deployment as a separate step. If Oryx appears stuck for a long time, the next diagnostic step should be deeper SCM/Kudu build log inspection or a shift to a prebuilt artifact deployment path.
