# Cedarville App Portal V1 Design

## Overview

This document defines the first release of the Cedarville App Portal. The portal is an internal web application used by Cedarville University staff to create a new Codex-compatible application package without requiring local developer tooling.

Version 1 focuses on one primary workflow:

1. A Cedarville staff member signs in with Cedarville SSO.
2. The user selects an approved application template.
3. The user completes a guided configuration form.
4. The portal generates a downloadable ZIP package.
5. The portal provides next-step instructions for creating a GitHub repository and completing deployment outside the portal.

V1 intentionally does not include browsing apps created by others, in-portal deployment, or full lifecycle app management. The design includes light scaffolding for those future capabilities where it improves forward compatibility without increasing current complexity.

## Goals

- Provide a simple, reliable internal workflow for non-technical Cedarville staff to create a new application package.
- Enforce Cedarville standards through curated templates instead of relying on users to configure technical details manually.
- Produce deterministic ZIP artifacts that can be supported, documented, and validated consistently.
- Require Cedarville authentication before app creation and download.
- Make the post-download path understandable by bundling clear GitHub repository setup instructions and deployment guidance.

## Non-Goals

- Running Codex dynamically inside the portal during V1 generation.
- Publishing or deploying apps directly from the portal.
- Providing an app gallery or browse experience.
- Supporting external users or non-Cedarville identities.
- Exposing every technical option as a user choice.

## Product Scope

The V1 portal is an authenticated internal tool centered on a single top-level action: `Create New App`.

The user experience is intentionally narrow:

- Sign in with Cedarville Entra ID.
- Choose one portal-approved template.
- Enter a small set of configuration values.
- Generate and download a ZIP package.
- Review a structured checklist for GitHub repository setup and deployment outside the portal.

The portal should include reserved navigation and data fields for future expansion, but those areas should not distract from the primary workflow in V1.

## Recommended Architecture

The recommended implementation is a metadata-driven portal.

In this model, the portal does not ask Codex to generate a bespoke application at runtime. Instead, each template is represented as a controlled, versioned definition that includes:

- Template metadata shown in the portal
- Input schema for the user-facing form
- Source files and folders included in the generated ZIP
- Replacement tokens used to customize template files
- Bundled instructions for GitHub setup and deployment

This approach is preferred for V1 because it is more predictable, easier to support, easier to test, and better aligned with a non-technical audience than runtime AI generation.

## System Components

### 1. Authentication and User Context

The portal uses Cedarville Entra ID for authentication. Only authenticated Cedarville staff can access the app creation flow.

The local application stores only the minimal user data needed for ownership, auditability, and future personalization. The portal should treat Entra as the system of record for identity.

### 2. Template Catalog

The portal exposes a curated list of internal templates. Each template is versioned and can be enabled or disabled without removing historical app request records.

Each template definition should include:

- Stable template identifier
- Display name and description
- Template version
- User input schema
- Hosting target options, if applicable
- File generation rules
- Included instruction assets
- Publication status

The portal should only show templates marked as active and valid for general users.

### 3. App Request and Generation Workflow

When a user submits the create form, the portal should:

1. Validate all required inputs.
2. Persist a new app request record.
3. Generate a ZIP artifact from the selected template version and submitted values.
4. Store metadata about the generated artifact.
5. Present a download page with the ZIP and next-step instructions.

Generation should be deterministic. Given the same template version and the same submitted inputs, the output should be materially the same except for allowed metadata such as creation timestamps, generated identifiers, or artifact filenames.

### 4. Artifact Delivery

The generated ZIP is the primary deliverable in V1.

The ZIP should contain:

- Application starter code
- Cedarville styling defaults
- Entra configuration placeholders and setup instructions
- Hosting-specific deployment instructions, where applicable
- A GitHub setup guide describing how to create and populate a repository from the generated package

The download page should also repeat the essential next steps in the UI so the user does not have to discover them only after extracting the ZIP.

### 5. Future-Ready Scaffolding

The data model and basic information architecture should leave room for future features such as:

- My Apps
- Browse Apps
- App visibility controls
- Deployment tracking
- In-portal publishing workflows

This scaffolding should remain minimal in V1. It should not create partially functional screens or misleading navigation paths.

## User Experience

### Entry Point

After sign-in, the user lands on a straightforward internal home page with one clear primary action: create a new app.

### Template Selection

The user selects from a short list of approved templates. Each option should explain:

- What kind of app it creates
- Any notable constraints
- Which hosting targets it supports

### Guided Form

The form should be concise and operationally focused. It should collect only the inputs that materially affect generated output.

Expected example fields:

- App name
- Short description
- Hosting target
- Template-specific configuration values

Any setting that Cedarville can standardize should be preconfigured in the template rather than exposed to users.

### Generation Result

After successful generation, the portal shows:

- A success message
- Download link for the ZIP package
- Summary of the chosen template and submitted values
- A step-by-step GitHub repository setup checklist
- A deployment handoff checklist

The UI should clearly state that the portal prepares the package but does not perform publishing in V1.

## Data Model

The initial schema should remain compact and focused.

### `users`

Stores locally cached identity details for Cedarville-authenticated users.

Suggested fields:

- `id`
- `entra_oid`
- `email`
- `display_name`
- `created_at`
- `updated_at`

### `templates`

Stores template catalog metadata and references to template assets.

Suggested fields:

- `id`
- `slug`
- `name`
- `description`
- `version`
- `status`
- `input_schema`
- `hosting_options`
- `created_at`
- `updated_at`

### `app_requests`

Represents each user attempt to create an application package.

Suggested fields:

- `id`
- `user_id`
- `template_id`
- `template_version`
- `app_name`
- `submitted_config`
- `generation_status`
- `artifact_id`
- `support_reference`
- `visibility`
- `deployment_target`
- `published_at`
- `created_at`
- `updated_at`

The fields `visibility`, `deployment_target`, and `published_at` are included primarily for future expansion.

### `generated_artifacts`

Tracks downloadable ZIP files and their metadata.

Suggested fields:

- `id`
- `app_request_id`
- `storage_path`
- `filename`
- `checksum`
- `content_type`
- `size_bytes`
- `expires_at`
- `created_at`

## Validation and Error Handling

The portal should be designed for a non-technical audience.

Validation requirements:

- Required fields must be enforced before generation begins.
- Validation errors must point to the exact field that needs correction.
- Error messages must use plain operational language.

Failure handling requirements:

- Generation failures must return a user-safe error message.
- The UI must offer a retry path when retrying is safe.
- Each failed run must have a support reference ID.
- Technical logs must be recorded internally without exposing stack traces to users.

Template safety requirements:

- Invalid or incomplete templates must not be visible to standard users.
- Historical app requests must remain interpretable even if a template is later disabled.

## Security and Access

- All create and download flows require Cedarville authentication.
- Access to generated artifacts must be scoped to the requesting user in V1 unless a future sharing model is explicitly introduced.
- The portal should minimize storage of identity data and avoid duplicating authoritative directory information beyond operational needs.
- Audit logging should capture key events such as sign-in, app generation request, generation success, and download.

## Testing Strategy

The V1 test plan should cover three main confidence levels.

### Authentication and Authorization

- Verify unauthenticated users cannot access protected routes.
- Verify authenticated Cedarville users can access the creation flow.
- Verify one user cannot access another user's generated artifact.

### Template Rendering and Artifact Generation

- Verify required inputs are enforced.
- Verify token replacement is correct across generated files.
- Verify instruction assets are included in the ZIP.
- Verify invalid template configuration fails safely.
- Verify generated artifacts are deterministic for the same template version and input set.

### End-to-End Workflow

- Verify a signed-in user can select a template, submit the form, generate an artifact, and download the ZIP.
- Verify the success page includes GitHub setup instructions and deployment handoff guidance.

Fixture-based tests should be used for generated output so that changes to template behavior are reviewed intentionally rather than slipping in unnoticed.

## Operational Assumptions

- The first release serves internal Cedarville staff only.
- The portal owns package generation, not GitHub repository creation and not deployment execution.
- ZIP artifacts may eventually need retention or cleanup policies, but V1 can begin with a simple storage approach as long as artifact metadata is tracked.
- The template system is the contract that later template-authoring and container work will target.

## Future Expansion

This design intentionally leaves room for later work in adjacent sub-projects:

- Template authoring standards for Codex-generated apps
- Standardized Cedarville branding and Entra integration instructions
- Deployment instructions for multiple hosting environments
- A builder container with CLI tooling for later automation
- Portal views for managing owned apps and browsing shared apps

Those efforts should build on the interfaces defined by this portal rather than forcing the portal to absorb those responsibilities in V1.

## Open Decisions Deferred From V1

These decisions are intentionally deferred because they are not required to launch the first working portal:

- Which exact web framework and database stack to use
- Which storage mechanism to use for generated ZIP artifacts
- Which hosting targets are included in the initial template catalog
- Whether admins need a separate template management UI or if templates are managed in code
- Artifact retention duration and cleanup automation

These should be resolved during implementation planning, not during initial product scoping.
