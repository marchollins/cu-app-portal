import { buildDeploymentManifest } from "@/features/generation/deployment-manifest";
import {
  PUBLISHING_BUNDLE_PATHS,
  type RepositoryFileMap,
} from "./compatibility";

type PublishingBundleInput = {
  appName: string;
  repositoryOwner: string;
  repositoryName: string;
  files: RepositoryFileMap;
};

type PublishingBundlePlan = {
  filesToWrite: Record<string, string>;
};

const DEPLOY_WORKFLOW = `name: Deploy to Azure App Service

on:
  workflow_dispatch:
  push:
    branches:
      - main

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}
  DEPLOY_PACKAGE_PATH: release

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi

      - name: Build application
        run: npm run build

      - name: Prepare deployment package
        run: |
          rm -rf "\${{ env.DEPLOY_PACKAGE_PATH }}"
          mkdir -p "\${{ env.DEPLOY_PACKAGE_PATH }}"
          cp -R .next "\${{ env.DEPLOY_PACKAGE_PATH }}/.next"
          cp -R node_modules "\${{ env.DEPLOY_PACKAGE_PATH }}/node_modules"
          cp package.json "\${{ env.DEPLOY_PACKAGE_PATH }}/"
          for file in package-lock.json next.config.js next.config.mjs next.config.ts next-env.d.ts prisma.config.ts; do
            if [ -f "$file" ]; then
              cp "$file" "\${{ env.DEPLOY_PACKAGE_PATH }}/"
            fi
          done
          for dir in public prisma; do
            if [ -d "$dir" ]; then
              cp -R "$dir" "\${{ env.DEPLOY_PACKAGE_PATH }}/$dir"
            fi
          done

      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: \${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: \${{ secrets.AZURE_TENANT_ID }}
          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: \${{ env.AZURE_WEBAPP_NAME }}
          package: \${{ env.DEPLOY_PACKAGE_PATH }}
`;

function buildImportedManifest(appName: string, repositoryName: string) {
  const manifest = buildDeploymentManifest({
    templateSlug: "imported-web-app",
    appName,
    description: `Imported app ${appName}`,
    hostingTarget: "Azure App Service",
  });

  return `${JSON.stringify(
    {
      ...manifest,
      templateSlug: "imported-web-app",
      defaults: {
        ...manifest.defaults,
        githubRepository: repositoryName,
      },
    },
    null,
    2,
  )}\n`;
}

function updatePackageJson(rawPackageJson: string) {
  const parsed = JSON.parse(rawPackageJson) as {
    scripts?: Record<string, string>;
    engines?: Record<string, string>;
    [key: string]: unknown;
  };
  let changed = false;

  if (!parsed.scripts?.start) {
    parsed.scripts = { ...parsed.scripts, start: "next start" };
    changed = true;
  }

  if (!parsed.engines?.node) {
    parsed.engines = { ...parsed.engines, node: ">=24" };
    changed = true;
  }

  return changed ? `${JSON.stringify(parsed, null, 2)}\n` : null;
}

function assertNoPublishingPathConflicts(files: RepositoryFileMap) {
  for (const path of PUBLISHING_BUNDLE_PATHS) {
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      throw new Error(`${path} already exists and will not be overwritten.`);
    }
  }
}

export function planPublishingBundle({
  appName,
  repositoryName,
  files,
}: PublishingBundleInput): PublishingBundlePlan {
  assertNoPublishingPathConflicts(files);
  const filesToWrite: Record<string, string> = {};
  const updatedPackageJson = updatePackageJson(files["package.json"]);

  if (updatedPackageJson) {
    filesToWrite["package.json"] = updatedPackageJson;
  }

  filesToWrite[".github/workflows/deploy-azure-app-service.yml"] =
    DEPLOY_WORKFLOW;
  filesToWrite[".codex/skills/publish-to-azure/SKILL.md"] =
    "# Publish to Azure\n\nUse the Cedarville App Portal as the supported Azure publishing path for this imported app.\n";
  filesToWrite["docs/publishing/azure-app-service.md"] =
    "# Publish to Azure App Service\n\nThis imported app is prepared for Cedarville App Portal-managed Azure publishing.\n";
  filesToWrite["docs/publishing/lessons-learned.md"] =
    "# Publishing Lessons Learned\n\nRecord manual fixes and deployment blockers here.\n";
  filesToWrite["app-portal/deployment-manifest.json"] = buildImportedManifest(
    appName,
    repositoryName,
  );

  return { filesToWrite };
}
