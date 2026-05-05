# Add Existing App Design

## Overview

This design adds a second path into the Cedarville App Portal: users can add an existing GitHub app repository to the portal so it can become portal-managed and eligible for Azure publishing.

The feature extends the current portal-managed publishing model instead of creating a separate lifecycle. Generated apps and added existing apps should both end as owned `AppRequest` records with managed GitHub repository coordinates, publish status, Azure target state, and publish attempts.

The v1 scope stays intentionally narrow:

- GitHub repositories only
- GitHub App-based access only
- Node/Next-style web apps only
- Azure App Service publishing only
- shared Cedarville GitHub org as the supported source of truth
- user choice between direct modification and PR creation for publishing additions

## Goals

- Let a Cedarville user bring an existing compatible app repo into the portal.
- Preserve source history when importing repositories into the shared Cedarville org.
- Keep the shared-org repository as the supported source of truth for Azure publishing.
- Add the same Azure publishing contract used by generated apps without overwriting existing files.
- Let the user choose direct commit or PR creation for required publishing additions.
- Reuse the existing `My Apps` and `Publish to Azure` lifecycle once the repo is ready.
- Surface blocked states clearly when the portal cannot read, import, analyze, or prepare a repository.

## Non-Goals

- Supporting arbitrary frameworks or non-Node applications.
- Adding GitHub OAuth or storing user GitHub tokens.
- Mutating repositories outside the configured shared Cedarville org.
- Flattening repository history into a source snapshot import.
- Rewriting app source code to make unsupported apps publishable.
- Replacing existing user workflows or deployment files.
- Publishing directly from the original external repository.

## Product Flow

The portal adds a new `Add Existing App` entry point from the home page and `My Apps`.

The user flow:

1. User opens `/apps/add`.
2. User enters a GitHub repository URL, display app name, and optional description.
3. Portal validates and normalizes the GitHub URL.
4. Portal checks whether the source repository is readable by the configured GitHub App.
5. Portal checks whether the source repository is already in the configured shared Cedarville org.
6. If the repo is outside the shared org, the portal imports it into the shared org while preserving git history.
7. Portal scans the managed repository for v1 Azure publishing compatibility.
8. Portal presents a preparation summary with compatibility findings and the files or config changes it can add safely.
9. User chooses either direct modification or PR creation.
10. Portal commits publishing additions directly to the managed repo or opens a PR in the managed repo.
11. Once the repo has the required publishing additions on its default branch, the app appears as publishable in `My Apps`.
12. User triggers `Publish to Azure` through the existing publish flow.

The portal must not present an unsupported app as publishable. If the repository fails access, import, compatibility, or preparation checks, the app remains in a blocked state with specific reasons and next steps.

## Recommended Architecture

Build this as a second source path into the existing app request model.

Generated app creation currently:

- renders a source snapshot
- creates a managed GitHub repository
- stores repository coordinates on `AppRequest`
- uses the same repository for Azure publishing

Added existing apps should converge on the same state:

- an owned `AppRequest`
- `sourceOfTruth` identifying the app as imported
- managed shared-org repository coordinates
- repository readiness status
- publish readiness status
- existing Azure publish fields and `PublishAttempt` records

The new workflow should be split into small services:

- GitHub repository URL parser and normalizer
- source repository access checker
- history-preserving repository importer
- repository compatibility scanner
- Azure publishing bundle planner
- safe repository mutation and PR creator
- server actions for submit, retry, prepare, and publish readiness transitions

This keeps GitHub import and preparation concerns isolated while allowing Azure publishing to stay shared with generated apps.

## Data Model

Extend `SourceOfTruth` with:

- `PORTAL_MANAGED_REPO`: generated apps created from portal templates
- `IMPORTED_REPOSITORY`: existing apps added through the new flow

Keep `AppRequest` as the user-facing app record. It should continue to own:

- user ownership
- display app name
- source-of-truth mode
- managed repository coordinates
- repository status
- publish status
- Azure target fields
- publish attempts

Add a related `RepositoryImport` record to capture import and preparation evidence without overloading `AppRequest`.

Suggested `RepositoryImport` fields:

- `id`
- `appRequestId`
- `sourceRepositoryUrl`
- `sourceRepositoryOwner`
- `sourceRepositoryName`
- `sourceRepositoryDefaultBranch`
- `targetRepositoryOwner`
- `targetRepositoryName`
- `targetRepositoryUrl`
- `targetRepositoryDefaultBranch`
- `importStatus`
- `importErrorSummary`
- `compatibilityStatus`
- `compatibilityFindings`
- `preparationMode`
- `preparationStatus`
- `preparationBranch`
- `preparationPullRequestUrl`
- `preparationErrorSummary`
- `createdAt`
- `updatedAt`

Suggested import statuses:

- `NOT_REQUIRED`
- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `BLOCKED`

Suggested compatibility statuses:

- `NOT_SCANNED`
- `COMPATIBLE`
- `NEEDS_ADDITIONS`
- `UNSUPPORTED`
- `CONFLICTED`

Suggested preparation modes:

- `DIRECT_COMMIT`
- `PULL_REQUEST`

Suggested preparation statuses:

- `NOT_STARTED`
- `PENDING_USER_CHOICE`
- `RUNNING`
- `COMMITTED`
- `PULL_REQUEST_OPENED`
- `FAILED`
- `BLOCKED`

An imported app is publishable only when:

- the current user owns the `AppRequest`
- the managed shared-org repository is `READY`
- import has succeeded or was not required
- compatibility is `COMPATIBLE` or `NEEDS_ADDITIONS` with required additions already applied to the default branch
- no unresolved preparation conflict remains

## GitHub Access Model

V1 uses the existing GitHub App model.

The portal accepts:

- public GitHub repositories readable by the portal
- private repositories readable by the Cedarville GitHub App installation
- repositories already in the configured shared Cedarville org

The portal does not accept private external repositories that only the signed-in user can read through their personal account. If users need to add those repos, the blocked-state instructions should tell them to make the repo accessible to the Cedarville GitHub App or ask an operator to import it.

The target shared org comes from existing GitHub configuration, typically `GITHUB_DEFAULT_ORG`. The portal must persist the actual target owner, repo name, URL, and default branch on the `AppRequest` and `RepositoryImport` records. Future default-org changes must not alter existing app records.

## Repository Import

If the source repository is already in the configured shared Cedarville org, no import is required. The portal analyzes and prepares that repo directly.

If the source repository is outside the shared org, the portal imports it into the shared org and preserves git history.

The preferred import mechanism is Git over HTTPS using a short-lived GitHub App installation token. GitHub's old Source Imports API is retired, so implementation should not rely on that API.

Import behavior:

- derive a target repo name from the source repo name
- create a collision-safe alternate name when needed
- clone the source repo with full history when readable
- create the target repo in the shared org
- push all branches and tags needed to preserve useful history
- set or record the target default branch
- record both source and target coordinates

If history-preserving import cannot be completed safely, the portal should block and show an operator-action message. It should not silently import a flattened source archive because that loses audit history and conflicts with the approved product behavior.

Deletion behavior must remain scoped:

- deleting the portal app can delete the managed shared-org repository when selected
- deleting the portal app must never delete the original external source repository

## Compatibility Scan

The v1 compatibility scan is intentionally narrow and explainable. The scanner should inspect repository contents and classify the app before any mutation.

Required checks:

- `package.json` exists at the repository root
- `package.json` has a usable `build` script
- `package.json` has a usable `start` script or can safely receive one
- package manager lockfile shape is supported
- Node runtime target is compatible with Node 24 or can safely receive `engines.node`
- the repository does not contain conflicting App Portal files
- the current publish workflow can package required runtime files

Supported lockfile patterns:

- `package-lock.json`
- no lockfile, falling back to `npm install`

Unsupported in v1:

- repos without root `package.json`
- monorepos where the publishable app is not at the root
- package managers or workspace layouts that need custom build commands
- non-Node and non-Next app shapes

Conflict checks should include:

- `app-portal/deployment-manifest.json`
- `.github/workflows/deploy-azure-app-service.yml`
- `.codex/skills/publish-to-azure/SKILL.md`
- `docs/publishing/azure-app-service.md`

If a target publishing file already exists, the scanner should record a conflict instead of overwriting it.

## Safe Mutation Rules

The portal may prepare a compatible repo for Azure publishing only through narrow, deterministic changes.

Allowed changes:

- add missing publishing workflow file
- add missing App Portal deployment manifest
- add missing generated-app Codex publishing skill
- add missing Azure publishing docs
- add missing `docs/publishing/lessons-learned.md`
- add a missing `start` script to `package.json`
- add or refine `engines.node` in `package.json`

Forbidden changes:

- overwrite existing files
- delete files
- rename files
- rewrite application source code
- replace existing workflows
- remove scripts or dependencies
- make broad formatting-only changes

`package.json` edits must use JSON parsing and stable serialization. The portal should preserve existing scripts, dependencies, package metadata, and unrelated fields. If an existing value conflicts with the required runtime in a way that cannot be resolved safely, preparation should block or use PR review rather than direct commit.

## Direct Commit And PR Mode

The user chooses direct modification or PR creation after the compatibility summary.

Direct commit:

- commits safe additions to the managed repo default branch
- is available only when no conflicts are detected
- should be disabled or blocked for changes that require human judgment
- records the commit SHA and preparation result

PR creation:

- creates a branch such as `portal/add-azure-publishing`
- commits safe additions to that branch
- opens a PR in the managed shared-org repo
- includes compatibility findings and a checklist of changes in the PR body
- records the PR URL and preparation branch

If the user chooses direct commit and the portal later detects conflicts, it should not force changes. It should either fall back to the PR path when a PR can still represent the proposed changes safely, or block with a clear explanation.

Publishing should remain disabled until required publishing additions are present on the default branch. A PR-created app becomes publishable after the PR is merged and the portal verifies the required files on the default branch.

## Publishing Bundle

Added apps should reuse the same portal-managed Azure publishing contract as generated apps.

The preparation service should add or produce:

- `.github/workflows/deploy-azure-app-service.yml`
- `.codex/skills/publish-to-azure/SKILL.md`
- `docs/publishing/azure-app-service.md`
- `docs/publishing/lessons-learned.md`
- `app-portal/deployment-manifest.json`

The deployment manifest should be generated from the added app metadata and target repo coordinates. It should preserve the existing schema where possible so the current publish runtime can continue to use the same assumptions.

The workflow should remain compatible with the current Azure runtime:

- Node 24 setup
- install via `npm ci` when `package-lock.json` exists
- fallback to `npm install`
- run `npm run build`
- create a deployable `release/` package
- copy `.next`, `node_modules`, `package.json`, relevant lock/config files, `public/`, and `prisma/` when present
- use `azure/login`
- deploy with `azure/webapps-deploy`

The current workflow assumes a root Next.js app. If the app requires custom build paths, custom package-manager commands, or monorepo workspace selection, v1 should mark it unsupported.

## User Experience

### Add Form

`/apps/add` should include:

- GitHub repository URL
- app display name, defaulting from the repository name when possible
- optional description

The form should validate URL shape before starting GitHub work. Validation errors should be field-level and written in plain language.

### Analysis Result

After submission, the portal should show:

- source repository
- whether import is required
- managed target repository
- import status
- compatibility status
- compatibility findings
- files and config changes the portal can add
- blocked reasons, if any
- direct commit or PR creation choice when preparation is possible

### My Apps

`My Apps` should show added apps alongside generated apps.

Added app cards should include:

- source repo URL when different from managed repo
- managed repo URL
- import status
- compatibility status
- preparation status
- PR URL when applicable
- publish status

The existing `Publish to Azure` action should appear only after the managed repo is ready and publish additions are verified on the default branch.

## Error Handling

Invalid URL:

- show field-level validation
- do not create a repo import job

Inaccessible repo:

- mark import blocked
- explain that the repo must be public, shared with the Cedarville GitHub App, or imported by an operator

Unsupported app:

- show compatibility findings
- do not show `Publish to Azure`

Target repo collision:

- generate a collision-safe target name when possible
- record the target name actually used
- fail with operator guidance if no safe target can be selected

File conflicts:

- never overwrite
- direct commit unavailable
- PR only when proposed changes can coexist safely
- otherwise blocked with manual resolution guidance

GitHub API or git operation failure:

- record failed status and error summary
- offer retry when the operation is idempotent
- preserve the existing `AppRequest` where useful for support history

Publish failure:

- reuse existing publish attempt and publish status behavior

## Auditing

Audit events should be recorded for important lifecycle transitions:

- existing app add requested
- source repository access succeeded or failed
- repository import requested
- repository import succeeded or failed
- compatibility scan completed
- publishing preparation requested
- publishing preparation committed
- publishing preparation PR opened
- publishing preparation failed

Audit payloads should include app request id, support reference, source repo coordinates, target repo coordinates, and PR URL when present. They should not include installation tokens, secrets, or full git remote URLs containing credentials.

## Testing

Unit tests:

- GitHub repo URL parser and normalizer
- source vs shared-org repo classification
- target repo name generation and collision handling
- compatibility scanner
- publishing bundle planner
- safe `package.json` mutation
- file-conflict detection
- GitHub App client additions for repository reads, branch creation, commit creation, and PR creation

Server action tests:

- invalid URL is rejected
- inaccessible source repo produces blocked state
- already-shared repo skips import
- external readable repo creates import record and target repo
- compatible repo presents direct commit and PR options
- direct commit writes only safe additions
- PR mode creates branch and records PR URL
- conflicts block direct commit

Page tests:

- `/apps/add` form rendering and validation
- analysis result states
- blocked compatibility state
- preparation choice controls
- `My Apps` added-app status display

End-to-end:

- add a compatible test repo through mocked or local GitHub operations when feasible
- verify the app appears in `My Apps`
- verify `Publish to Azure` is unavailable before preparation and available after verified preparation

Targeted integration tests are preferred over live GitHub calls in the normal suite. Live GitHub verification should remain an operator-run smoke test because it depends on GitHub App installation and org permissions.

## Implementation Boundaries

The first implementation plan should not try to complete every future path at once. A good first slice is:

1. schema and status model
2. repo URL parsing
3. compatibility scanning from a repository file map
4. publishing bundle planning
5. `/apps/add` UI with mocked service boundary tests
6. GitHub App client methods needed for preparation
7. direct commit and PR creation for already-shared compatible repositories
8. history-preserving import for external readable repositories
9. publish-readiness verification and `My Apps` integration

This order gives the portal a usable already-shared-repo path before adding the heavier external import path.

## Approved Decisions

- V1 should use Approach A: portal-managed import and preparation.
- Source repo access should be limited to public repos or repos readable by the Cedarville GitHub App.
- V1 should support only Node/Next-style apps compatible with the current Azure App Service workflow.
- External imports should preserve git history.
- The portal may make narrow `package.json` changes when safe.
- Users should be offered direct modification or PR creation.
- PR creation is the safer fallback when conflicts or human review needs are detected.
