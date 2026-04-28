# Portal-Managed Publishing Implementation Plan

## Goal

Implement the first portal-owned publishing slice where the portal creates and tracks a managed GitHub repository for each app request and can queue publish attempts against that repository.

This implementation intentionally stops short of full Azure provisioning automation. It establishes the schema, repo bootstrap, status UX, queueing model, and docs needed for the next execution phase.

## Milestone 1: Schema And Status Model

- Extend `AppRequest` with source-of-truth, repo, and publish status fields.
- Add `PublishAttempt` for publish history and retries.
- Introduce enums for repository and publish lifecycle states.
- Preserve existing artifact ownership and generation behavior.

Acceptance:

- existing app requests continue to support artifact download
- new requests persist repo and publish status fields
- publish retry history can be stored without overwriting previous attempts

## Milestone 2: Managed Repo Bootstrap During Create

- Render a reusable source snapshot before ZIP packaging.
- Generate the ZIP from the same source snapshot committed to GitHub.
- Add a repository bootstrap service that resolves GitHub org config, creates the repo through a GitHub App, and pushes the initial source.
- Update the create action to mark repo state as `READY` or `FAILED` without losing a successful ZIP artifact.
- Add audit events for bootstrap requested, succeeded, and failed.

Acceptance:

- successful create stores repo owner, name, URL, branch, visibility, and ready state
- bootstrap failure still redirects to the app success page with a failed repo state
- no code path recomputes repo org for an existing request after creation

## Milestone 3: Success Page And My Apps UX

- Replace manual GitHub checklist copy on the success page with managed-repo messaging.
- Show ZIP download, repo status, repo URL, publish status, and latest publish note.
- Add `My Apps` as the durable revisit surface for owned app requests.
- Show publish/retry actions only when the managed repo state allows them.

Acceptance:

- success page no longer tells users to create a GitHub repo manually
- only the owning user sees repo and publish state for a request
- `My Apps` lists repo and publish states for the signed-in user only

## Milestone 4: Publish Queue And Worker Skeleton

- Add server actions to queue publish requests and retries for owned requests.
- Create `PublishAttempt` rows and move app requests into `QUEUED`.
- Add a publish worker entrypoint that can move a publish attempt through provisioning, deploy, verify, success, and failure states.
- Keep the default publish runtime as a clear “not configured yet” failure until Azure automation lands.
- Record publish requested, succeeded, and failed audit events.

Acceptance:

- queueing a publish attempt updates app request status and preserves history
- retry creates a new attempt instead of mutating the previous one
- worker code updates attempt and request states predictably on success and failure

## Milestone 5: Docs And Template Guidance

- Add the active `2026-04-28` design and implementation docs.
- Update README and portal docs to describe the managed-repo direction.
- Update template-authoring guidance so publishing-capable templates assume portal-managed repos and manifest-driven orchestration.
- Keep the `2026-04-23` publishing docs as historical context for the earlier generated-app skill phase.

Acceptance:

- docs consistently describe ZIP as a convenience artifact rather than the primary source of truth
- docs call out local Codex editing and portal publishing from pushed GitHub state
- docs describe GitHub org targeting as configuration-driven and persisted per request

## Follow-On Work After This Slice

- real Azure provisioning runtime behind the publish worker
- GitHub user-to-repo access mapping and optional automatic collaborator assignment
- stronger publish verification and health checks
- operator-facing publish logs and richer retry controls
- migration of older requests that predate managed repo metadata
