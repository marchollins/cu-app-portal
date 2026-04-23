# Cedarville App Portal V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working version of the Cedarville App Portal so Cedarville-authenticated staff can select a template, submit a guided form, generate a ZIP package, and download it with GitHub setup instructions.

**Architecture:** Build a Next.js App Router application with Entra-backed authentication, Prisma/PostgreSQL persistence, a metadata-driven template catalog, and server-side ZIP generation. Keep the UI intentionally narrow around one primary flow, while leaving data-model and navigation scaffolding for future app management and browsing.

**Tech Stack:** Next.js, TypeScript, React, PostgreSQL, Prisma, NextAuth/Auth.js with Microsoft Entra ID, Zod, JSZip, Playwright, Vitest

---

## Proposed File Structure

### Application Shell

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

### Authentication

- Create: `src/auth/config.ts`
- Create: `src/auth/session.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`

### Database and Domain

- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_init/migration.sql`
- Create: `src/lib/db.ts`
- Create: `src/lib/env.ts`
- Create: `src/lib/audit.ts`
- Create: `src/lib/support-reference.ts`
- Create: `src/features/templates/types.ts`
- Create: `src/features/templates/catalog.ts`
- Create: `src/features/app-requests/types.ts`

### Create-New-App Flow

- Create: `src/app/create/page.tsx`
- Create: `src/app/create/[templateSlug]/page.tsx`
- Create: `src/app/create/actions.ts`
- Create: `src/features/create-app/template-form.tsx`
- Create: `src/features/create-app/template-form-fields.tsx`
- Create: `src/features/create-app/validation.ts`

### Artifact Generation

- Create: `src/features/generation/build-archive.ts`
- Create: `src/features/generation/render-template.ts`
- Create: `src/features/generation/token-replacements.ts`
- Create: `src/features/generation/instruction-files.ts`
- Create: `src/features/generation/storage.ts`
- Create: `src/app/download/[requestId]/page.tsx`
- Create: `src/app/api/download/[requestId]/route.ts`

### Templates and Seed Data

- Create: `templates/web-app/template.json`
- Create: `templates/web-app/files/README.md.template`
- Create: `templates/web-app/files/src/app/page.tsx.template`
- Create: `templates/web-app/files/src/app/globals.css.template`
- Create: `templates/web-app/files/.env.example.template`
- Create: `prisma/seed.ts`

### Testing

- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/features/create-app/validation.test.ts`
- Create: `src/features/generation/build-archive.test.ts`
- Create: `src/features/generation/render-template.test.ts`
- Create: `src/app/api/download/download-route.test.ts`
- Create: `e2e/create-and-download.spec.ts`

### Documentation

- Create: `README.md`
- Create: `docs/portal/setup.md`
- Create: `docs/portal/template-authoring.md`

## Task 1: Scaffold the Next.js Application

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Write the failing smoke test for the home page**

```ts
// src/app/page.smoke.test.tsx
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the create new app call to action", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /cedarville app portal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create new app/i }),
    ).toHaveAttribute("href", "/create");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/page.smoke.test.tsx`
Expected: FAIL with missing package scripts and missing app files.

- [ ] **Step 3: Create the base project files**

```json
// package.json
{
  "name": "cu-app-portal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0",
    "next": "^15.0.0",
    "next-auth": "^5.0.0-beta.25",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "prisma": "^6.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

```tsx
// src/app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Cedarville App Portal",
  description: "Create Cedarville-approved Codex app packages.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Cedarville App Portal</h1>
      <p>Create a Cedarville-approved app package and download the starter ZIP.</p>
      <Link href="/create">Create New App</Link>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/page.smoke.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json next.config.ts .gitignore .env.example src/app/layout.tsx src/app/page.tsx src/app/globals.css src/app/page.smoke.test.tsx
git commit -m "feat: scaffold nextjs portal app"
```

## Task 2: Add Testing Tooling and Shared Test Setup

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test setup assertion**

```ts
// src/test/setup.test.ts
import { expect, test } from "vitest";

test("test setup loads jest-dom matchers", () => {
  expect(document.createElement("div")).toBeInTheDocument;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/setup.test.ts`
Expected: FAIL because the jsdom environment and jest-dom setup are not configured.

- [ ] **Step 3: Configure Vitest**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

```ts
// src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/setup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/test/setup.ts src/test/setup.test.ts package.json
git commit -m "test: configure vitest and dom matchers"
```

## Task 3: Define Environment Loading and Prisma Schema

**Files:**
- Create: `src/lib/env.ts`
- Create: `prisma/schema.prisma`
- Create: `.env.example`
- Test: `src/lib/env.test.ts`

- [ ] **Step 1: Write the failing environment validation test**

```ts
// src/lib/env.test.ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("returns the validated environment values", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://localhost:5432/portal",
      AUTH_SECRET: "test-secret",
      AUTH_MICROSOFT_ENTRA_ID_ID: "client-id",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "client-secret",
      AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/tenant/v2.0",
    });

    expect(env.DATABASE_URL).toContain("postgresql://");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/env.test.ts`
Expected: FAIL because `loadEnv` does not exist.

- [ ] **Step 3: Add validated environment loading and Prisma models**

```ts
// src/lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: z.string().url(),
});

export function loadEnv(source: Record<string, string | undefined> = process.env) {
  return envSchema.parse(source);
}

export const env = loadEnv();
```

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          String       @id @default(cuid())
  entraOid    String       @unique
  email       String       @unique
  displayName String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  appRequests AppRequest[]
}

model Template {
  id             String       @id @default(cuid())
  slug           String       @unique
  name           String
  description    String
  version        String
  status         TemplateStatus
  inputSchema    Json
  hostingOptions Json
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  appRequests    AppRequest[]
}

model AppRequest {
  id               String              @id @default(cuid())
  userId           String
  templateId       String
  templateVersion  String
  appName          String
  submittedConfig  Json
  generationStatus GenerationStatus
  artifactId       String?
  supportReference String
  visibility       String?
  deploymentTarget String?
  publishedAt      DateTime?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  user             User                @relation(fields: [userId], references: [id])
  template         Template            @relation(fields: [templateId], references: [id])
  artifact         GeneratedArtifact?  @relation(fields: [artifactId], references: [id])
}

model GeneratedArtifact {
  id           String     @id @default(cuid())
  appRequestId String     @unique
  storagePath  String
  filename     String
  checksum     String
  contentType  String
  sizeBytes    Int
  expiresAt    DateTime?
  createdAt    DateTime   @default(now())
  appRequest   AppRequest?
}

enum TemplateStatus {
  ACTIVE
  DISABLED
}

enum GenerationStatus {
  PENDING
  SUCCEEDED
  FAILED
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/env.test.ts`
Expected: PASS

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts prisma/schema.prisma .env.example
git commit -m "feat: add env validation and prisma schema"
```

## Task 4: Add Prisma Client and Initial Migration

**Files:**
- Create: `src/lib/db.ts`
- Create: `prisma/migrations/<timestamp>_init/migration.sql`
- Modify: `package.json`

- [ ] **Step 1: Write the failing Prisma client singleton test**

```ts
// src/lib/db.test.ts
import { describe, expect, it } from "vitest";
import { prisma } from "./db";

describe("prisma", () => {
  it("exports a prisma client instance", () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/db.test.ts`
Expected: FAIL because `prisma` is not exported.

- [ ] **Step 3: Add Prisma client wrapper and generate the migration**

```ts
// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

```sql
-- prisma/migrations/<timestamp>_init/migration.sql
-- Generated from prisma/schema.prisma
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/db.test.ts`
Expected: PASS

Run: `npx prisma migrate dev --name init`
Expected: migration created and Prisma Client generated successfully

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts prisma/migrations prisma/schema.prisma
git commit -m "feat: add prisma client and initial migration"
```

## Task 5: Add Entra Authentication Configuration

**Files:**
- Create: `src/auth/config.ts`
- Create: `src/auth/session.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Test: `src/auth/config.test.ts`

- [ ] **Step 1: Write the failing auth configuration test**

```ts
// src/auth/config.test.ts
import { describe, expect, it } from "vitest";
import { authConfig } from "./config";

describe("authConfig", () => {
  it("uses jwt sessions and microsoft entra id provider", () => {
    expect(authConfig.session?.strategy).toBe("jwt");
    expect(authConfig.providers).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/auth/config.test.ts`
Expected: FAIL because auth config files do not exist.

- [ ] **Step 3: Add Auth.js configuration**

```ts
// src/auth/config.ts
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { NextAuthConfig } from "next-auth";
import { env } from "@/lib/env";

export const authConfig = {
  session: { strategy: "jwt" },
  providers: [
    MicrosoftEntraID({
      clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile?.oid) {
        token.entraOid = profile.oid;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.entraOid) {
        session.user.id = String(token.sub);
        session.user.entraOid = String(token.entraOid);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
```

```ts
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth/config";

const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
```

```ts
// src/auth/session.ts
import { auth } from "next-auth";
import { authConfig } from "./config";

export const getServerSession = () => auth(authConfig);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/auth/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/config.ts src/auth/session.ts src/app/api/auth/[...nextauth]/route.ts src/auth/config.test.ts
git commit -m "feat: configure entra authentication"
```

## Task 6: Protect Portal Routes with Middleware

**Files:**
- Create: `src/middleware.ts`
- Test: `src/middleware.test.ts`

- [ ] **Step 1: Write the failing middleware test**

```ts
// src/middleware.test.ts
import { describe, expect, it } from "vitest";
import { config } from "./middleware";

describe("middleware config", () => {
  it("protects create and download routes", () => {
    expect(config.matcher).toContain("/create/:path*");
    expect(config.matcher).toContain("/download/:path*");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/middleware.test.ts`
Expected: FAIL because middleware is not defined.

- [ ] **Step 3: Add middleware route protection**

```ts
// src/middleware.ts
export { auth as middleware } from "next-auth/middleware";

export const config = {
  matcher: ["/create/:path*", "/download/:path*"],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/middleware.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/middleware.test.ts
git commit -m "feat: protect portal routes"
```

## Task 7: Persist Users and Audit Key Actions

**Files:**
- Create: `src/lib/audit.ts`
- Create: `src/lib/support-reference.ts`
- Modify: `src/auth/config.ts`
- Test: `src/lib/support-reference.test.ts`

- [ ] **Step 1: Write the failing support reference test**

```ts
// src/lib/support-reference.test.ts
import { describe, expect, it } from "vitest";
import { createSupportReference } from "./support-reference";

describe("createSupportReference", () => {
  it("creates a user-safe support reference string", () => {
    const value = createSupportReference(new Date("2026-04-22T10:15:30Z"));
    expect(value).toMatch(/^SUP-20260422-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/support-reference.test.ts`
Expected: FAIL because helper files do not exist.

- [ ] **Step 3: Add support reference and audit helpers**

```ts
// src/lib/support-reference.ts
export function createSupportReference(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SUP-${stamp}-${random}`;
}
```

```ts
// src/lib/audit.ts
export type AuditEvent =
  | "SIGN_IN"
  | "APP_REQUEST_CREATED"
  | "APP_REQUEST_SUCCEEDED"
  | "APP_REQUEST_FAILED"
  | "ARTIFACT_DOWNLOADED";

export async function recordAuditEvent(event: AuditEvent, details: Record<string, unknown>) {
  console.info("[audit]", event, details);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/support-reference.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/support-reference.ts src/lib/support-reference.test.ts src/lib/audit.ts src/auth/config.ts
git commit -m "feat: add support references and audit helpers"
```

## Task 8: Define the Template Catalog Contract

**Files:**
- Create: `src/features/templates/types.ts`
- Create: `src/features/templates/catalog.ts`
- Test: `src/features/templates/catalog.test.ts`

- [ ] **Step 1: Write the failing template catalog test**

```ts
// src/features/templates/catalog.test.ts
import { describe, expect, it } from "vitest";
import { getActiveTemplates } from "./catalog";

describe("getActiveTemplates", () => {
  it("returns at least one active template", () => {
    const templates = getActiveTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]?.slug).toBe("web-app");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/templates/catalog.test.ts`
Expected: FAIL because template catalog files do not exist.

- [ ] **Step 3: Add template domain types and in-code catalog**

```ts
// src/features/templates/types.ts
export type TemplateField =
  | { name: "appName"; label: "App Name"; type: "text"; required: true }
  | { name: "description"; label: "Short Description"; type: "textarea"; required: true }
  | { name: "hostingTarget"; label: "Hosting Target"; type: "select"; required: true; options: string[] };

export type PortalTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  status: "ACTIVE" | "DISABLED";
  fields: TemplateField[];
};
```

```ts
// src/features/templates/catalog.ts
import type { PortalTemplate } from "./types";

const templates: PortalTemplate[] = [
  {
    id: "web-app-v1",
    slug: "web-app",
    name: "Web App Starter",
    description: "A Cedarville-styled web application starter with Entra setup guidance.",
    version: "1.0.0",
    status: "ACTIVE",
    fields: [
      { name: "appName", label: "App Name", type: "text", required: true },
      { name: "description", label: "Short Description", type: "textarea", required: true },
      {
        name: "hostingTarget",
        label: "Hosting Target",
        type: "select",
        required: true,
        options: ["Azure App Service", "Vercel", "Other"],
      },
    ],
  },
];

export function getActiveTemplates() {
  return templates.filter((template) => template.status === "ACTIVE");
}

export function getTemplateBySlug(slug: string) {
  return templates.find((template) => template.slug === slug) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/templates/catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/templates/types.ts src/features/templates/catalog.ts src/features/templates/catalog.test.ts
git commit -m "feat: add template catalog contract"
```

## Task 9: Build the Create Page and Template Selection UI

**Files:**
- Create: `src/app/create/page.tsx`
- Test: `src/app/create/page.test.tsx`

- [ ] **Step 1: Write the failing create page test**

```tsx
// src/app/create/page.test.tsx
import { render, screen } from "@testing-library/react";
import CreatePage from "./page";

describe("CreatePage", () => {
  it("lists active templates", async () => {
    render(await CreatePage());
    expect(screen.getByRole("heading", { name: /create new app/i })).toBeInTheDocument();
    expect(screen.getByText(/web app starter/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/create/page.test.tsx`
Expected: FAIL because the page file does not exist.

- [ ] **Step 3: Add the create landing page**

```tsx
// src/app/create/page.tsx
import Link from "next/link";
import { getActiveTemplates } from "@/features/templates/catalog";

export default async function CreatePage() {
  const templates = getActiveTemplates();

  return (
    <main>
      <h1>Create New App</h1>
      <ul>
        {templates.map((template) => (
          <li key={template.id}>
            <h2>{template.name}</h2>
            <p>{template.description}</p>
            <Link href={`/create/${template.slug}`}>Use Template</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/create/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/create/page.tsx src/app/create/page.test.tsx
git commit -m "feat: add create page template selection"
```

## Task 10: Add Form Validation for Template Inputs

**Files:**
- Create: `src/features/create-app/validation.ts`
- Test: `src/features/create-app/validation.test.ts`

- [ ] **Step 1: Write the failing validation test**

```ts
// src/features/create-app/validation.test.ts
import { describe, expect, it } from "vitest";
import { createAppSchema } from "./validation";

describe("createAppSchema", () => {
  it("accepts valid form input", () => {
    const result = createAppSchema.safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a blank app name", () => {
    const result = createAppSchema.safeParse({
      appName: "",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/create-app/validation.test.ts`
Expected: FAIL because validation schema does not exist.

- [ ] **Step 3: Add the shared create-app schema**

```ts
// src/features/create-app/validation.ts
import { z } from "zod";

export const createAppSchema = z.object({
  appName: z.string().trim().min(1, "Enter an app name."),
  description: z.string().trim().min(1, "Enter a short description."),
  hostingTarget: z.string().trim().min(1, "Choose a hosting target."),
});

export type CreateAppInput = z.infer<typeof createAppSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/create-app/validation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/create-app/validation.ts src/features/create-app/validation.test.ts
git commit -m "feat: add create app validation"
```

## Task 11: Build the Template Form UI

**Files:**
- Create: `src/features/create-app/template-form.tsx`
- Create: `src/features/create-app/template-form-fields.tsx`
- Create: `src/app/create/[templateSlug]/page.tsx`
- Test: `src/app/create/[templateSlug]/page.test.tsx`

- [ ] **Step 1: Write the failing template form page test**

```tsx
// src/app/create/[templateSlug]/page.test.tsx
import { render, screen } from "@testing-library/react";
import TemplatePage from "./page";

describe("TemplatePage", () => {
  it("renders the selected template form", async () => {
    render(await TemplatePage({ params: Promise.resolve({ templateSlug: "web-app" }) }));
    expect(screen.getByRole("heading", { name: /web app starter/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/app name/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/create/[templateSlug]/page.test.tsx`
Expected: FAIL because the page and form components do not exist.

- [ ] **Step 3: Add the template form page and fields**

```tsx
// src/features/create-app/template-form-fields.tsx
import type { PortalTemplate } from "@/features/templates/types";

export function TemplateFormFields({ template }: { template: PortalTemplate }) {
  return (
    <>
      {template.fields.map((field) => {
        if (field.type === "textarea") {
          return (
            <label key={field.name}>
              {field.label}
              <textarea name={field.name} required={field.required} />
            </label>
          );
        }

        if (field.type === "select") {
          return (
            <label key={field.name}>
              {field.label}
              <select name={field.name} required={field.required}>
                <option value="">Select an option</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={field.name}>
            {field.label}
            <input name={field.name} type="text" required={field.required} />
          </label>
        );
      })}
    </>
  );
}
```

```tsx
// src/features/create-app/template-form.tsx
import type { PortalTemplate } from "@/features/templates/types";
import { TemplateFormFields } from "./template-form-fields";
import { createAppAction } from "@/app/create/actions";

export function TemplateForm({ template }: { template: PortalTemplate }) {
  return (
    <form action={createAppAction}>
      <input type="hidden" name="templateSlug" value={template.slug} />
      <TemplateFormFields template={template} />
      <button type="submit">Generate App Package</button>
    </form>
  );
}
```

```tsx
// src/app/create/[templateSlug]/page.tsx
import { notFound } from "next/navigation";
import { TemplateForm } from "@/features/create-app/template-form";
import { getTemplateBySlug } from "@/features/templates/catalog";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateSlug: string }>;
}) {
  const { templateSlug } = await params;
  const template = getTemplateBySlug(templateSlug);

  if (!template) {
    notFound();
  }

  return (
    <main>
      <h1>{template.name}</h1>
      <p>{template.description}</p>
      <TemplateForm template={template} />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/create/[templateSlug]/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/create-app/template-form-fields.tsx src/features/create-app/template-form.tsx src/app/create/[templateSlug]/page.tsx src/app/create/[templateSlug]/page.test.tsx
git commit -m "feat: add template configuration form"
```

## Task 12: Persist App Requests with a Server Action

**Files:**
- Create: `src/app/create/actions.ts`
- Create: `src/features/app-requests/types.ts`
- Test: `src/app/create/actions.test.ts`

- [ ] **Step 1: Write the failing server action test**

```ts
// src/app/create/actions.test.ts
import { describe, expect, it } from "vitest";
import { extractCreateAppInput } from "./actions";

describe("extractCreateAppInput", () => {
  it("builds the validated payload from form data", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Vercel");

    const input = await extractCreateAppInput(formData);

    expect(input.appName).toBe("Campus Dashboard");
    expect(input.templateSlug).toBe("web-app");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/create/actions.test.ts`
Expected: FAIL because the action module does not exist.

- [ ] **Step 3: Add extraction logic and server action skeleton**

```ts
// src/features/app-requests/types.ts
import type { CreateAppInput } from "@/features/create-app/validation";

export type CreateAppRequestInput = CreateAppInput & {
  templateSlug: string;
};
```

```ts
// src/app/create/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createAppSchema } from "@/features/create-app/validation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";

export async function extractCreateAppInput(formData: FormData): Promise<CreateAppRequestInput> {
  const payload = {
    templateSlug: String(formData.get("templateSlug") ?? ""),
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
    hostingTarget: String(formData.get("hostingTarget") ?? ""),
  };

  const parsed = createAppSchema.parse(payload);
  return { ...parsed, templateSlug: payload.templateSlug };
}

export async function createAppAction(formData: FormData) {
  const input = await extractCreateAppInput(formData);
  redirect(`/download/pending?template=${input.templateSlug}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/create/actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/app-requests/types.ts src/app/create/actions.ts src/app/create/actions.test.ts
git commit -m "feat: add create app server action skeleton"
```

## Task 13: Add Template Files and Rendering Logic

**Files:**
- Create: `templates/web-app/template.json`
- Create: `templates/web-app/files/README.md.template`
- Create: `templates/web-app/files/src/app/page.tsx.template`
- Create: `templates/web-app/files/src/app/globals.css.template`
- Create: `templates/web-app/files/.env.example.template`
- Create: `src/features/generation/token-replacements.ts`
- Create: `src/features/generation/render-template.ts`
- Test: `src/features/generation/render-template.test.ts`

- [ ] **Step 1: Write the failing render test**

```ts
// src/features/generation/render-template.test.ts
import { describe, expect, it } from "vitest";
import { renderTemplateString } from "./render-template";

describe("renderTemplateString", () => {
  it("replaces known template tokens", () => {
    const output = renderTemplateString("Name: {{APP_NAME}}", {
      APP_NAME: "Campus Dashboard",
    });

    expect(output).toBe("Name: Campus Dashboard");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/generation/render-template.test.ts`
Expected: FAIL because rendering logic does not exist.

- [ ] **Step 3: Add token rendering and starter template files**

```ts
// src/features/generation/token-replacements.ts
import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildTokenMap(input: CreateAppRequestInput) {
  return {
    APP_NAME: input.appName,
    APP_DESCRIPTION: input.description,
    HOSTING_TARGET: input.hostingTarget,
  };
}
```

```ts
// src/features/generation/render-template.ts
export function renderTemplateString(
  source: string,
  values: Record<string, string>,
) {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value);
  }, source);
}
```

```json
// templates/web-app/template.json
{
  "slug": "web-app",
  "version": "1.0.0",
  "entryFiles": [
    "README.md.template",
    "src/app/page.tsx.template",
    "src/app/globals.css.template",
    ".env.example.template"
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/generation/render-template.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add templates/web-app src/features/generation/token-replacements.ts src/features/generation/render-template.ts src/features/generation/render-template.test.ts
git commit -m "feat: add template rendering primitives"
```

## Task 14: Generate ZIP Artifacts with Instruction Files

**Files:**
- Create: `src/features/generation/instruction-files.ts`
- Create: `src/features/generation/build-archive.ts`
- Test: `src/features/generation/build-archive.test.ts`

- [ ] **Step 1: Write the failing archive generation test**

```ts
// src/features/generation/build-archive.test.ts
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildArchive } from "./build-archive";

describe("buildArchive", () => {
  it("creates a zip containing README and GitHub instructions", async () => {
    const archive = await buildArchive({
      templateSlug: "web-app",
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });

    const zip = await JSZip.loadAsync(archive.buffer);
    expect(zip.file("README.md")).toBeTruthy();
    expect(zip.file("docs/github-setup.md")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: FAIL because archive building does not exist.

- [ ] **Step 3: Add archive building and instruction files**

```ts
// src/features/generation/instruction-files.ts
import type { CreateAppRequestInput } from "@/features/app-requests/types";

export function buildInstructionFiles(input: CreateAppRequestInput) {
  return {
    "docs/github-setup.md": `# GitHub Setup

1. Create a new GitHub repository named ${input.appName}.
2. Extract this ZIP locally.
3. Commit the generated files to your repository.
4. Follow the deployment guide for ${input.hostingTarget}.`,
    "docs/deployment-guide.md": `# Deployment Guide

This package was prepared for ${input.hostingTarget}.
Review the included environment placeholders before deploying.`,
  };
}
```

```ts
// src/features/generation/build-archive.ts
import JSZip from "jszip";
import { buildInstructionFiles } from "./instruction-files";
import { buildTokenMap } from "./token-replacements";
import { renderTemplateString } from "./render-template";
import type { CreateAppRequestInput } from "@/features/app-requests/types";

export async function buildArchive(input: CreateAppRequestInput) {
  const zip = new JSZip();
  const tokens = buildTokenMap(input);

  zip.file("README.md", renderTemplateString("# {{APP_NAME}}\n\n{{APP_DESCRIPTION}}\n", tokens));
  zip.file("src/app/page.tsx", renderTemplateString("export default function Page() { return <main>{{APP_NAME}}</main>; }\n", tokens));
  zip.file("src/app/globals.css", ":root { --cedarville-blue: #003da5; }\n");
  zip.file(".env.example", "AUTH_MICROSOFT_ENTRA_ID_ID=\nAUTH_MICROSOFT_ENTRA_ID_SECRET=\n");

  const instructions = buildInstructionFiles(input);
  for (const [filePath, content] of Object.entries(instructions)) {
    zip.file(filePath, content);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, filename: `${input.appName.toLowerCase().replaceAll(/\s+/g, "-")}.zip` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/generation/build-archive.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/generation/instruction-files.ts src/features/generation/build-archive.ts src/features/generation/build-archive.test.ts
git commit -m "feat: add zip artifact generation"
```

## Task 15: Add Artifact Storage and Download Authorization

**Files:**
- Create: `src/features/generation/storage.ts`
- Create: `src/app/api/download/[requestId]/route.ts`
- Test: `src/app/api/download/download-route.test.ts`

- [ ] **Step 1: Write the failing download route test**

```ts
// src/app/api/download/download-route.test.ts
import { describe, expect, it } from "vitest";
import { createDownloadHeaders } from "./[requestId]/route";

describe("createDownloadHeaders", () => {
  it("sets a zip content type and attachment filename", () => {
    const headers = createDownloadHeaders("campus-dashboard.zip");
    expect(headers.get("content-type")).toBe("application/zip");
    expect(headers.get("content-disposition")).toContain("campus-dashboard.zip");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/download/download-route.test.ts`
Expected: FAIL because the route does not exist.

- [ ] **Step 3: Add artifact storage helpers and secured download response helpers**

```ts
// src/features/generation/storage.ts
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

const artifactRoot = join(process.cwd(), ".artifacts");

export async function saveArtifact(filename: string, buffer: Buffer) {
  await mkdir(artifactRoot, { recursive: true });
  const storagePath = join(artifactRoot, filename);
  await writeFile(storagePath, buffer);
  return storagePath;
}

export async function loadArtifact(storagePath: string) {
  return readFile(storagePath);
}
```

```ts
// src/app/api/download/[requestId]/route.ts
export function createDownloadHeaders(filename: string) {
  return new Headers({
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${filename}"`,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/download/download-route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/generation/storage.ts src/app/api/download/[requestId]/route.ts src/app/api/download/download-route.test.ts
git commit -m "feat: add artifact storage and download headers"
```

## Task 16: Complete the Create-and-Generate Server Action

**Files:**
- Modify: `src/app/create/actions.ts`
- Test: `src/app/create/actions.test.ts`

- [ ] **Step 1: Extend the failing action test for request creation**

```ts
// src/app/create/actions.test.ts
import { describe, expect, it, vi } from "vitest";
import { buildArchive } from "@/features/generation/build-archive";
import { createAppAction } from "./actions";

vi.mock("@/features/generation/build-archive", () => ({
  buildArchive: vi.fn().mockResolvedValue({
    buffer: Buffer.from("zip"),
    filename: "campus-dashboard.zip",
  }),
}));

describe("createAppAction", () => {
  it("generates an archive and redirects to the download page", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Vercel");

    await expect(createAppAction(formData)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    expect(buildArchive).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/create/actions.test.ts`
Expected: FAIL because the action only redirects without generating artifacts.

- [ ] **Step 3: Implement request creation, archive generation, and redirect**

```ts
// src/app/create/actions.ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createSupportReference } from "@/lib/support-reference";
import { buildArchive } from "@/features/generation/build-archive";
import { saveArtifact } from "@/features/generation/storage";
import { getTemplateBySlug } from "@/features/templates/catalog";
import { createAppSchema } from "@/features/create-app/validation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";

export async function extractCreateAppInput(formData: FormData): Promise<CreateAppRequestInput> {
  const payload = {
    templateSlug: String(formData.get("templateSlug") ?? ""),
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
    hostingTarget: String(formData.get("hostingTarget") ?? ""),
  };

  const parsed = createAppSchema.parse(payload);
  return { ...parsed, templateSlug: payload.templateSlug };
}

export async function createAppAction(formData: FormData) {
  const input = await extractCreateAppInput(formData);
  const template = getTemplateBySlug(input.templateSlug);

  if (!template) {
    throw new Error("Template not found.");
  }

  const supportReference = createSupportReference();

  const request = await prisma.appRequest.create({
    data: {
      userId: "dev-user-placeholder",
      templateId: template.id,
      templateVersion: template.version,
      appName: input.appName,
      submittedConfig: input,
      generationStatus: "PENDING",
      supportReference,
      deploymentTarget: input.hostingTarget,
    },
  });

  try {
    const archive = await buildArchive(input);
    const storagePath = await saveArtifact(archive.filename, archive.buffer);

    const artifact = await prisma.generatedArtifact.create({
      data: {
        appRequestId: request.id,
        storagePath,
        filename: archive.filename,
        checksum: "todo-checksum",
        contentType: "application/zip",
        sizeBytes: archive.buffer.byteLength,
      },
    });

    await prisma.appRequest.update({
      where: { id: request.id },
      data: { generationStatus: "SUCCEEDED", artifactId: artifact.id },
    });

    await recordAuditEvent("APP_REQUEST_SUCCEEDED", {
      requestId: request.id,
      supportReference,
    });

    redirect(`/download/${request.id}`);
  } catch (error) {
    await prisma.appRequest.update({
      where: { id: request.id },
      data: { generationStatus: "FAILED" },
    });

    await recordAuditEvent("APP_REQUEST_FAILED", {
      requestId: request.id,
      supportReference,
      error: error instanceof Error ? error.message : "unknown",
    });

    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/create/actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/create/actions.ts src/app/create/actions.test.ts
git commit -m "feat: generate artifacts from create app submissions"
```

## Task 17: Build the Download Success Page

**Files:**
- Create: `src/app/download/[requestId]/page.tsx`
- Test: `src/app/download/[requestId]/page.test.tsx`

- [ ] **Step 1: Write the failing download page test**

```tsx
// src/app/download/[requestId]/page.test.tsx
import { render, screen } from "@testing-library/react";
import DownloadPage from "./page";

describe("DownloadPage", () => {
  it("shows the package-ready message and GitHub checklist", async () => {
    render(await DownloadPage({ params: Promise.resolve({ requestId: "req_123" }) }));
    expect(screen.getByRole("heading", { name: /your app package is ready/i })).toBeInTheDocument();
    expect(screen.getByText(/create a new github repository/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/download/[requestId]/page.test.tsx`
Expected: FAIL because the page does not exist.

- [ ] **Step 3: Add the success page**

```tsx
// src/app/download/[requestId]/page.tsx
import Link from "next/link";

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;

  return (
    <main>
      <h1>Your App Package Is Ready</h1>
      <p>Download the ZIP package and follow the guided GitHub and deployment steps.</p>
      <Link href={`/api/download/${requestId}`}>Download ZIP</Link>
      <ol>
        <li>Create a new GitHub repository.</li>
        <li>Extract the ZIP package.</li>
        <li>Commit the generated files to the repository.</li>
        <li>Follow the included deployment guide.</li>
      </ol>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/download/[requestId]/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/download/[requestId]/page.tsx src/app/download/[requestId]/page.test.tsx
git commit -m "feat: add download success page"
```

## Task 18: Seed the Template Catalog and Sync Authenticated Users

**Files:**
- Create: `prisma/seed.ts`
- Modify: `src/auth/config.ts`
- Test: `prisma/seed.test.ts`

- [ ] **Step 1: Write the failing seed serialization test**

```ts
// prisma/seed.test.ts
import { describe, expect, it } from "vitest";
import { seedTemplates } from "./seed";

describe("seedTemplates", () => {
  it("returns the default web app template seed", () => {
    const rows = seedTemplates();
    expect(rows[0]?.slug).toBe("web-app");
    expect(rows[0]?.status).toBe("ACTIVE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- prisma/seed.test.ts`
Expected: FAIL because the seed script does not exist.

- [ ] **Step 3: Add seeding and user sync hooks**

```ts
// prisma/seed.ts
import { prisma } from "@/lib/db";
import { getActiveTemplates } from "@/features/templates/catalog";

export function seedTemplates() {
  return getActiveTemplates().map((template) => ({
    slug: template.slug,
    name: template.name,
    description: template.description,
    version: template.version,
    status: template.status,
    inputSchema: template.fields,
    hostingOptions: [],
  }));
}

async function main() {
  for (const template of seedTemplates()) {
    await prisma.template.upsert({
      where: { slug: template.slug },
      update: template,
      create: template,
    });
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- prisma/seed.test.ts`
Expected: PASS

Run: `npm run prisma:seed`
Expected: template seed rows inserted or updated successfully

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts prisma/seed.test.ts src/auth/config.ts
git commit -m "feat: add template seeding"
```

## Task 19: Add End-to-End Coverage for Create and Download

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/create-and-download.spec.ts`

- [ ] **Step 1: Write the failing end-to-end test**

```ts
// e2e/create-and-download.spec.ts
import { test, expect } from "@playwright/test";

test("authenticated user can create an app package", async ({ page }) => {
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: /create new app/i })).toBeVisible();
  await page.getByRole("link", { name: /use template/i }).click();
  await page.getByLabel("App Name").fill("Campus Dashboard");
  await page.getByLabel("Short Description").fill("Shows campus metrics.");
  await page.getByLabel("Hosting Target").selectOption("Vercel");
  await page.getByRole("button", { name: /generate app package/i }).click();
  await expect(page.getByRole("heading", { name: /your app package is ready/i })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- e2e/create-and-download.spec.ts`
Expected: FAIL because Playwright configuration and the portal flow are not complete.

- [ ] **Step 3: Configure Playwright**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- e2e/create-and-download.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/create-and-download.spec.ts
git commit -m "test: add create and download e2e coverage"
```

## Task 20: Document Setup, Local Development, and Template Authoring

**Files:**
- Create: `README.md`
- Create: `docs/portal/setup.md`
- Create: `docs/portal/template-authoring.md`

- [ ] **Step 1: Write the failing README assertion**

```ts
// docs/readme.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("README", () => {
  it("documents local setup and key scripts", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("Microsoft Entra ID");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- docs/readme.test.ts`
Expected: FAIL because documentation files do not exist.

- [ ] **Step 3: Add operator-facing documentation**

```md
<!-- README.md -->
# Cedarville App Portal

Internal portal for Cedarville staff to create a new app package from an approved template.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Configure PostgreSQL and Microsoft Entra ID values.
3. Run `npm install`.
4. Run `npm run prisma:migrate`.
5. Run `npm run prisma:seed`.
6. Run `npm run dev`.
```

```md
<!-- docs/portal/setup.md -->
# Portal Setup

This guide explains local development, required environment variables, and database setup for the Cedarville App Portal.
```

```md
<!-- docs/portal/template-authoring.md -->
# Template Authoring

Templates are metadata-driven starter packages used by the portal to generate ZIP artifacts.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- docs/readme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md docs/portal/setup.md docs/portal/template-authoring.md docs/readme.test.ts
git commit -m "docs: add setup and template authoring guides"
```

## Verification Checklist

- [ ] Run: `npm test`
Expected: all Vitest suites pass

- [ ] Run: `npm run test:e2e`
Expected: Playwright create-and-download flow passes

- [ ] Run: `npm run build`
Expected: Next.js production build completes successfully

- [ ] Run: `npx prisma validate`
Expected: Prisma schema validates successfully

- [ ] Run: `npm run prisma:seed`
Expected: template seed completes without errors

## Spec Coverage Check

- Cedarville SSO before create/download: covered by Tasks 5 and 6.
- Metadata-driven template catalog: covered by Tasks 8, 13, and 18.
- Guided create-new-app flow: covered by Tasks 9 through 12.
- ZIP artifact generation with GitHub/deployment instructions: covered by Tasks 13 through 17.
- Download authorization, support references, and auditability: covered by Tasks 7, 15, and 16.
- Non-technical operator documentation: covered by Task 20.

## Placeholder and Consistency Check

- The one intentional placeholder is `userId: "dev-user-placeholder"` in Task 16. Replace this during implementation by wiring the authenticated session user to a persisted local user record before calling `prisma.appRequest.create`.
- The one intentional placeholder is `checksum: "todo-checksum"` in Task 16. Replace this during implementation by hashing the ZIP buffer in the artifact creation path.
- All other tasks define explicit file paths, commands, and code targets for the initial implementation pass.
