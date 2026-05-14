# Publishing Preflight And Repair Design

## Overview

This design adds a publishing setup readiness layer to the Cedarville App Portal.
The portal should verify Azure, Microsoft Graph, GitHub Actions, and repository
deployment prerequisites before presenting an app as publishable, and it should
offer a repair action when those prerequisites drift or are missing.

The immediate problem motivating this work is an imported app whose repository
was verified and prepared, but publishing failed with:

```txt
Microsoft Graph request failed: 403 {"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges to complete the operation."}}
```

The current retry button queues another publish attempt even though the next
attempt cannot succeed until the portal identity has the required Graph
permission and setup is rerun. The new model separates publishing setup from
deployment so the portal can show a specific repair path instead of a blind
retry loop.

## Goals

- Thoroughly check imported apps for publishing prerequisites before enabling
  Azure publishing.
- Apply the same repair process to generated apps when setup gets out of sync.
- Distinguish setup failures from deployment failures in data, UI, and audit
  history.
- Provide an explicit `Repair Publishing Setup` action that fixes missing or
  stale Azure, Graph, and GitHub setup without dispatching a deployment.
- Keep publish retry focused on actual deployment retries after setup is ready.
- Surface Microsoft Graph permission failures with operator-actionable text.

## Non-Goals

- Replacing the existing repository import preparation flow.
- Publishing imported apps automatically during import.
- Dispatching GitHub Actions from the repair action.
- Deleting or recreating Azure resources as part of repair.
- Solving every unsupported repository shape. Repository compatibility remains
  governed by the existing import preparation checks.

## Product Flow

Publishing should require two independent readiness conditions:

```txt
Repository Ready + Publishing Setup Ready -> Publish to Azure
```

Repository readiness continues to mean:

- the app has a managed GitHub repository
- imported apps have committed publishing additions on the default branch
- the portal can identify the owner, repo name, and default branch

Publishing setup readiness is new. It means the portal has verified or applied
the Azure, Graph, GitHub Actions, and workflow setup needed before deployment.

### Imported Apps

Imported apps should run a read-only publishing preflight after the repository is
imported and after required repository preparation is committed or verified.

If preflight succeeds, `Publish to Azure` is available. If preflight finds drift
or a permissions gap, the app shows the failed checks and a `Repair Publishing
Setup` action. Publishing remains disabled until repair succeeds or a later
preflight proves readiness.

### Generated Apps

Generated apps should use the same setup readiness model.

Create-only generated apps may start with setup unchecked. When the user chooses
`Publish to Azure`, the worker should perform setup as it does today, but setup
failures should be classified as publishing setup failures. If setup fails before
workflow dispatch, the UI should show `Repair Publishing Setup` rather than
encouraging another generic publish retry.

Create-and-publish generated apps should also use the same setup classification.
If setup cannot be completed, the repository and artifact remain available, the
publish attempt fails as setup-blocked, and the app offers repair.

Published generated apps may drift later. The same preflight and repair actions
should detect and repair missing secrets, federated credentials, redirect URIs,
App Service settings, or workflow setup.

## User Experience

`My Apps` and app details should show a compact publishing setup status near the
repository and publish status:

- `Ready`
- `Needs repair`
- `Repairing`
- `Blocked`
- `Not checked`

When setup is not ready, the UI should show:

- a short summary of the failed or unknown checks
- a `Repair Publishing Setup` action when repair is possible
- operator guidance when repair cannot proceed without permissions
- no `Publish to Azure` or `Retry Publish` action until setup is ready

For the Graph 403 case, the message should be plain and actionable:

```txt
Microsoft Graph permission is missing for Entra publishing setup. Ask an
operator to grant the portal identity permission to update the shared app
registration and publisher federated credentials, then run Repair Publishing
Setup.
```

The UI should still keep app details, repository links, artifact downloads, and
previous workflow links visible when setup is blocked.

## Data Model

Add durable publishing setup state to `AppRequest`:

- `publishingSetupStatus`
- `publishingSetupCheckedAt`
- `publishingSetupRepairedAt`
- `publishingSetupErrorSummary`

Suggested `PublishingSetupStatus` enum:

- `NOT_CHECKED`
- `CHECKING`
- `READY`
- `NEEDS_REPAIR`
- `REPAIRING`
- `BLOCKED`

Add a `PublishSetupCheck` model for check-level evidence:

- `id`
- `appRequestId`
- `checkKey`
- `status`
- `message`
- `metadata`
- `checkedAt`
- `createdAt`
- `updatedAt`

Suggested `PublishSetupCheckStatus` enum:

- `PASS`
- `WARN`
- `FAIL`
- `UNKNOWN`

Suggested initial check keys:

- `azure_resource_access`
- `azure_app_settings`
- `entra_redirect_uri`
- `github_federated_credential`
- `github_actions_secrets`
- `github_workflow_file`
- `github_workflow_dispatch`

Check metadata must never include secrets, tokens, connection strings, or raw
credential-bearing URLs.

## Preflight Service

The preflight service should be read-only against external providers by default.
It should inspect and record setup readiness in the portal database without
mutating Azure, Graph, GitHub, or repository state.

Preflight should check:

- the app has complete repository coordinates
- the Azure target names can be derived from the app request
- existing Azure resources are readable when present
- required App Service settings are present when an Azure Web App already exists,
  without storing secret values in check metadata
- the shared generated-app redirect URI is present when the primary publish URL
  is known, or Graph access is sufficient to inspect it
- the GitHub OIDC federated credential exists for the managed repo and default
  branch, or Graph access is sufficient to inspect it
- required GitHub Actions secrets are present by name
- the Azure deploy workflow exists on the default branch
- the workflow can be dispatched by the configured GitHub App

Some checks may be inherently limited by provider APIs. When a check cannot prove
readiness without write access or unavailable metadata, it should record
`UNKNOWN` with a clear message rather than silently passing.

Preflight status mapping:

- all required checks pass: `READY`
- missing or stale setup that repair can write: `NEEDS_REPAIR`
- permission or configuration failure that prevents repair: `BLOCKED`
- provider uncertainty that requires operator review: `NEEDS_REPAIR` or
  `BLOCKED`, depending on whether repair can safely attempt the write

## Repair Service

The repair service should perform only publishing setup work. It must not
dispatch a deployment workflow and must not mark an app as published.

Repair should be idempotent and may:

- provision or update portal-owned Azure Web App and database resources
- reapply App Service app settings
- ensure the Entra redirect URI for the app's primary publish URL
- ensure the GitHub OIDC federated credential for the managed repo branch
- set required GitHub Actions secrets
- verify the deploy workflow file exists
- verify workflow dispatch readiness
- rerun preflight after repair and record fresh check results

Repair must not:

- delete Azure resources
- delete GitHub repositories or branches
- overwrite imported app source files
- open or merge repository preparation PRs
- dispatch `deploy-azure-app-service.yml`

If repair hits `Authorization_RequestDenied` from Microsoft Graph, it should
classify the app as `BLOCKED` and preserve the specific Graph request summary in
safe operator-facing form.

## Publish Integration

Publish actions should be gated by publishing setup status.

Before queuing a publish attempt:

- generated apps may enter setup if status is `NOT_CHECKED`, but setup failures
  should be classified as setup failures
- imported apps require repository preparation to be committed and setup status
  to be `READY`
- apps with `NEEDS_REPAIR`, `REPAIRING`, or `BLOCKED` should not queue a
  deployment attempt

The publish worker should split setup and deployment failure classification:

- failures before workflow dispatch become setup failures
- failures after workflow dispatch remain deployment failures

When a publish attempt fails before dispatch because setup cannot be completed,
the app should store:

- `publishStatus=FAILED`
- `publishingSetupStatus=NEEDS_REPAIR` or `BLOCKED`
- `publishingSetupErrorSummary` with the actionable setup message
- `publishErrorSummary` referencing the setup blocker

The UI should show `Repair Publishing Setup` for setup failures. It should show
`Retry Publish` only when setup is ready and the last failure was a deployment,
workflow, or verification failure.

## Error Handling

Graph permission errors should be detected by status and payload, including:

- HTTP `403`
- Graph error code `Authorization_RequestDenied`
- message text such as `Insufficient privileges to complete the operation.`

The portal should avoid exposing raw JSON as the primary user message. Raw
request IDs may be retained in audit logs or safe metadata for operator support.

Recommended summary:

```txt
Microsoft Graph permission is missing for Entra publishing setup.
```

Recommended operator detail:

```txt
Grant the portal runtime identity permission to update the shared app
registration redirect URIs and the publisher application's federated identity
credentials, then run Repair Publishing Setup.
```

The likely permissions remain those described in the Azure publish runtime
design: the narrowest workable Graph permission, such as
`Application.ReadWrite.OwnedBy`, with the portal or publisher identity as an
owner of the relevant app registrations.

## Auditing

Audit important setup transitions:

- `PUBLISHING_PREFLIGHT_REQUESTED`
- `PUBLISHING_PREFLIGHT_COMPLETED`
- `PUBLISHING_PREFLIGHT_FAILED`
- `PUBLISHING_REPAIR_REQUESTED`
- `PUBLISHING_REPAIR_SUCCEEDED`
- `PUBLISHING_REPAIR_FAILED`
- `PUBLISHING_REPAIR_BLOCKED`

Payloads should include:

- app request id
- support reference
- source of truth
- repository coordinates
- setup status
- failed check keys
- safe provider request ids when available

Payloads must not include tokens, secrets, connection strings, private keys, or
credential-bearing URLs.

## Testing

Unit tests:

- Graph `403 Authorization_RequestDenied` is classified as setup blocked.
- Graph setup errors produce the actionable summary and operator detail.
- preflight maps pass, fail, blocked, and unknown checks to the correct setup
  status.
- repair invokes setup methods but does not dispatch a workflow.
- repair reruns preflight and records fresh check evidence.
- publish gating rejects imported apps whose setup is not ready.
- publish gating sends generated apps through setup classification before
  dispatch.

Server action tests:

- `Repair Publishing Setup` is available for apps owned by the current user.
- repair is rejected for unauthorized app requests.
- repair updates setup state without changing publish success state.
- successful repair makes publish available again.
- failed repair hides `Retry Publish` and keeps repair guidance visible.

Page tests:

- imported apps show setup findings after preparation.
- generated apps show repair after setup drift or setup-classified publish
  failure.
- publish and retry buttons are hidden when setup needs repair.
- repair button is visible for repairable setup failures.
- blocked Graph permission guidance is visible and readable.

Integration tests should mock Azure, Graph, and GitHub provider clients rather
than making live cloud calls. A live operator smoke test can validate the real
permission model after Azure and Graph roles are configured.

## Implementation Boundaries

Build this in a staged way:

1. Add setup status schema and check evidence records.
2. Add setup error classification, especially Microsoft Graph permission
   failures.
3. Extract setup work from the Azure publish runtime into reusable setup/repair
   functions.
4. Add read-only preflight checks where provider APIs support them.
5. Add repair action and UI.
6. Gate publish/retry by setup readiness.
7. Run import-time preflight after imported repository preparation is committed
   or verified.
8. Add generated-app repair handling for setup failures and drift.

This keeps the first implementation focused on preventing repeated doomed
publishes while leaving room to deepen individual checks over time.

## Approved Decisions

- Use a read-only preflight first and an explicit repair action second.
- Apply repair to both imported apps and generated apps.
- Require imported apps to pass publishing setup readiness before publishing.
- Do not dispatch deployments from repair.
- Treat Microsoft Graph `403 Authorization_RequestDenied` as a setup blocker,
  not an ordinary deployment retry failure.
