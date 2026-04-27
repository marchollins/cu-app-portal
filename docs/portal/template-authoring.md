# Template Authoring

Templates are metadata-driven starter packages used by the portal to generate ZIP artifacts.

## Template Structure

Each template lives under `templates/<slug>/` and currently includes:

- `template.json` for manifest metadata
- `files/` for renderable starter files
- `.template` file extensions for source files that receive token replacement

Templates may also split output between:

- `entryFiles` in `template.json` for real on-disk template assets under `files/`
- `generatedFiles` in `template.json` for archive entries produced by code during generation

## Supported Tokens

The web app starter currently supports these tokens:

- `{{APP_NAME}}`
- `{{APP_NAME_SLUG}}`
- `{{APP_DESCRIPTION}}`
- `{{HOSTING_TARGET}}`
- `{{APP_NAME_JS}}`
- `{{APP_DESCRIPTION_JS}}`

Use the `*_JS` tokens when rendering into JavaScript or JSX string-expression contexts so user input is escaped safely.

## Catalog Metadata

The in-code template catalog lives in `src/features/templates/catalog.ts`.

Each template entry defines:

- slug and display metadata
- status (`ACTIVE` or `DISABLED`)
- the fields rendered in the create form

The current `web-app` template is intentionally Azure App Service only while the first publishing automation path is being hardened.

## Publishing Bundle

Publishing-capable templates can include assets such as:

- `.github/workflows/`
- `.codex/skills/`
- `docs/publishing/`

The current `web-app` template also emits a generated deployment manifest at `app-portal/deployment-manifest.json` so generated-app skills and future portal publishing flows can share the same deployment contract.

## Database Sync

Run `npm run prisma:seed` after catalog changes so the database template rows stay aligned with the in-code catalog used by the portal.
