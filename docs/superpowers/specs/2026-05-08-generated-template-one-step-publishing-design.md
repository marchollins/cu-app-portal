# Generated Template One-Step Publishing Design

## Overview

This design adds a one-step publishing path for generated template apps while preserving the existing create-only path.

The portal should let a Cedarville user choose either:

- `Create App`: generate the app, create the managed GitHub repository, and stop before Azure publishing.
- `Create and Publish`: generate the app, create the managed GitHub repository, provision Azure, wire deployment settings, dispatch the deployment workflow, and show publish progress.

The first implementation is scoped to generated template apps. Existing/imported app publishing keeps its current preparation gates because those repositories can contain existing workflows, conflicting files, or app-specific decisions that need review.

## Product Decisions

Generated template apps are safe candidates for one-step publishing because the portal controls the source snapshot. The portal can render the repository, choose the deployment files, and know whether the selected hosting target has an automated publisher.

The current two-step flow remains available because some users will want to inspect or edit the generated repository before publishing. The one-step path is an opt-in submit intent, not the only way to create an app.

The portal remains the system of record. GitHub is the source repository, but the portal owns the lifecycle state, publish attempts, Azure target names, deployment status, and retry behavior.

## Initial Workflow Trigger Policy

The generated repository should include deployment-support files, including the Azure GitHub Actions workflow, but the workflow must be inert by default.

The template workflow should use manual dispatch only:

```yaml
on:
  workflow_dispatch:
```

It should not include:

```yaml
push:
  branches:
    - main
```

This prevents GitHub from starting a deployment immediately after the repository is created. The first deployment run must be started intentionally by the portal after all required Azure resources, app settings, federated credentials, and GitHub Actions secrets are in place.

The portal should not rely on commit-message skip markers, temporarily disabled workflows, or a failed first run as part of the normal path. Those options are more brittle than making the workflow manual-only and dispatching it when ready.

## One-Step Flow

When a user submits `Create and Publish` for a generated template app:

1. The server action validates the form and records the app request.
2. The portal renders the deterministic source snapshot and ZIP artifact.
3. The portal creates the managed GitHub repository with the generated source and a manual-only deployment workflow.
4. The portal stores repository coordinates and marks the repository `READY`.
5. The portal queues a publish attempt for the same app request.
6. The publish worker provisions or verifies Azure infrastructure.
7. The worker sets Azure Web App app settings before deployment.
8. The worker creates or updates the GitHub OIDC federated credential.
9. The worker sets required GitHub Actions secrets, including `AZURE_WEBAPP_NAME`.
10. The worker dispatches the deployment workflow.
11. The worker tracks the workflow run, verifies the published URL, and updates portal status.
12. The user lands on the existing success/status surface with repository, artifact, publish status, workflow URL, and publish URL when available.

The browser request should not wait for the full deployment. It may wait for app generation and repository bootstrap, then start the publish worker and redirect to status.

## Create-Only Flow

When a user submits `Create App`, the portal keeps today's generated-app behavior:

1. Generate the ZIP artifact.
2. Create the managed GitHub repository.
3. Store repository state.
4. Redirect to the success/status surface.
5. Leave publish status as `NOT_STARTED`.

Because the workflow is manual-only, future commits to the generated repository will not deploy automatically. Users publish through the portal, which ensures deployment settings are correct before dispatching a workflow run.

## Hosting Provider Plumbing

The UX should stay target-based rather than Azure-specific at the create boundary.

Each hosting target should be represented by a provider capability contract. Azure App Service is the only v1 provider, but the model should leave room for other targets.

Suggested capability shape:

```ts
type WorkflowTriggerPolicy = "portal_dispatch" | "push" | "external";

type PublishingProviderCapabilities = {
  hostingTarget: string;
  supportsGeneratedTemplateOneStep: boolean;
  triggerPolicy: WorkflowTriggerPolicy;
  requiredRepositoryFiles: string[];
  requiredSecrets: string[];
};
```

For Azure App Service v1:

```txt
hostingTarget=Azure App Service
supportsGeneratedTemplateOneStep=true
triggerPolicy=portal_dispatch
```

The create UI can show `Create and Publish` only when the selected template and hosting target support one-step publishing. Future providers can add their own preparation and dispatch strategy without changing the generated app lifecycle.

## Data And State

The existing `AppRequest` and `PublishAttempt` model is mostly sufficient.

The implementation may add an explicit submit intent in server-action parsing, such as:

```txt
createOnly
createAndPublish
```

The app request should still record:

- source-of-truth mode
- hosting target
- repository status and coordinates
- publish status
- Azure target state
- latest publish error summary

Every one-step publish still creates a normal `PublishAttempt`. This keeps retry, history, audit, and failure handling consistent with the existing `Publish to Azure` action.

## Error Handling

Repository bootstrap failure should not discard a successfully generated ZIP artifact. The request should surface repository failure and skip publish queueing.

Publish queueing should happen only after the repository is `READY`. If publish queueing fails after repository creation, the user should still have the managed repo and artifact, plus a publish failure summary and retry action.

The worker should fail before workflow dispatch when required deployment prerequisites cannot be completed:

- Azure resource provisioning fails
- Azure app settings cannot be applied
- Entra redirect URI registration fails
- GitHub OIDC federated credential cannot be created
- GitHub Actions secrets cannot be set

This keeps the first GitHub Actions run meaningful. Failed workflow runs should indicate build or deployment problems, not missing portal-managed setup.

## Existing Apps

Existing/imported app workflows remain separate.

Imported apps should not get a one-click create/import/publish path until the repository is known to be compatible and its publishing additions are committed to the default branch. If conflicts exist, the current direct-commit or PR preparation gates remain the safer UX.

The same provider capability model can later support an imported-app one-step path, but that should be a separate design after generated template publishing is stable.

## Testing

Unit tests should cover:

- create action parsing for create-only vs create-and-publish intent
- generated Azure workflow content includes `workflow_dispatch`
- generated Azure workflow content does not include a `push` trigger
- create-and-publish queues a publish attempt after repository bootstrap succeeds
- create-and-publish does not queue publish when repository bootstrap fails
- provider capability gating for `Create and Publish`

Server action tests should verify:

- create-only leaves publish status `NOT_STARTED`
- create-and-publish moves publish status to `QUEUED` after repository readiness
- existing/imported app preparation rules are unchanged
- publish worker receives the same app request path used by manual `Publish to Azure`

Page tests should verify:

- generated template forms show both create actions when the hosting target supports one-step publishing
- unsupported hosting targets hide or disable `Create and Publish`
- status pages show repo and publish progress without requiring a second user action

Targeted integration or e2e coverage should verify that initial repository creation does not trigger an automatic GitHub Actions deployment from a `push` event.

## Implementation Boundaries

In scope:

- add the create submit intent
- make the generated Azure workflow manual-dispatch only
- queue the existing publish worker after successful generated repo bootstrap
- add provider capability plumbing for hosting-target gating
- update generated-app docs to describe portal-dispatched deployment
- add focused tests for the new path and trigger policy

Out of scope:

- one-step publishing for existing/imported apps
- push-to-deploy for generated apps
- custom domain automation
- additional hosting providers
- replacing the existing Azure publish runtime
- changing Azure resource ownership or naming rules
