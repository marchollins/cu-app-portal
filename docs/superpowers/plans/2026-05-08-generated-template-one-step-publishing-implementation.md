# Generated Template One-Step Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generated-template `Create and Publish`, keep initial workflows portal-dispatched, and let users enable push-to-deploy after the first successful Azure publish.

**Architecture:** Add a small provider capability module, store the active deployment trigger mode on `AppRequest`, and reuse the existing publish queue/worker for one-step publishing. Generated Azure workflows start with `workflow_dispatch` only; a post-success action safely patches recognized portal-managed workflows to add the default-branch `push` trigger.

**Tech Stack:** Next.js server actions, React server/client components, Prisma/PostgreSQL, GitHub App REST client, Vitest/Testing Library.

---

### Task 1: Provider Capabilities And Deployment Trigger State

**Files:**
- Create: `src/features/publishing/providers.ts`
- Create: `src/features/publishing/providers.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260508120000_deployment_trigger_mode/migration.sql`

- [ ] **Step 1: Write provider capability tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getPublishingProviderCapabilities,
  supportsGeneratedTemplateOneStep,
  supportsPostSuccessPushToDeploy,
} from "./providers";

describe("publishing provider capabilities", () => {
  it("reports Azure App Service as portal-dispatched with post-success push opt-in", () => {
    expect(getPublishingProviderCapabilities("Azure App Service")).toMatchObject({
      hostingTarget: "Azure App Service",
      supportsGeneratedTemplateOneStep: true,
      supportsPostSuccessPushToDeploy: true,
      triggerPolicy: "portal_dispatch",
      workflowPath: ".github/workflows/deploy-azure-app-service.yml",
      workflowFileName: "deploy-azure-app-service.yml",
    });
  });

  it("returns null and false capability checks for unknown hosting targets", () => {
    expect(getPublishingProviderCapabilities("Vercel")).toBeNull();
    expect(supportsGeneratedTemplateOneStep("Vercel")).toBe(false);
    expect(supportsPostSuccessPushToDeploy("Vercel")).toBe(false);
  });
});
```

- [ ] **Step 2: Run provider tests and confirm RED**

Run: `npm test -- src/features/publishing/providers.test.ts`

Expected: fails because `src/features/publishing/providers.ts` does not exist.

- [ ] **Step 3: Implement provider capabilities**

```ts
export type WorkflowTriggerPolicy = "portal_dispatch" | "push" | "external";

export type PublishingProviderCapabilities = {
  hostingTarget: string;
  supportsGeneratedTemplateOneStep: boolean;
  supportsPostSuccessPushToDeploy: boolean;
  triggerPolicy: WorkflowTriggerPolicy;
  workflowPath: string;
  workflowFileName: string;
  requiredSecrets: string[];
};

const AZURE_APP_SERVICE: PublishingProviderCapabilities = {
  hostingTarget: "Azure App Service",
  supportsGeneratedTemplateOneStep: true,
  supportsPostSuccessPushToDeploy: true,
  triggerPolicy: "portal_dispatch",
  workflowPath: ".github/workflows/deploy-azure-app-service.yml",
  workflowFileName: "deploy-azure-app-service.yml",
  requiredSecrets: [
    "AZURE_CLIENT_ID",
    "AZURE_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_WEBAPP_NAME",
  ],
};

export function getPublishingProviderCapabilities(hostingTarget: string) {
  return hostingTarget === AZURE_APP_SERVICE.hostingTarget
    ? AZURE_APP_SERVICE
    : null;
}

export function supportsGeneratedTemplateOneStep(hostingTarget: string) {
  return (
    getPublishingProviderCapabilities(hostingTarget)
      ?.supportsGeneratedTemplateOneStep ?? false
  );
}

export function supportsPostSuccessPushToDeploy(hostingTarget: string) {
  return (
    getPublishingProviderCapabilities(hostingTarget)
      ?.supportsPostSuccessPushToDeploy ?? false
  );
}
```

- [ ] **Step 4: Add trigger mode schema and migration**

In `prisma/schema.prisma`, add `deploymentTriggerMode DeploymentTriggerMode @default(PORTAL_DISPATCH)` to `AppRequest` near `deploymentTarget`, then add:

```prisma
enum DeploymentTriggerMode {
  PORTAL_DISPATCH
  PUSH_TO_DEPLOY
}
```

Create migration SQL:

```sql
CREATE TYPE "DeploymentTriggerMode" AS ENUM ('PORTAL_DISPATCH', 'PUSH_TO_DEPLOY');

ALTER TABLE "AppRequest"
ADD COLUMN "deploymentTriggerMode" "DeploymentTriggerMode" NOT NULL DEFAULT 'PORTAL_DISPATCH';
```

- [ ] **Step 5: Verify task**

Run: `npm test -- src/features/publishing/providers.test.ts`

Expected: provider tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/publishing/providers.ts src/features/publishing/providers.test.ts prisma/schema.prisma prisma/migrations/20260508120000_deployment_trigger_mode/migration.sql
git commit -m "feat: add publishing provider trigger capabilities"
```

### Task 2: Manual-Only Generated Azure Workflow

**Files:**
- Modify: `templates/web-app/files/.github/workflows/deploy-azure-app-service.yml.template`
- Modify: `src/features/generation/build-archive.test.ts`

- [ ] **Step 1: Add failing workflow trigger expectations**

In `src/features/generation/build-archive.test.ts`, after `const renderedWorkflow = ...`, add:

```ts
expect(renderedWorkflow).toContain("on:\n  workflow_dispatch:");
expect(renderedWorkflow).not.toContain("push:\n    branches:");
```

- [ ] **Step 2: Run build archive test and confirm RED**

Run: `npm test -- src/features/generation/build-archive.test.ts`

Expected: fails because the generated workflow still contains a `push` trigger.

- [ ] **Step 3: Remove initial push trigger from generated template**

Change the workflow header to:

```yaml
name: Deploy to Azure App Service

on:
  workflow_dispatch:
```

- [ ] **Step 4: Verify task**

Run: `npm test -- src/features/generation/build-archive.test.ts`

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add templates/web-app/files/.github/workflows/deploy-azure-app-service.yml.template src/features/generation/build-archive.test.ts
git commit -m "fix: make generated azure workflow portal dispatched"
```

### Task 3: Create And Publish Submit Intent

**Files:**
- Modify: `src/features/forms/pending-submit-button.tsx`
- Modify: `src/features/create-app/submit-button.tsx`
- Modify: `src/features/create-app/template-form.tsx`
- Modify: `src/features/create-app/template-form.test.tsx`
- Modify: `src/app/create/actions.ts`
- Modify: `src/app/create/actions.test.ts`

- [ ] **Step 1: Write failing form tests**

Add a TemplateForm test that expects both `Create App` and `Create and Publish` for the Azure template, and hidden submit values:

```ts
expect(screen.getByRole("button", { name: "Create App" })).toHaveAttribute(
  "value",
  "createOnly",
);
expect(
  screen.getByRole("button", { name: "Create and Publish" }),
).toHaveAttribute("value", "createAndPublish");
```

- [ ] **Step 2: Write failing create action tests**

Mock `publishToAzureAction` in `src/app/create/actions.test.ts`, then add tests proving:

```ts
formData.set("createIntent", "createAndPublish");
await createAppAction(formData);
expect(publishToAzureAction).toHaveBeenCalledWith("request-123");
```

Also add a repo-bootstrap-failure test proving `publishToAzureAction` is not called when `bootstrapManagedRepository` rejects.

- [ ] **Step 3: Run targeted tests and confirm RED**

Run:

```bash
npm test -- src/features/create-app/template-form.test.tsx src/app/create/actions.test.ts
```

Expected: tests fail because the second submit button and publish queueing do not exist.

- [ ] **Step 4: Let submit buttons send intent values**

Extend `PendingSubmitButton` props:

```ts
name?: string;
value?: string;
```

Pass them to the `<button>`:

```tsx
<button name={name} value={value} type="submit" ...>
```

Update `SubmitButton` to accept labels, intent, status text, and variant, defaulting to create-only.

- [ ] **Step 5: Render create-only and create-and-publish actions**

In `TemplateForm`, import `supportsGeneratedTemplateOneStep`, detect hosting options from the `hostingTarget` select field, and render:

```tsx
<SubmitButton
  name="createIntent"
  value="createOnly"
  idleLabel="Create App"
  pendingLabel="Creating..."
  statusText="Creating your app package. This can take a moment."
/>
{canCreateAndPublish ? (
  <SubmitButton
    name="createIntent"
    value="createAndPublish"
    idleLabel="Create and Publish"
    pendingLabel="Publishing..."
    statusText="Creating your app and starting Azure publishing."
    variant="secondary-solid"
  />
) : null}
```

- [ ] **Step 6: Queue publish after successful generated repo bootstrap**

In `src/app/create/actions.ts`, add:

```ts
type CreateIntent = "createOnly" | "createAndPublish";

function extractCreateIntent(formData: FormData): CreateIntent {
  const raw = String(formData.get("createIntent") ?? "createOnly");
  if (raw === "createOnly" || raw === "createAndPublish") return raw;
  throw new Error("Invalid create action.");
}
```

Import `supportsGeneratedTemplateOneStep` and `publishToAzureAction`. If the intent is `createAndPublish`, assert provider support before creating the request. Track whether repository bootstrap succeeded, then call `publishToAzureAction(request.id)` after generation succeeds. Catch queueing errors by logging and setting:

```ts
{
  publishStatus: "FAILED",
  publishErrorSummary: error instanceof Error ? error.message : "unknown",
}
```

- [ ] **Step 7: Verify task**

Run:

```bash
npm test -- src/features/create-app/template-form.test.tsx src/app/create/actions.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/forms/pending-submit-button.tsx src/features/create-app/submit-button.tsx src/features/create-app/template-form.tsx src/features/create-app/template-form.test.tsx src/app/create/actions.ts src/app/create/actions.test.ts
git commit -m "feat: add generated app create and publish"
```

### Task 4: Push-To-Deploy Workflow Patching And Action

**Files:**
- Create: `src/features/publishing/workflow-triggers.ts`
- Create: `src/features/publishing/workflow-triggers.test.ts`
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`

- [ ] **Step 1: Write failing workflow patch tests**

Test that a manual-only portal workflow becomes manual-plus-push for `main`, and that unrecognized content throws:

```ts
expect(enablePushTriggerForAzureWorkflow(manualWorkflow, "main").content)
  .toContain("push:\n    branches:\n      - main");
expect(() => enablePushTriggerForAzureWorkflow("name: Custom\n", "main"))
  .toThrow("Deployment workflow is not a recognized portal-managed Azure workflow.");
```

- [ ] **Step 2: Run workflow patch tests and confirm RED**

Run: `npm test -- src/features/publishing/workflow-triggers.test.ts`

Expected: fails because the module does not exist.

- [ ] **Step 3: Implement workflow patcher**

Implement:

```ts
export const AZURE_DEPLOY_WORKFLOW_PATH =
  ".github/workflows/deploy-azure-app-service.yml";

export function enablePushTriggerForAzureWorkflow(
  workflow: string,
  defaultBranch: string,
) {
  if (
    !workflow.includes("name: Deploy to Azure App Service") ||
    !workflow.includes("azure/webapps-deploy@v3") ||
    !workflow.includes("AZURE_WEBAPP_NAME: ${{ secrets.AZURE_WEBAPP_NAME }}")
  ) {
    throw new Error(
      "Deployment workflow is not a recognized portal-managed Azure workflow.",
    );
  }

  if (workflow.includes("push:\n    branches:")) {
    return { content: workflow, changed: false };
  }

  const manualTrigger = "on:\n  workflow_dispatch:\n";
  if (!workflow.includes(manualTrigger)) {
    throw new Error(
      "Deployment workflow does not have the expected manual dispatch trigger.",
    );
  }

  return {
    changed: true,
    content: workflow.replace(
      manualTrigger,
      `on:\n  workflow_dispatch:\n  push:\n    branches:\n      - ${defaultBranch}\n`,
    ),
  };
}
```

- [ ] **Step 4: Write failing action tests**

In `src/features/publishing/actions.test.ts`, mock `loadGitHubAppConfig` and `createGitHubAppClient`, then add tests proving `enablePushToDeployAction`:

- rejects non-succeeded requests
- rejects imported repositories
- reads the workflow, commits the patched workflow to the default branch, and updates `deploymentTriggerMode` to `PUSH_TO_DEPLOY`
- refuses unrecognized workflow content without changing publish status

- [ ] **Step 5: Implement `enablePushToDeployAction`**

Add to `src/features/publishing/actions.ts`:

```ts
export async function enablePushToDeployAction(requestId: string) {
  const appRequest = await loadOwnedAppRequest(requestId);
  // validate owner, sourceOfTruth, repo status, publish status, target support,
  // repository owner/name/defaultBranch.
  // create GitHub App client for repository owner.
  // read workflow, patch safely, commit if changed.
  // update deploymentTriggerMode to PUSH_TO_DEPLOY and revalidate views.
}
```

Use `github.getBranchHead` and `github.commitFiles` with message `Enable push-to-deploy`.

- [ ] **Step 6: Verify task**

Run:

```bash
npm test -- src/features/publishing/workflow-triggers.test.ts src/features/publishing/actions.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/publishing/workflow-triggers.ts src/features/publishing/workflow-triggers.test.ts src/features/publishing/actions.ts src/features/publishing/actions.test.ts
git commit -m "feat: enable post-success push to deploy"
```

### Task 5: My Apps Push-To-Deploy UI

**Files:**
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`

- [ ] **Step 1: Write failing page tests**

Add tests proving successful generated apps with `deploymentTriggerMode: "PORTAL_DISPATCH"` show `Enable push-to-deploy`, and enabled apps show `Deployment mode: push to deploy` without that button.

- [ ] **Step 2: Run page tests and confirm RED**

Run: `npm test -- src/app/apps/page.test.tsx`

Expected: fails because the UI does not render deployment mode or the enable action.

- [ ] **Step 3: Render deployment mode and enable action**

Import `enablePushToDeployAction`. Add a helper:

```ts
function formatDeploymentMode(mode: string | null | undefined) {
  return mode === "PUSH_TO_DEPLOY" ? "push to deploy" : "portal dispatch";
}
```

Render a status row:

```tsx
<div className="status-row">
  Deployment mode: {formatDeploymentMode(request.deploymentTriggerMode)}
</div>
```

Render an action form when `sourceOfTruth === "PORTAL_MANAGED_REPO"`, repository is ready, publish succeeded, and mode is not `PUSH_TO_DEPLOY`.

- [ ] **Step 4: Verify task**

Run: `npm test -- src/app/apps/page.test.tsx`

Expected: page tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/apps/page.tsx src/app/apps/page.test.tsx
git commit -m "feat: show push-to-deploy controls"
```

### Task 6: Docs And Full Verification

**Files:**
- Modify: `templates/web-app/files/docs/publishing/azure-app-service.md.template`
- Modify: `src/features/generation/publishing-files.ts`
- Modify tests only if wording assertions need updating.

- [ ] **Step 1: Update generated docs wording**

Ensure generated docs say the portal dispatches the first deployment and that push-to-deploy can be enabled after a successful portal publish.

- [ ] **Step 2: Regenerate Prisma client**

Run: `npm run prisma:generate`

Expected: Prisma Client generates successfully with `DeploymentTriggerMode`.

- [ ] **Step 3: Run targeted test suite**

Run:

```bash
npm test -- src/features/publishing/providers.test.ts src/features/generation/build-archive.test.ts src/features/create-app/template-form.test.tsx src/app/create/actions.test.ts src/features/publishing/workflow-triggers.test.ts src/features/publishing/actions.test.ts src/app/apps/page.test.tsx
```

Expected: all targeted tests pass.

- [ ] **Step 4: Run full unit suite**

Run: `npm test`

Expected: 50+ test files pass.

- [ ] **Step 5: Run production build**

Run: `npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 6: Commit docs and generated client artifacts if changed**

```bash
git add templates/web-app/files/docs/publishing/azure-app-service.md.template src/features/generation/publishing-files.ts package-lock.json package.json
git commit -m "docs: describe portal dispatched publishing"
```

Skip the commit if no docs or generated artifacts changed.
