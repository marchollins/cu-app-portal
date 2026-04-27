# Node/Next.js Azure Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `web-app` template so generated Node/Next.js apps include a polished Azure App Service publishing bundle with a deployment manifest, GitHub Actions workflow, generated-app Codex skill, and human-readable publishing docs.

**Architecture:** Keep the existing portal generation flow intact, but evolve template output from two generic instruction files into a structured publishing bundle. Add deployment metadata and generated assets in a way that the generated-app skill can consume now and the portal can later own directly.

**Tech Stack:** Next.js, TypeScript, Vitest, JSZip, template-based archive generation, Markdown docs, GitHub Actions YAML

---

## Planned File Structure

### Portal Generation

- Modify: `src/features/generation/build-archive.ts`
- Modify: `src/features/generation/build-archive.test.ts`
- Replace/expand: `src/features/generation/instruction-files.ts`
- Create: `src/features/generation/deployment-manifest.ts`
- Create: `src/features/generation/deployment-manifest.test.ts`
- Create: `src/features/generation/publishing-files.ts`
- Create: `src/features/generation/publishing-files.test.ts`

### Template Assets

- Modify: `templates/web-app/template.json`
- Modify: `templates/web-app/files/README.md.template`
- Create: `templates/web-app/files/.github/workflows/deploy-azure-app-service.yml.template`
- Create: `templates/web-app/files/.codex/skills/publish-to-azure/SKILL.md.template`
- Create: `templates/web-app/files/app-portal/deployment-manifest.json.template`
- Create: `templates/web-app/files/docs/publishing/azure-app-service.md.template`
- Create: `templates/web-app/files/docs/publishing/lessons-learned.md.template`

### Documentation

- Modify: `README.md`
- Modify: `docs/portal/template-authoring.md`
- Modify: `docs/portal/handoff-2026-04-23.md`

## Task 1: Add Deployment Manifest Support

**Files:**
- Create: `src/features/generation/deployment-manifest.ts`
- Create: `src/features/generation/deployment-manifest.test.ts`
- Modify: `src/features/app-requests/types.ts` only if needed for typing alignment

- [ ] **Step 1: Write the failing tests for deployment manifest generation**

```ts
// src/features/generation/deployment-manifest.test.ts
import { describe, expect, it } from "vitest";
import { buildDeploymentManifest } from "./deployment-manifest";

describe("buildDeploymentManifest", () => {
  it("builds the supported Node/Next.js Azure App Service manifest", () => {
    const manifest = buildDeploymentManifest({
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
    });

    expect(manifest.runtime.family).toBe("node");
    expect(manifest.runtime.framework).toBe("nextjs");
    expect(manifest.hosting.provider).toBe("azure");
    expect(manifest.hosting.service).toBe("app-service");
    expect(manifest.deployment.method).toBe("github-actions");
    expect(manifest.automation.skillPath).toBe(
      ".codex/skills/publish-to-azure/SKILL.md",
    );
  });

  it("includes deterministic naming defaults derived from the app name", () => {
    const manifest = buildDeploymentManifest({
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
    });

    expect(manifest.defaults.githubRepository).toBe("campus-hub");
    expect(manifest.defaults.azure.resourceGroup).toBe("rg-campus-hub");
    expect(manifest.defaults.azure.webApp).toBe("campus-hub");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/generation/deployment-manifest.test.ts`
Expected: FAIL because `buildDeploymentManifest` does not exist yet.

- [ ] **Step 3: Implement the deployment manifest builder**

```ts
// src/features/generation/deployment-manifest.ts
import type { CreateAppRequestInput } from "@/features/app-requests/types";

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function buildDeploymentManifest(input: CreateAppRequestInput) {
  const appSlug = toSlug(input.appName);

  return {
    schemaVersion: "1.0.0",
    templateSlug: input.templateSlug,
    runtime: {
      family: "node",
      framework: "nextjs",
    },
    hosting: {
      provider: "azure",
      service: "app-service",
      os: "linux",
    },
    deployment: {
      method: "github-actions",
      startup: {
        command: "npm start",
      },
      build: {
        install: "npm install",
        build: "npm run build",
      },
    },
    defaults: {
      githubRepository: appSlug,
      azure: {
        resourceGroup: `rg-${appSlug}`,
        plan: `asp-${appSlug}`,
        webApp: appSlug,
      },
    },
    automation: {
      workflowPath: ".github/workflows/deploy-azure-app-service.yml",
      skillPath: ".codex/skills/publish-to-azure/SKILL.md",
      docsPath: "docs/publishing/azure-app-service.md",
      lessonsLearnedPath: "docs/publishing/lessons-learned.md",
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/generation/deployment-manifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/generation/deployment-manifest.ts src/features/generation/deployment-manifest.test.ts
git commit -m "feat: add deployment manifest generator"
```

## Task 2: Generate Publishing Docs From Code Instead Of Generic Placeholders

**Files:**
- Modify: `src/features/generation/instruction-files.ts`
- Create: `src/features/generation/publishing-files.ts`
- Create: `src/features/generation/publishing-files.test.ts`

- [ ] **Step 1: Write the failing tests for publishing file generation**

```ts
// src/features/generation/publishing-files.test.ts
import { describe, expect, it } from "vitest";
import { buildPublishingFiles } from "./publishing-files";

describe("buildPublishingFiles", () => {
  it("returns the publishing docs expected by the Node/Next.js Azure path", () => {
    const files = buildPublishingFiles({
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
    });

    expect(files["docs/publishing/azure-app-service.md"]).toContain(
      "Azure App Service",
    );
    expect(files["docs/publishing/lessons-learned.md"]).toContain(
      "lessons learned",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/generation/publishing-files.test.ts`
Expected: FAIL because `buildPublishingFiles` does not exist yet.

- [ ] **Step 3: Implement publishing file generation**

```ts
// src/features/generation/publishing-files.ts
import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildPublishingFiles(input: CreateAppRequestInput) {
  return {
    "docs/publishing/azure-app-service.md": `# Azure App Service Publishing

This app is prepared for GitHub-based deployment to Azure App Service.

## What the publish skill will do

1. Validate \`git\`, \`gh\`, and \`az\`.
2. Create or connect a GitHub repository.
3. Create the Azure App Service resources.
4. Push the repository and deploy with GitHub Actions.
`,
    "docs/publishing/lessons-learned.md": `# Publishing Lessons Learned

This document records lessons learned for the supported ${input.hostingTarget} path.

- Prefer derived defaults over asking users for Azure naming details.
- Stop early when GitHub CLI or Azure CLI authentication is missing.
- Keep the fallback docs usable by non-technical users.
`,
  };
}
```

- [ ] **Step 4: Update the legacy instruction file builder to point users to the new docs**

```ts
// src/features/generation/instruction-files.ts
import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildInstructionFiles(input: CreateAppRequestInput) {
  return {
    "docs/github-setup.md": `# GitHub Setup

This app is prepared for automated publishing with GitHub and Azure.

Follow \`docs/publishing/azure-app-service.md\` for the recommended path.`,
    "docs/deployment-guide.md": `# Deployment Guide

This package was prepared for ${input.hostingTarget}.

The recommended deployment path is documented in \`docs/publishing/azure-app-service.md\`.`,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/features/generation/publishing-files.test.ts src/features/generation/build-archive.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/generation/publishing-files.ts src/features/generation/publishing-files.test.ts src/features/generation/instruction-files.ts
git commit -m "feat: add publishing docs generation"
```

## Task 3: Extend Archive Generation To Include Structured Publishing Assets

**Files:**
- Modify: `src/features/generation/build-archive.ts`
- Modify: `src/features/generation/build-archive.test.ts`
- Modify: `templates/web-app/template.json`

- [ ] **Step 1: Write the failing archive assertions for publishing assets**

```ts
// src/features/generation/build-archive.test.ts
expect(zip.file("docs/publishing/azure-app-service.md")).toBeTruthy();
expect(zip.file("docs/publishing/lessons-learned.md")).toBeTruthy();
expect(zip.file("app-portal/deployment-manifest.json")).toBeTruthy();
expect(zip.file(".github/workflows/deploy-azure-app-service.yml")).toBeTruthy();
expect(zip.file(".codex/skills/publish-to-azure/SKILL.md")).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: FAIL because the archive does not yet include the new publishing assets.

- [ ] **Step 3: Update the template manifest to include new generated files**

```json
// templates/web-app/template.json
{
  "slug": "web-app",
  "version": "1.1.0",
  "entryFiles": [
    "README.md.template",
    "src/app/page.tsx.template",
    "src/app/globals.css.template",
    ".env.example.template",
    ".github/workflows/deploy-azure-app-service.yml.template",
    ".codex/skills/publish-to-azure/SKILL.md.template",
    "app-portal/deployment-manifest.json.template",
    "docs/publishing/azure-app-service.md.template",
    "docs/publishing/lessons-learned.md.template"
  ]
}
```

- [ ] **Step 4: Update archive generation to include manifest and publishing docs**

```ts
// src/features/generation/build-archive.ts
import { buildDeploymentManifest } from "./deployment-manifest";
import { buildPublishingFiles } from "./publishing-files";

// inside buildArchive(...)
const publishingFiles = buildPublishingFiles(input);
for (const [filePath, content] of Object.entries(publishingFiles)) {
  zip.file(filePath, content);
}

zip.file(
  "app-portal/deployment-manifest.json",
  JSON.stringify(buildDeploymentManifest(input), null, 2),
);
```

- [ ] **Step 5: Run tests to verify the archive includes the new files**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/generation/build-archive.ts src/features/generation/build-archive.test.ts templates/web-app/template.json
git commit -m "feat: include publishing assets in generated archives"
```

## Task 4: Author The Template-Level Publishing Assets

**Files:**
- Modify: `templates/web-app/files/README.md.template`
- Create: `templates/web-app/files/.github/workflows/deploy-azure-app-service.yml.template`
- Create: `templates/web-app/files/.codex/skills/publish-to-azure/SKILL.md.template`
- Create: `templates/web-app/files/app-portal/deployment-manifest.json.template`
- Create: `templates/web-app/files/docs/publishing/azure-app-service.md.template`
- Create: `templates/web-app/files/docs/publishing/lessons-learned.md.template`

- [ ] **Step 1: Write the failing content assertions in the archive test**

```ts
// src/features/generation/build-archive.test.ts
await expect(
  zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
).resolves.toContain("publish this app to Azure");

await expect(
  zip.file(".github/workflows/deploy-azure-app-service.yml")?.async("string"),
).resolves.toContain("azure/webapps-deploy");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: FAIL because the template files do not yet exist.

- [ ] **Step 3: Update the README template to point at the supported publishing path**

```md
<!-- templates/web-app/files/README.md.template -->
# {{APP_NAME}}

{{APP_DESCRIPTION}}

## Hosting Target

This starter is prepared for {{HOSTING_TARGET}}.

## Recommended Publishing Path

Ask Codex to "publish this app to Azure App Service" from this folder.

Fallback docs:

1. `docs/github-setup.md`
2. `docs/deployment-guide.md`
3. `docs/publishing/azure-app-service.md`
```

- [ ] **Step 4: Add the GitHub Actions workflow template**

```yaml
# templates/web-app/files/.github/workflows/deploy-azure-app-service.yml.template
name: Deploy to Azure App Service

on:
  push:
    branches: ["main"]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run build
      - uses: azure/webapps-deploy@v3
        with:
          app-name: "__AZURE_WEBAPP_NAME__"
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
```

- [ ] **Step 5: Add the generated-app publish skill template**

```md
<!-- templates/web-app/files/.codex/skills/publish-to-azure/SKILL.md.template -->
---
name: publish-to-azure
description: Use when publishing this generated Node/Next.js app to GitHub and Azure App Service with minimal manual setup
---

# Publish To Azure

## Overview

Use `git`, `gh`, and `az` to publish this app with as little user interaction as possible.

## Required behavior

1. Read `app-portal/deployment-manifest.json`.
2. Verify `git`, `gh`, and `az` are installed and authenticated.
3. Create or connect the GitHub repository.
4. Create the Azure App Service resources.
5. Wire deployment credentials.
6. Push and verify deployment.
7. If blocked, route the user to `docs/publishing/azure-app-service.md`.
```

- [ ] **Step 6: Add the publishing docs templates**

```md
<!-- templates/web-app/files/docs/publishing/azure-app-service.md.template -->
# Publish to Azure App Service

This app is set up for GitHub-based deployment to Azure App Service.

## Fastest path

Ask Codex to publish this app to Azure from this folder. The publish skill will try to automate:

1. GitHub repository creation
2. Azure App Service creation
3. Deployment workflow wiring
4. First push and first deploy
```

```md
<!-- templates/web-app/files/docs/publishing/lessons-learned.md.template -->
# Publishing Lessons Learned

Use this file to capture what worked, what required manual input, and which Azure or GitHub issues should be improved in later templates or moved into the portal.
```

- [ ] **Step 7: Run tests to verify the generated content is present**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add templates/web-app/files/README.md.template templates/web-app/files/.github/workflows/deploy-azure-app-service.yml.template templates/web-app/files/.codex/skills/publish-to-azure/SKILL.md.template templates/web-app/files/docs/publishing/azure-app-service.md.template templates/web-app/files/docs/publishing/lessons-learned.md.template templates/web-app/files/app-portal/deployment-manifest.json.template
git commit -m "feat: add azure publishing template assets"
```

## Task 5: Make The Template Manifest File Template-Driven Instead Of Code-Injected

**Files:**
- Modify: `src/features/generation/build-archive.ts`
- Modify: `templates/web-app/files/app-portal/deployment-manifest.json.template`
- Modify: `src/features/generation/build-archive.test.ts`

- [ ] **Step 1: Write the failing assertion for manifest content in the archive**

```ts
// src/features/generation/build-archive.test.ts
await expect(
  zip.file("app-portal/deployment-manifest.json")?.async("string"),
).resolves.toContain('"framework": "nextjs"');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: FAIL if the manifest template content does not yet render correctly.

- [ ] **Step 3: Replace the placeholder manifest template with tokenized JSON**

```json
// templates/web-app/files/app-portal/deployment-manifest.json.template
{
  "schemaVersion": "1.0.0",
  "templateSlug": "web-app",
  "runtime": {
    "family": "node",
    "framework": "nextjs"
  },
  "hosting": {
    "provider": "azure",
    "service": "app-service",
    "os": "linux"
  },
  "deployment": {
    "method": "github-actions",
    "startup": {
      "command": "npm start"
    }
  },
  "defaults": {
    "appName": "{{APP_NAME}}"
  }
}
```

- [ ] **Step 4: Simplify archive generation so template files remain the source of truth**

```ts
// src/features/generation/build-archive.ts
// remove the ad hoc zip.file("app-portal/deployment-manifest.json", ...)
// rely on the template entry file plus token rendering for the manifest
```

- [ ] **Step 5: Run tests to verify the rendered manifest is correct**

Run: `npm test -- src/features/generation/build-archive.test.ts src/features/generation/deployment-manifest.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/generation/build-archive.ts templates/web-app/files/app-portal/deployment-manifest.json.template src/features/generation/build-archive.test.ts
git commit -m "refactor: render deployment manifest from template files"
```

## Task 6: Document The New Publishing Bundle For Portal Maintainers

**Files:**
- Modify: `README.md`
- Modify: `docs/portal/template-authoring.md`
- Modify: `docs/portal/handoff-2026-04-23.md`

- [ ] **Step 1: Write the failing docs assertion test or checklist**

```md
Manual doc checklist:
- README mentions Azure publishing assets in generated apps
- template authoring guide explains the new publishing bundle files
- handoff doc notes the new publishing direction and migration path
```

- [ ] **Step 2: Update the docs**

```md
<!-- README.md -->
The `web-app` template now includes Azure App Service publishing assets, including GitHub Actions scaffolding, publishing docs, a deployment manifest, and a generated-app Codex skill.
```

```md
<!-- docs/portal/template-authoring.md -->
Publishing-capable templates may include:

- `.github/workflows/`
- `.codex/skills/`
- `app-portal/deployment-manifest.json`
- `docs/publishing/`
```

```md
<!-- docs/portal/handoff-2026-04-23.md -->
Next major direction:

- move from generic deployment guidance toward generated publishing bundles
- start with Node/Next.js Azure App Service automation inside generated apps
- preserve a path to future portal-owned publishing
```

- [ ] **Step 3: Run targeted verification**

Run: `npm test -- src/features/generation/build-archive.test.ts src/features/generation/publishing-files.test.ts src/features/generation/deployment-manifest.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md docs/portal/template-authoring.md docs/portal/handoff-2026-04-23.md
git commit -m "docs: describe azure publishing bundle"
```

## Task 7: Final Verification

**Files:**
- Verify: `src/features/generation/build-archive.ts`
- Verify: `src/features/generation/instruction-files.ts`
- Verify: `src/features/generation/deployment-manifest.ts`
- Verify: `src/features/generation/publishing-files.ts`
- Verify: `templates/web-app/`
- Verify: `README.md`
- Verify: `docs/portal/`

- [ ] **Step 1: Run the focused test suite**

Run: `npm test -- src/features/generation/deployment-manifest.test.ts src/features/generation/publishing-files.test.ts src/features/generation/build-archive.test.ts`
Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Inspect one generated archive manually**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: PASS with the archive containing:

- `docs/publishing/azure-app-service.md`
- `docs/publishing/lessons-learned.md`
- `.github/workflows/deploy-azure-app-service.yml`
- `.codex/skills/publish-to-azure/SKILL.md`
- `app-portal/deployment-manifest.json`

- [ ] **Step 4: Commit the finished implementation**

```bash
git add src/features/generation templates/web-app README.md docs/portal
git commit -m "feat: add nextjs azure publishing bundle"
```

