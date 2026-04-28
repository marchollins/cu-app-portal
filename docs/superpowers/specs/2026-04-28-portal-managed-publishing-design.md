# Portal-Managed Publishing Design

## Overview

This design replaces the ZIP-first publishing roadmap with a portal-as-source-of-truth model.

The portal should still generate a downloadable ZIP artifact, but the supported publishing path now centers on a managed GitHub repository created and tracked by the portal for each app request. Users continue doing app customization locally on their own machines in Codex. The portal later publishes from the pushed GitHub state.

## Why Change The Model

The ZIP-first model breaks down once publishing moves into the portal:

- the portal loses track of source changes made after download
- users must recreate repository and deployment context manually
- support teams have no stable system of record for publish state
- publishing becomes ambiguous when the ZIP, local repo, and cloud deployment diverge

The managed-repo model solves this by giving the portal one canonical source of truth for supported publish flows.

## Product Decisions

The active publishing model is:

1. User signs into the portal with Cedarville SSO.
2. User creates an app from an approved template.
3. Portal renders source deterministically and creates a managed GitHub repository.
4. Portal stores the repo coordinates on the app request.
5. User opens that repo locally in Codex.
6. Codex handles local clone/edit/commit/push as transparently as possible.
7. User returns to the portal and triggers `Publish to Azure`.
8. Portal publishes from the tracked GitHub repo state.

The downloaded ZIP remains a convenience artifact and fallback, not the canonical publish handoff.

## GitHub Model

### Credential Model

The portal uses a GitHub App for repository automation.

This is preferred over:

- user-provided PATs
- user-managed GitHub CLI setup
- a long-lived service-account PAT

The GitHub App should be installed on Cedarville-owned orgs and used to:

- create the managed repository
- push the initial source snapshot
- set default branch and approved repo defaults
- support later workflow and deployment integration

### Organization Model

Org targeting is configuration-driven.

Near-term expectation:

- development and testing use the Cedarville IT GitHub org
- production can later target a different Cedarville-managed app org

Required rule:

- persist the actual org and repo coordinates on the app request when the repo is created

Future default-org changes must not affect existing requests.

Recommended configuration:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_ALLOWED_ORGS`
- `GITHUB_DEFAULT_ORG`
- `GITHUB_DEFAULT_REPO_VISIBILITY`
- installation lookup by org, or equivalent per-org installation mapping

End users do not choose the target org in v1.

## User Experience

### Supported Path

The end user should not need to manually set up GitHub or Azure tooling for the supported flow.

Required user capabilities:

- Cedarville portal access
- GitHub account access to the managed repo if they want to edit locally

Not required for the happy path:

- manual `git` commands
- `gh`
- `az`
- personal access tokens

### Local Codex Workflow

Local Codex editing is the preferred workflow.

Reasons:

- lower credit cost than cloud-first repo work
- closer to the current user workflow
- easier transition from the existing generated-app experience

Portal publishing still relies on pushed GitHub state. Unpushed local changes are not publishable.

## Data Model Direction

`AppRequest` must track:

- source-of-truth mode
- managed repo coordinates
- repo readiness state
- publish state
- publish URL and latest error summary

`PublishAttempt` records each queued or retried publish attempt so publish history is preserved.

## System Responsibilities

### Create Flow

The create flow should:

- validate and persist the app request
- render a deterministic source snapshot
- save the ZIP artifact
- bootstrap the managed GitHub repo
- store repo metadata and repo status
- redirect to a success page that shows ZIP + repo status

Repository bootstrap failure should not discard a successfully generated ZIP artifact. The portal should surface a repo failure state separately.

### Publish Flow

The portal should:

- queue a publish attempt for owned requests with a ready managed repo
- provision Azure resources from the deployment manifest
- deploy from the tracked GitHub repo
- verify the deployment and persist the public URL

The first supported target stays intentionally narrow:

- `web-app` template only
- GitHub only
- Azure App Service only
- Azure Database for PostgreSQL only

## Compatibility

The generated publishing bundle remains useful:

- as fallback docs
- as historical continuity with the earlier generated-app publishing phase
- as a portability layer via the deployment manifest

But the active roadmap now treats the portal, not the generated-app skill, as the primary orchestration point.
