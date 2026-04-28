# Node/Next.js Azure Publishing Design

> Historical note: this document captures the earlier generated-app-skill-first publishing phase. The active roadmap for portal-owned publishing now lives in `docs/superpowers/specs/2026-04-28-portal-managed-publishing-design.md`.

## Overview

This design defines the first publishing automation path for Cedarville-generated apps.

The initial goal is to let a non-technical user take a generated Node/Next.js application and publish it to GitHub and Azure App Service with as little manual interaction as possible. The first implementation lives inside the generated app as a local Codex skill plus deployment scaffolding. The longer-term goal is to move the same behavior into the portal so publishing can be orchestrated centrally.

This design is intentionally Node/Next.js-first, but it introduces a reusable deployment manifest and template structure so future templates for Python and other runtimes can plug into the same model.

## Goals

- Minimize user workload for first-time publishing.
- Use command-line automation wherever possible through `git`, `gh`, and `az`.
- Standardize a supported `Node/Next.js -> GitHub -> Azure App Service` path that works reliably for portal-generated apps.
- Record instructions and lessons learned in a form that can be reused by templates and later promoted into portal-managed publishing.
- Keep a plain-English fallback guide in the generated app so users are not blocked if automation partially fails.

## Non-Goals

- Full in-portal deployment orchestration in this phase.
- Supporting every Azure hosting option or deployment topology.
- Solving Python or non-Node publishing in the first implementation.
- Eliminating every required cloud choice. Some inputs such as subscription and region must still come from the user or local CLI context.

## Product Decision

The default publishing path for the first implementation is:

1. Generated app includes a local publishing skill and deployment metadata.
2. User asks Codex in the generated app to publish to Azure.
3. The skill uses `git`, `gh`, and `az` to automate repository creation, Azure resource provisioning, GitHub workflow setup, initial push, and initial deployment.
4. The generated app also includes human-readable publishing docs and recovery guidance.

This path is preferred over a docs-only approach because it removes repeated manual work and establishes a reusable automation contract that the portal can eventually own directly.

## Supported First Runtime Shape

The first supported runtime shape is a Node/Next.js web application generated from the current `web-app` template.

The deployment target is Azure App Service on Linux with GitHub Actions as the default deployment mechanism.

The generated app should use one supported deployment shape rather than allowing per-app customization. This keeps the non-technical experience stable and reduces the number of Azure-specific failure modes.

## Recommended Deployment Architecture

### Publish Flow

The automated publish flow should proceed in this order:

1. Validate local prerequisites.
2. Determine or confirm publish inputs.
3. Initialize or validate the local git repository.
4. Create or connect the GitHub repository.
5. Create Azure resources.
6. Configure GitHub-to-Azure deployment authentication.
7. Add the generated GitHub Actions workflow and required repository settings.
8. Push the repository.
9. Wait for or trigger the first deployment.
10. Verify the deployed app URL.
11. Report success in plain language, including where to manage the app later.

### Azure Resource Model

The first implementation should create:

- one Azure resource group
- one Azure App Service plan
- one Azure web app

This is intentionally simple. It is easier for non-technical users to understand, easier to clean up, and sufficient for the first publishing milestone.

### GitHub Deployment Model

The generated app should include a GitHub Actions workflow for Azure App Service deployment.

The preferred authentication model is OpenID Connect if it can be made smooth enough for the generated-app skill. If OIDC setup proves too complex for the first non-technical experience, the first release may fall back to publish-profile-based deployment while explicitly recording that OIDC is the preferred hardening follow-up.

This tradeoff must be recorded in the generated lessons-learned document so the team can revisit it when moving publishing into the portal.

## User Experience

### Primary Experience

The target user experience is:

- Open the generated app in Codex.
- Ask to publish the app to Azure App Service.
- Answer only the minimum required questions, ideally:
  - app name
  - Azure subscription if multiple are available
  - Azure region
  - GitHub repository visibility if not inferable
- Let the skill perform the remaining setup automatically.

The skill should prefer deriving values from the generated app, local git state, CLI login state, and safe defaults rather than asking the user to type technical values.

### Fallback Experience

If automation cannot complete, the generated app must still contain:

- a plain-English step-by-step deployment guide
- a plain-English GitHub setup guide
- a lessons-learned and troubleshooting guide

This ensures the app remains publishable even if a CLI command fails or a required permission is missing.

## Generated App File Structure

Each generated Node/Next.js app should gain a small publishing bundle:

- `docs/publishing/azure-app-service.md`
- `docs/publishing/lessons-learned.md`
- `.github/workflows/deploy-azure-app-service.yml`
- `app-portal/deployment-manifest.json`
- `.codex/skills/publish-to-azure/SKILL.md`

Optional helper scripts may be added only if the skill needs reusable command wrappers or environment checks.

The generated app should continue to include high-level README guidance, but the publishing details should live under `docs/publishing/` so they can grow without cluttering the main README.

## Deployment Manifest

The deployment manifest is the portability layer between:

- the generated-app publishing skill in phase one
- future template-specific variants
- eventual portal-managed publishing

For the first Node/Next.js path, the manifest should describe:

- runtime family: `node`
- framework: `nextjs`
- hosting provider: `azure`
- hosting service: `app-service`
- deployment mechanism: `github-actions`
- startup strategy
- build strategy
- required Azure resources
- required GitHub configuration
- required app settings and environment variables
- safe default naming rules
- which values can be derived automatically
- links or paths to bundled docs/workflows/skills

The manifest should avoid storing secrets. It is configuration metadata, not credential storage.

## Automation Behavior

### Prerequisite Checks

The skill should verify:

- `git` is installed
- `gh` is installed and authenticated
- `az` is installed and authenticated
- the current directory contains a supported deployment manifest
- required generated files are present

If something is missing, the skill should stop with one clear recovery instruction per missing item.

### Git Automation

The skill should automate:

- repository initialization if `.git` does not exist
- branch naming using existing repo defaults where possible
- first commit when needed
- GitHub repository creation via `gh repo create`
- remote wiring
- initial push

It should avoid asking the user to manually copy files into a separate repository unless automation is blocked.

### Azure Automation

The skill should automate:

- selecting or confirming the target subscription
- creating the resource group if needed
- creating the App Service plan
- creating the web app
- applying required app settings
- configuring deployment authentication for GitHub Actions

It should prefer deterministic resource naming conventions derived from the app name, while checking for name collisions and offering a safe adjustment when required.

### Workflow Automation

The skill should ensure the repository contains a deployment workflow that matches the generated app and Azure target.

The workflow should be generated by the portal template, not handwritten by the end user. The skill may fill in a small number of workflow placeholders when wiring the first publish.

## Lessons Learned Capture

The first implementation must explicitly record lessons learned in a reusable form.

At minimum, `docs/publishing/lessons-learned.md` should capture:

- which Azure assumptions are baked into the supported path
- which commands require prior authentication
- the preferred auth model for GitHub Actions and any temporary fallback
- common failure modes such as missing Azure permissions, repository naming conflicts, or startup misconfiguration
- which recovery actions are safe for non-technical users
- which issues should be escalated to a technical operator

These notes should be written for future template authors and portal maintainers, not only for end users.

## Reuse Strategy For Future Templates

The first implementation should separate:

- universal publishing concepts
- runtime-specific deployment details
- template-specific defaults

That means future Python or other templates should be able to reuse the same broad model:

- a deployment manifest
- a generated publishing skill
- bundled publishing docs
- a generated GitHub Actions workflow

Only the runtime- and framework-specific sections should need to change.

## Portal Migration Path

The generated-app skill is the first delivery vehicle, not the final architecture.

To support a future portal-owned publishing flow, the first implementation should avoid burying behavior in prose. Instead, the skill should read from the deployment manifest and bundled files. Later, the portal can generate the same manifest and either:

- continue emitting the local skill for backward compatibility, or
- consume the manifest directly and orchestrate publishing from the portal itself

This migration path is a core design constraint for the first implementation.

## Error Handling

The automation should be optimized for clarity over raw completeness.

When a step fails, the skill should:

1. identify which stage failed
2. summarize the likely cause in plain language
3. show the exact command that failed when helpful
4. point the user to the relevant fallback doc when needed
5. stop before making the state more confusing

The skill should avoid cascading through multiple failing steps after a prerequisite failure.

## Testing Strategy

The implementation should be validated at three levels:

### Unit-level

- deployment manifest rendering
- instruction file generation
- workflow generation
- naming/default derivation

### Integration-level

- archive generation includes publishing assets
- template output varies correctly by supported hosting target

### Manual operator validation

- run the generated-app publish flow in a real test repository and Azure subscription
- record every manual input that was still necessary
- update `lessons-learned.md` based on observed friction

Because Azure publishing involves real credentials and cloud resources, this first milestone should expect a combination of automated local tests and manual cloud validation.

## Open Decisions To Resolve During Implementation

- whether the first release uses OIDC or publish profile for GitHub Actions authentication
- the exact Next.js build/start strategy used on App Service
- whether lightweight helper scripts improve reliability enough to justify their maintenance cost
- how much of the GitHub and Azure naming scheme should be user-visible versus fully derived

These are implementation questions within the approved architecture, not reasons to revisit the overall design.

## Success Criteria

This design is successful when:

- the `web-app` template can generate a Node/Next.js app with publishing assets included
- the generated app contains a working Codex skill for Azure publishing
- a non-technical user can complete publishing with only a small number of guided inputs
- the generated app contains clear fallback docs and lessons learned
- the structure is reusable for future runtime-specific templates
