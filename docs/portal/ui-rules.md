# UI Rules — Cedarville App Portal

All UI work in this codebase must follow these rules. They exist to keep the portal
visually consistent with the Cedarville University brand and to avoid regressions as
new features land.

---

## Stack and constraints

- **Next.js 15 App Router** with React Server Components. Pages are `async` functions;
  interactive pieces are `"use client"` components.
- **No Tailwind, no component library.** All styles come from `src/app/globals.css`.
  Do not add Tailwind, shadcn, MUI, or any other CSS framework.
- **No inline style objects for design decisions.** Reserve `style={{}}` for truly
  one-off layout values (e.g. `maxWidth: "640px"` on a single card). Colors, spacing,
  typography, and border decisions must use CSS custom properties or class names from
  the design system.
- **No new CSS files.** Add new rules to `globals.css` only, inside the relevant
  section, with a comment header.

---

## Brand colors

Always use the CSS custom properties — never hardcode hex values in JSX or CSS rules.

| Token | Value | Use |
|---|---|---|
| `--cu-navy` | `#003865` | Primary brand color. Headers, borders, primary buttons, text headings. |
| `--cu-navy-dark` | `#00253d` | Hover state for navy elements, footer background. |
| `--cu-gold` | `#fcb716` | Accent. Secondary buttons, `.page-header` bottom border, card left-border accents, footer top border. |
| `--cu-gold-dark` | `#cf962a` | Hover state for gold buttons. |
| `--cu-teal` | `#018fb6` | Link hover color, breadcrumb link color. |
| `--text-body` | `#0b0b0b` | Default body text. |
| `--text-secondary` | `#63656a` | Descriptive / helper text. |
| `--text-muted` | `#888` | Disabled states, low-emphasis labels. |
| `--bg-page` | `#f4f5f7` | Page background (set on `body`). |
| `--bg-white` | `#ffffff` | Card and form field backgrounds. |
| `--border` | `#dedede` | Default border color. |
| `--border-light` | `#ebebeb` | Subtle dividers (status rows). |

Status colors (`--status-success`, `--status-warning`, `--status-error`, `--status-info`,
plus their `-bg` and `-border` variants) are defined in `globals.css` and must be used
for all feedback UI — do not invent new colors for statuses.

---

## Layout

Every page uses `<main>` as the top-level wrapper. The stylesheet constrains it to
`max-width: 1024px` centered with horizontal padding — do not add `max-width` or
`margin: 0 auto` to `<main>` itself.

### Standard page structure

```tsx
<main>
  {/* 1. Breadcrumb */}
  <nav aria-label="Breadcrumb" className="breadcrumb">
    <Link href="/">Home</Link>
    <span className="breadcrumb__sep" aria-hidden="true">/</span>
    <Link href="/parent">Parent</Link>
    <span className="breadcrumb__sep" aria-hidden="true">/</span>
    <span aria-current="page">Current Page</span>
  </nav>

  {/* 2. Page header */}
  <div className="page-header">
    <h1>Page Title</h1>
    <p>Optional one-line description in --text-secondary.</p>
  </div>

  {/* 3. Content */}
</main>
```

Rules:
- Always use `<span className="breadcrumb__sep">` for `/` separators — never a bare
  text node or `<span aria-hidden="true">/</span>` without the class.
- `.page-header` has a gold bottom border and bottom margin built in. Do not skip it
  or recreate it with inline styles.
- The `<h1>` lives inside `.page-header`, not floating loose in `<main>`.

---

## Cards

```tsx
<div className="card">…</div>
```

Modifier classes:

| Class | Effect |
|---|---|
| `card--navy-border` | 4px navy left border. Use for primary/structural sections. |
| `card--gold-border` | 4px gold left border. Use for action/access sections. |
| `card--interactive` | Adds hover lift. Use only on clickable cards (template selection, etc.). |

A card's internal heading uses `<p className="section-title">` (a small-caps label),
not an `<h2>` or `<h3>`, because the real heading hierarchy lives in the page header.

```tsx
<div className="card card--navy-border">
  <p className="section-title">Section Label</p>
  {/* content */}
</div>
```

**Cards that hold lists of items** (e.g. My Apps) should use `<ul>`/`<li>` so that
tests can use `.closest("li")` to scope within-item assertions.

```tsx
<ul className="grid grid--2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
  {items.map((item) => (
    <li key={item.id} className="app-card">…</li>
  ))}
</ul>
```

---

## Grid

```tsx
<div className="grid grid--2">…</div>  {/* fixed 2-column */}
<div className="grid grid--3">…</div>  {/* responsive, min 220px */}
```

- `grid--2` is **always exactly 2 columns** (`repeat(2, 1fr)`). It collapses to 1
  column below 600 px. Do not use `grid--2` for content that naturally needs 1 or 3
  columns.
- `grid--3` uses `auto-fill` with a `220px` minimum and is appropriate for template
  card galleries where wrapping is desirable.
- Never use `minmax` directly in JSX to create ad-hoc grids; add a named modifier to
  `.grid` in `globals.css` instead.

---

## Buttons

Use the `.btn` class with exactly one variant and optionally one size modifier.

### Variants

| Class | Appearance | Use |
|---|---|---|
| `btn--primary-solid` | Solid navy | Primary page action (Publish, Submit). |
| `btn--primary` | Navy outline | Secondary action where navy already dominates. |
| `btn--secondary-solid` | Solid gold | Featured secondary action (Download ZIP, Grant Access). |
| `btn--secondary` | Gold outline | Lower-emphasis secondary action. |
| `btn--ghost` | Neutral outline | Tertiary / navigation-style actions (App Details, My Apps). |
| `btn--danger` | Red outline | Destructive actions (Delete Selected Resources). |

### Sizes

| Class | Use |
|---|---|
| (none) | Default — standalone call-to-action buttons. |
| `btn--sm` | Buttons inside cards or inline with other content. |
| `btn--lg` | Hero section CTAs only. |

### Rules
- Every interactive button inside a card uses `btn--sm`.
- Hero CTAs use `btn--lg`. The primary CTA is `btn--secondary-solid` (gold stands out
  on the navy hero). Secondary CTAs on the hero are `btn--ghost` with overridden
  `color` and `borderColor` to work on the dark background.
- Do not create submit buttons with `<button type="submit">` directly — use
  `<PendingSubmitButton>` (see below) so the button disables and shows a spinner
  while the server action is in flight.
- `<Link>` elements that look like buttons take `className="btn btn--…"` directly.

---

## PendingSubmitButton

`src/features/forms/pending-submit-button.tsx` — always use this for form submissions.

```tsx
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";

<form action={someAction}>
  <PendingSubmitButton
    idleLabel="Publish to Azure"
    pendingLabel="Publishing to Azure…"
    statusText="Publishing to Azure. This can take a few minutes."
    variant="primary-solid"
  />
</form>
```

Props:
- `idleLabel` — button text when not pending.
- `pendingLabel` — button text while the action is in flight (button is disabled).
- `statusText` — text for the `role="status"` live region shown below the button
  while pending. Tests assert on this text. Keep it user-readable.
- `variant` — one of the `.btn--*` variant names without the `btn--` prefix (e.g.
  `"primary-solid"`, `"primary"`, `"ghost"`).

Tests that use `mockUseFormStatus({ pending: true })` will match `pendingLabel` for
the button name, so keep `pendingLabel` distinct and descriptive.

---

## Status badges

Used to display enum pipeline statuses (repository, publish, access).

```tsx
<span className="badge badge--success">Ready</span>
<span className="badge badge--error">Failed</span>
<span className="badge badge--info">Invited</span>
<span className="badge badge--warning">Needs review</span>
<span className="badge badge--default">Not started</span>
```

The `statusBadge()` helper in `apps/page.tsx` maps Prisma enum strings to
`{ label, variant }`. Copy this pattern for any new page that needs to display
pipeline statuses rather than choosing badge variants ad hoc.

---

## Alert boxes

For inline feedback — do not use `<p>` with color inline styles.

```tsx
<div className="info-box">Repo setup in progress — check back shortly.</div>
<div className="success-box">Repo access granted for @portalstaff.</div>
<div className="warning-box">Repo setup note: {note}</div>
<div className="error-box">Repo setup failed.</div>
```

Rules:
- Use `info-box` for in-progress / neutral states.
- Use `success-box` for confirmed success (e.g. access granted).
- Use `warning-box` for operator notes, partial failures, or things requiring attention.
- Use `error-box` for hard failures.

---

## Status table (label: value rows)

Use `.status-table` + `.status-row` for key/value metadata inside cards.

```tsx
<div className="status-table">
  <div className="status-row">
    <span className="status-row__label">Status</span>
    <span className="badge badge--success">Published</span>
  </div>
  <div className="status-row">
    <span className="status-row__label">Repository</span>
    <a href={url} className="meta-link">{url}</a>
  </div>
</div>
```

- Never render metadata as loose `<p>` tags inside a card that has other status rows.
- External links inside status rows use `className="meta-link"` and `target="_blank" rel="noreferrer"`.
- The `.status-row__label` spans get auto-ellipsis styling and a fixed small-caps appearance.

---

## Forms

```tsx
<form action={serverAction} className="form-stack">
  <div className="form-group">
    <label htmlFor="fieldId" className="form-label">Field Label</label>
    <input id="fieldId" name="fieldName" type="text" className="form-control" />
  </div>

  <div className="form-group">
    <label htmlFor="notes" className="form-label">Notes</label>
    <textarea id="notes" name="notes" rows={4} className="form-control" />
  </div>

  <div>
    <PendingSubmitButton idleLabel="Submit" pendingLabel="Submitting…"
      statusText="Submitting your request…" variant="primary-solid" />
  </div>
</form>
```

Rules:
- Every `<label>` must have a `htmlFor` pointing to its field's `id`. This is required
  for `getByLabelText` in tests and for accessibility.
- Every `<input>`, `<textarea>`, and `<select>` gets `className="form-control"`.
- Wrap all fields in `.form-group` (vertical flex with gap). Wrap the whole form in
  `.form-stack` (grid with gap).
- Wrap the submit button in a plain `<div>` so it doesn't stretch full-width from
  the grid.
- Inline forms (e.g. GitHub username grant) may skip `.form-stack`/`.form-group` and
  use a flex row directly, but still need `.form-control` on inputs.

---

## Delete panel

The delete confirmation UI uses a `<details>` / `<summary>` disclosure:

```tsx
<details className="delete-panel">
  <summary>Delete App</summary>
  <div className="delete-panel__content">
    <form action={deleteAction} className="form-stack">
      <p className="delete-warning">
        Anything you leave unchecked must be deleted manually later.
      </p>
      <fieldset>
        <legend>Resources to delete</legend>
        <label><input name="deletePortal" type="checkbox" /> Delete portal record…</label>
        {/* conditional resource checkboxes */}
      </fieldset>
      <label>
        <input name="confirmDelete" type="checkbox" required />
        I understand selected resources will be deleted.
      </label>
      <div>
        <button type="submit" className="btn btn--danger btn--sm">
          Delete Selected Resources
        </button>
      </div>
    </form>
  </div>
</details>
```

Do not redesign this pattern or move the confirmation checkbox outside the form.
Tests assert on specific label text — do not change `delete-warning`, the checkbox
labels, or the button label without updating the tests.

---

## SiteHeader and SiteFooter

Both are rendered in `src/app/layout.tsx` and are always present. **Do not render
them inside individual pages.** Do not add per-page logout buttons — the LogoutButton
is in `SiteHeader`.

To add new nav links, edit `src/components/site-header.tsx`. Keep the nav flat —
no dropdowns.

---

## Hero section

Only the homepage uses the hero. The pattern:

```tsx
<div className="hero">
  <h1>…</h1>
  <p>…</p>
  <div className="hero__actions">
    <Link href="…" className="btn btn--secondary-solid btn--lg">Primary CTA</Link>
    <Link href="…" className="btn btn--ghost btn--lg"
      style={{ color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.3)" }}>
      Secondary CTA
    </Link>
  </div>
</div>
```

The inline color/borderColor overrides on ghost buttons inside the hero are intentional
— they adapt the neutral ghost style to the dark navy background. This is one of the
few sanctioned uses of inline style on a button.

---

## Empty state

When a list has no items:

```tsx
<div className="empty-state">
  <div className="empty-state__icon">📦</div>
  <div className="empty-state__title">No apps yet</div>
  <p className="empty-state__desc">Create your first app to get started.</p>
  <Link href="/create" className="btn btn--primary-solid">Create New App</Link>
</div>
```

---

## Step list

For numbered workflow instructions inside a card:

```tsx
<ol className="step-list">
  <li>Step one.</li>
  <li>Step two.</li>
</ol>
```

---

## Accessibility requirements

- Every `<nav>` must have `aria-label`. Use `aria-label="Breadcrumb"` for breadcrumbs.
- Breadcrumb current page: `<span aria-current="page">`.
- Breadcrumb separators: `<span className="breadcrumb__sep" aria-hidden="true">/</span>`.
- Sections shown/hidden by `isImportedApp` or similar flags that carry meaningful
  semantic structure should use `<section aria-label="…">` so they get `role="region"`
  and can be found by `getByRole("region", { name: /…/i })` in tests.
- `PendingSubmitButton` renders a `role="status"` live region while pending. Do not
  suppress or hide it.
- All form fields must have explicit `<label htmlFor="…">` associations (not just
  wrapping labels) so `getByLabelText` works in tests.

---

## Testing conventions

Pages are tested with `@testing-library/react`. When writing new page tests, follow
the patterns already established:

- Mock `react-dom` → `useFormStatus` when the page renders `PendingSubmitButton`
  (see `download/[requestId]/page.test.tsx`).
- Mock all server actions (`vi.mock("@/features/…/actions", …)`).
- Mock `prisma` at the model method level (not the whole module).
- Use `within(element)` to scope assertions to a specific card or list item.
- List-item cards must be `<li>` elements so `.closest("li")` works in tests.
- Assert on `aria-label` regions (`getByRole("region", { name: /…/i })`) rather than
  arbitrary container IDs or test-ids.

---

## What not to do

- **Do not add Tailwind classes.** If you see `className="flex items-center gap-2"`,
  remove it and use an appropriate CSS class or inline style.
- **Do not hardcode colors** like `color: "#003865"` in JSX. Use `var(--cu-navy)`.
- **Do not use `<button>` directly for form submissions** — use `PendingSubmitButton`.
- **Do not float UI elements** or use `position: absolute` without adding a
  corresponding `position: relative` parent and documenting why.
- **Do not render `<SiteHeader>` or `<SiteFooter>` inside pages** — they're in the
  root layout.
- **Do not use `grid--3` for the My Apps list** — it must stay `grid--2`.
- **Do not add per-page logout buttons** — LogoutButton lives in SiteHeader.
