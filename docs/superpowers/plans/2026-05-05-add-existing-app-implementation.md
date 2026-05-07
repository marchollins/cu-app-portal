# Add Existing App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Cedarville users add an existing compatible GitHub app repository to the portal, prepare it safely for Azure publishing, and manage it through the existing `My Apps` publish lifecycle.

**Architecture:** Add a repository-import lifecycle beside the existing generated-app lifecycle, then converge both paths on the same managed GitHub repository and Azure publish runtime. Keep the first implementation narrow: GitHub App access, shared-org managed repos, root Node/Next apps, safe publishing additions, and user choice between direct commit and PR creation.

**Tech Stack:** Next.js App Router, TypeScript, React Server Components, Prisma/PostgreSQL, GitHub App REST API, Node git subprocesses for history-preserving import, Zod, Vitest, Testing Library, Playwright-compatible UI patterns.

---

## Proposed File Structure

### Database

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260505180000_repository_imports/migration.sql`

### Repository Import Domain

- Create: `src/features/repository-imports/repo-url.ts`
  - Parse and normalize GitHub repo URLs.
- Create: `src/features/repository-imports/repo-url.test.ts`
- Create: `src/features/repository-imports/target-name.ts`
  - Derive shared-org target repo names.
- Create: `src/features/repository-imports/target-name.test.ts`
- Create: `src/features/repository-imports/compatibility.ts`
  - Scan repository file maps for v1 Azure publish compatibility.
- Create: `src/features/repository-imports/compatibility.test.ts`
- Create: `src/features/repository-imports/publishing-bundle.ts`
  - Plan files and safe `package.json` changes needed for portal Azure publishing.
- Create: `src/features/repository-imports/publishing-bundle.test.ts`
- Create: `src/features/repository-imports/prepare-repository.ts`
  - Apply planned publishing additions by direct commit or PR.
- Create: `src/features/repository-imports/prepare-repository.test.ts`
- Create: `src/features/repository-imports/publish-readiness.ts`
  - Verify required publishing files are on the default branch after PR merge.
- Create: `src/features/repository-imports/publish-readiness.test.ts`
- Create: `src/features/repository-imports/import-repository.ts`
  - Preserve history when cloning an external readable repo into the shared org.
- Create: `src/features/repository-imports/import-repository.test.ts`
- Create: `src/features/repository-imports/actions.ts`
  - Server actions for add/analyze/prepare/retry.
- Create: `src/features/repository-imports/actions.test.ts`

### GitHub Automation

- Modify: `src/features/repositories/github-app.ts`
- Modify: `src/features/repositories/github-app.test.ts`
- Modify: `src/features/repositories/config.ts`
- Modify: `src/features/repositories/config.test.ts`

### UI

- Create: `src/app/apps/add/page.tsx`
- Create: `src/app/apps/add/page.test.tsx`
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.smoke.test.tsx`

### Publishing Integration

- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/azure/runtime.ts`
- Modify: `src/features/publishing/azure/runtime.test.ts`

### Documentation

- Modify: `README.md`
- Modify: `docs/portal/setup.md`

---

## Task 1: Add Repository Import Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260505180000_repository_imports/migration.sql`

- [ ] **Step 1: Update the Prisma schema**

Add a one-to-one optional import relation from `AppRequest` and extend `SourceOfTruth`.

```prisma
model AppRequest {
  id               String             @id @default(cuid())
  userId           String
  templateId       String
  templateVersion  String
  appName          String
  submittedConfig  Json
  generationStatus GenerationStatus
  supportReference String
  visibility       String?
  deploymentTarget String?
  sourceOfTruth    SourceOfTruth      @default(PORTAL_MANAGED_REPO)
  repositoryProvider RepositoryProvider?
  repositoryOwner  String?
  repositoryName   String?
  repositoryUrl    String?
  repositoryDefaultBranch String?
  repositoryVisibility String?
  repositoryStatus RepositoryStatus   @default(PENDING)
  repositoryAccessStatus RepositoryAccessStatus @default(NOT_REQUESTED)
  repositoryAccessNote String?
  publishStatus    PublishStatus      @default(NOT_STARTED)
  publishUrl       String?
  publishErrorSummary String?
  lastPublishedAt  DateTime?
  azureResourceGroup    String?
  azureAppServicePlan   String?
  azureWebAppName       String?
  azurePostgresServer   String?
  azureDatabaseName     String?
  azureDefaultHostName  String?
  customDomain          String?
  primaryPublishUrl     String?
  publishedAt      DateTime?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  user             User               @relation(fields: [userId], references: [id])
  template         Template           @relation(fields: [templateId], references: [id])
  artifact         GeneratedArtifact?
  publishAttempts  PublishAttempt[]
  repositoryImport RepositoryImport?
}

model RepositoryImport {
  id                            String                      @id @default(cuid())
  appRequestId                  String                      @unique
  sourceRepositoryUrl           String
  sourceRepositoryOwner         String
  sourceRepositoryName          String
  sourceRepositoryDefaultBranch String?
  targetRepositoryOwner         String
  targetRepositoryName          String
  targetRepositoryUrl           String?
  targetRepositoryDefaultBranch String?
  importStatus                  RepositoryImportStatus
  importErrorSummary            String?
  compatibilityStatus           RepositoryCompatibilityStatus @default(NOT_SCANNED)
  compatibilityFindings         Json
  preparationMode               RepositoryPreparationMode?
  preparationStatus             RepositoryPreparationStatus @default(NOT_STARTED)
  preparationBranch             String?
  preparationPullRequestUrl     String?
  preparationErrorSummary       String?
  createdAt                     DateTime                    @default(now())
  updatedAt                     DateTime                    @updatedAt
  appRequest                    AppRequest                  @relation(fields: [appRequestId], references: [id], onDelete: Cascade)
}

enum SourceOfTruth {
  PORTAL_MANAGED_REPO
  IMPORTED_REPOSITORY
}

enum RepositoryImportStatus {
  NOT_REQUIRED
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
  BLOCKED
}

enum RepositoryCompatibilityStatus {
  NOT_SCANNED
  COMPATIBLE
  NEEDS_ADDITIONS
  UNSUPPORTED
  CONFLICTED
}

enum RepositoryPreparationMode {
  DIRECT_COMMIT
  PULL_REQUEST
}

enum RepositoryPreparationStatus {
  NOT_STARTED
  PENDING_USER_CHOICE
  RUNNING
  COMMITTED
  PULL_REQUEST_OPENED
  FAILED
  BLOCKED
}
```

- [ ] **Step 2: Add the SQL migration**

Create `prisma/migrations/20260505180000_repository_imports/migration.sql` with:

```sql
-- AlterEnum
ALTER TYPE "SourceOfTruth" ADD VALUE 'IMPORTED_REPOSITORY';

-- CreateEnum
CREATE TYPE "RepositoryImportStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RepositoryCompatibilityStatus" AS ENUM ('NOT_SCANNED', 'COMPATIBLE', 'NEEDS_ADDITIONS', 'UNSUPPORTED', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "RepositoryPreparationMode" AS ENUM ('DIRECT_COMMIT', 'PULL_REQUEST');

-- CreateEnum
CREATE TYPE "RepositoryPreparationStatus" AS ENUM ('NOT_STARTED', 'PENDING_USER_CHOICE', 'RUNNING', 'COMMITTED', 'PULL_REQUEST_OPENED', 'FAILED', 'BLOCKED');

-- CreateTable
CREATE TABLE "RepositoryImport" (
    "id" TEXT NOT NULL,
    "appRequestId" TEXT NOT NULL,
    "sourceRepositoryUrl" TEXT NOT NULL,
    "sourceRepositoryOwner" TEXT NOT NULL,
    "sourceRepositoryName" TEXT NOT NULL,
    "sourceRepositoryDefaultBranch" TEXT,
    "targetRepositoryOwner" TEXT NOT NULL,
    "targetRepositoryName" TEXT NOT NULL,
    "targetRepositoryUrl" TEXT,
    "targetRepositoryDefaultBranch" TEXT,
    "importStatus" "RepositoryImportStatus" NOT NULL,
    "importErrorSummary" TEXT,
    "compatibilityStatus" "RepositoryCompatibilityStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "compatibilityFindings" JSONB NOT NULL,
    "preparationMode" "RepositoryPreparationMode",
    "preparationStatus" "RepositoryPreparationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "preparationBranch" TEXT,
    "preparationPullRequestUrl" TEXT,
    "preparationErrorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryImport_appRequestId_key" ON "RepositoryImport"("appRequestId");

-- AddForeignKey
ALTER TABLE "RepositoryImport" ADD CONSTRAINT "RepositoryImport_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generate Prisma client**

Run: `npm run prisma:generate`

Expected: command exits 0 and regenerates the client.

- [ ] **Step 4: Run existing tests to catch schema compile issues**

Run: `npm test -- src/lib/db.test.ts prisma/seed.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260505180000_repository_imports/migration.sql
git commit -m "feat: add repository import schema"
```

---

## Task 2: Parse GitHub Repository URLs And Target Names

**Files:**
- Create: `src/features/repository-imports/repo-url.ts`
- Create: `src/features/repository-imports/repo-url.test.ts`
- Create: `src/features/repository-imports/target-name.ts`
- Create: `src/features/repository-imports/target-name.test.ts`

- [ ] **Step 1: Write failing repo URL tests**

Create `src/features/repository-imports/repo-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseGitHubRepositoryUrl } from "./repo-url";

describe("parseGitHubRepositoryUrl", () => {
  it("normalizes github web urls", () => {
    expect(
      parseGitHubRepositoryUrl("https://github.com/Cedarville-IT/Campus-Dashboard.git"),
    ).toEqual({
      owner: "Cedarville-IT",
      name: "Campus-Dashboard",
      normalizedUrl: "https://github.com/Cedarville-IT/Campus-Dashboard",
      fullName: "Cedarville-IT/Campus-Dashboard",
    });
  });

  it("normalizes ssh urls", () => {
    expect(
      parseGitHubRepositoryUrl("git@github.com:cedarville-it/campus-dashboard.git"),
    ).toEqual({
      owner: "cedarville-it",
      name: "campus-dashboard",
      normalizedUrl: "https://github.com/cedarville-it/campus-dashboard",
      fullName: "cedarville-it/campus-dashboard",
    });
  });

  it("rejects non-github urls", () => {
    expect(() =>
      parseGitHubRepositoryUrl("https://gitlab.com/cedarville/campus-dashboard"),
    ).toThrow("Enter a GitHub repository URL.");
  });

  it("rejects urls without owner and repo", () => {
    expect(() => parseGitHubRepositoryUrl("https://github.com/cedarville-it")).toThrow(
      "Enter a GitHub repository URL in the form https://github.com/owner/repo.",
    );
  });
});
```

- [ ] **Step 2: Run the repo URL tests to verify they fail**

Run: `npm test -- src/features/repository-imports/repo-url.test.ts`

Expected: FAIL because `repo-url.ts` does not exist.

- [ ] **Step 3: Implement URL parsing**

Create `src/features/repository-imports/repo-url.ts`:

```ts
export type ParsedGitHubRepositoryUrl = {
  owner: string;
  name: string;
  normalizedUrl: string;
  fullName: string;
};

const SSH_GITHUB_REPO_PATTERN = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i;

function stripGitSuffix(value: string) {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function assertOwnerAndName(owner: string | undefined, name: string | undefined) {
  if (!owner || !name) {
    throw new Error(
      "Enter a GitHub repository URL in the form https://github.com/owner/repo.",
    );
  }
}

export function parseGitHubRepositoryUrl(
  value: string,
): ParsedGitHubRepositoryUrl {
  const trimmed = value.trim();
  const sshMatch = SSH_GITHUB_REPO_PATTERN.exec(trimmed);

  if (sshMatch) {
    const owner = sshMatch[1];
    const name = stripGitSuffix(sshMatch[2]);
    assertOwnerAndName(owner, name);

    return {
      owner,
      name,
      normalizedUrl: `https://github.com/${owner}/${name}`,
      fullName: `${owner}/${name}`,
    };
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a GitHub repository URL.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Enter a GitHub repository URL.");
  }

  const [owner, rawName] = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const name = rawName ? stripGitSuffix(rawName) : undefined;
  assertOwnerAndName(owner, name);

  return {
    owner,
    name: name as string,
    normalizedUrl: `https://github.com/${owner}/${name}`,
    fullName: `${owner}/${name}`,
  };
}
```

- [ ] **Step 4: Write failing target-name tests**

Create `src/features/repository-imports/target-name.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSharedOrgTargetName, isRepositoryInOrg } from "./target-name";

describe("isRepositoryInOrg", () => {
  it("compares org names case-insensitively", () => {
    expect(isRepositoryInOrg("Cedarville-IT", "cedarville-it")).toBe(true);
    expect(isRepositoryInOrg("student-org", "cedarville-it")).toBe(false);
  });
});

describe("buildSharedOrgTargetName", () => {
  it("uses the source repo name when available", () => {
    expect(
      buildSharedOrgTargetName({
        sourceName: "Campus Dashboard",
        existingNames: [],
      }),
    ).toBe("campus-dashboard");
  });

  it("adds a collision suffix", () => {
    expect(
      buildSharedOrgTargetName({
        sourceName: "campus-dashboard",
        existingNames: ["campus-dashboard", "campus-dashboard-2"],
      }),
    ).toBe("campus-dashboard-3");
  });

  it("uses app when the source name has no safe characters", () => {
    expect(
      buildSharedOrgTargetName({
        sourceName: "!!!",
        existingNames: [],
      }),
    ).toBe("app");
  });
});
```

- [ ] **Step 5: Run target-name tests to verify they fail**

Run: `npm test -- src/features/repository-imports/target-name.test.ts`

Expected: FAIL because `target-name.ts` does not exist.

- [ ] **Step 6: Implement target name helpers**

Create `src/features/repository-imports/target-name.ts`:

```ts
function slugifyRepositoryName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 90);

  return slug || "app";
}

export function isRepositoryInOrg(owner: string, org: string) {
  return owner.toLowerCase() === org.toLowerCase();
}

export function buildSharedOrgTargetName({
  sourceName,
  existingNames,
}: {
  sourceName: string;
  existingNames: string[];
}) {
  const existing = new Set(existingNames.map((name) => name.toLowerCase()));
  const baseName = slugifyRepositoryName(sourceName);

  if (!existing.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const candidate = `${baseName}-${suffix}`;

    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  throw new Error(`Could not choose an available target repository name for "${sourceName}".`);
}
```

- [ ] **Step 7: Run tests**

Run: `npm test -- src/features/repository-imports/repo-url.test.ts src/features/repository-imports/target-name.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/repository-imports/repo-url.ts src/features/repository-imports/repo-url.test.ts src/features/repository-imports/target-name.ts src/features/repository-imports/target-name.test.ts
git commit -m "feat: parse repository import urls"
```

---

## Task 3: Add Repository Compatibility Scanner

**Files:**
- Create: `src/features/repository-imports/compatibility.ts`
- Create: `src/features/repository-imports/compatibility.test.ts`

- [ ] **Step 1: Write failing scanner tests**

Create `src/features/repository-imports/compatibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scanRepositoryCompatibility } from "./compatibility";

describe("scanRepositoryCompatibility", () => {
  it("accepts a root Next-style npm app that already has build and start scripts", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "package-lock.json": "{}",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
    });
  });

  it("marks safe additions when start and engines are missing", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build" },
          dependencies: { next: "15.5.15" },
        }),
      }),
    ).toEqual({
      status: "NEEDS_ADDITIONS",
      findings: [
        {
          code: "MISSING_START_SCRIPT",
          severity: "warning",
          message: "package.json is missing a start script; the portal can add \"next start\".",
        },
        {
          code: "MISSING_NODE_ENGINE",
          severity: "warning",
          message: "package.json is missing engines.node; the portal can add \">=24\".",
        },
      ],
      canDirectCommit: true,
    });
  });

  it("rejects unsupported package manager lockfiles", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
        }),
        "pnpm-lock.yaml": "lockfileVersion: 9",
      }).status,
    ).toBe("UNSUPPORTED");
  });

  it("records file conflicts without overwriting existing publishing files", () => {
    const result = scanRepositoryCompatibility({
      "package.json": JSON.stringify({
        scripts: { build: "next build", start: "next start" },
        dependencies: { next: "15.5.15" },
      }),
      "app-portal/deployment-manifest.json": "{}",
    });

    expect(result.status).toBe("CONFLICTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.findings).toContainEqual({
      code: "FILE_CONFLICT",
      severity: "error",
      message: "app-portal/deployment-manifest.json already exists and will not be overwritten.",
      path: "app-portal/deployment-manifest.json",
    });
  });
});
```

- [ ] **Step 2: Run scanner tests to verify they fail**

Run: `npm test -- src/features/repository-imports/compatibility.test.ts`

Expected: FAIL because `compatibility.ts` does not exist.

- [ ] **Step 3: Implement the scanner**

Create `src/features/repository-imports/compatibility.ts`:

```ts
export type RepositoryFileMap = Record<string, string>;

export type CompatibilityFinding = {
  code:
    | "MISSING_PACKAGE_JSON"
    | "INVALID_PACKAGE_JSON"
    | "MISSING_BUILD_SCRIPT"
    | "MISSING_START_SCRIPT"
    | "MISSING_NODE_ENGINE"
    | "UNSUPPORTED_LOCKFILE"
    | "UNSUPPORTED_APP_SHAPE"
    | "FILE_CONFLICT";
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
};

export type CompatibilityStatus =
  | "COMPATIBLE"
  | "NEEDS_ADDITIONS"
  | "UNSUPPORTED"
  | "CONFLICTED";

export type CompatibilityResult = {
  status: CompatibilityStatus;
  findings: CompatibilityFinding[];
  canDirectCommit: boolean;
};

export const PUBLISHING_BUNDLE_PATHS = [
  ".github/workflows/deploy-azure-app-service.yml",
  ".codex/skills/publish-to-azure/SKILL.md",
  "docs/publishing/azure-app-service.md",
  "docs/publishing/lessons-learned.md",
  "app-portal/deployment-manifest.json",
] as const;

function parsePackageJson(files: RepositoryFileMap) {
  const rawPackageJson = files["package.json"];

  if (!rawPackageJson) {
    return {
      packageJson: null,
      finding: {
        code: "MISSING_PACKAGE_JSON" as const,
        severity: "error" as const,
        message: "A root package.json is required for v1 Azure publishing.",
        path: "package.json",
      },
    };
  }

  try {
    return {
      packageJson: JSON.parse(rawPackageJson) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        engines?: Record<string, string>;
      },
      finding: null,
    };
  } catch {
    return {
      packageJson: null,
      finding: {
        code: "INVALID_PACKAGE_JSON" as const,
        severity: "error" as const,
        message: "package.json must be valid JSON.",
        path: "package.json",
      },
    };
  }
}

function hasNextDependency(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}) {
  return Boolean(packageJson.dependencies?.next ?? packageJson.devDependencies?.next);
}

function hasUnsupportedLockfile(files: RepositoryFileMap) {
  return Boolean(files["pnpm-lock.yaml"] || files["yarn.lock"] || files["bun.lockb"]);
}

function hasConflict(files: RepositoryFileMap, path: string) {
  return Object.prototype.hasOwnProperty.call(files, path);
}

export function scanRepositoryCompatibility(
  files: RepositoryFileMap,
): CompatibilityResult {
  const findings: CompatibilityFinding[] = [];
  const { packageJson, finding } = parsePackageJson(files);

  if (finding) {
    findings.push(finding);
  }

  if (packageJson) {
    if (!packageJson.scripts?.build) {
      findings.push({
        code: "MISSING_BUILD_SCRIPT",
        severity: "error",
        message: "package.json must include a build script.",
        path: "package.json",
      });
    }

    if (!packageJson.scripts?.start) {
      findings.push({
        code: "MISSING_START_SCRIPT",
        severity: "warning",
        message:
          "package.json is missing a start script; the portal can add \"next start\".",
      });
    }

    if (!packageJson.engines?.node) {
      findings.push({
        code: "MISSING_NODE_ENGINE",
        severity: "warning",
        message:
          "package.json is missing engines.node; the portal can add \">=24\".",
      });
    }

    if (!hasNextDependency(packageJson)) {
      findings.push({
        code: "UNSUPPORTED_APP_SHAPE",
        severity: "error",
        message: "V1 supports root Next.js apps only.",
      });
    }
  }

  if (hasUnsupportedLockfile(files)) {
    findings.push({
      code: "UNSUPPORTED_LOCKFILE",
      severity: "error",
      message:
        "V1 supports npm package-lock.json or npm install fallback only.",
    });
  }

  for (const path of PUBLISHING_BUNDLE_PATHS) {
    if (hasConflict(files, path)) {
      findings.push({
        code: "FILE_CONFLICT",
        severity: "error",
        message: `${path} already exists and will not be overwritten.`,
        path,
      });
    }
  }

  const hasConflicts = findings.some((item) => item.code === "FILE_CONFLICT");
  const hasErrors = findings.some((item) => item.severity === "error");
  const hasWarnings = findings.some((item) => item.severity === "warning");

  if (hasConflicts) {
    return { status: "CONFLICTED", findings, canDirectCommit: false };
  }

  if (hasErrors) {
    return { status: "UNSUPPORTED", findings, canDirectCommit: false };
  }

  if (hasWarnings) {
    return { status: "NEEDS_ADDITIONS", findings, canDirectCommit: true };
  }

  return { status: "COMPATIBLE", findings, canDirectCommit: true };
}
```

- [ ] **Step 4: Run scanner tests**

Run: `npm test -- src/features/repository-imports/compatibility.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/repository-imports/compatibility.ts src/features/repository-imports/compatibility.test.ts
git commit -m "feat: scan repository import compatibility"
```

---

## Task 4: Plan Publishing Bundle Additions Safely

**Files:**
- Create: `src/features/repository-imports/publishing-bundle.ts`
- Create: `src/features/repository-imports/publishing-bundle.test.ts`

- [ ] **Step 1: Write failing bundle planner tests**

Create `src/features/repository-imports/publishing-bundle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planPublishingBundle } from "./publishing-bundle";

describe("planPublishingBundle", () => {
  it("adds publishing files and narrow package.json changes", () => {
    const plan = planPublishingBundle({
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      files: {
        "package.json": JSON.stringify({
          name: "campus-dashboard",
          scripts: { build: "next build" },
          dependencies: { next: "15.5.15" },
        }, null, 2),
      },
    });

    expect(Object.keys(plan.filesToWrite)).toEqual([
      "package.json",
      ".github/workflows/deploy-azure-app-service.yml",
      ".codex/skills/publish-to-azure/SKILL.md",
      "docs/publishing/azure-app-service.md",
      "docs/publishing/lessons-learned.md",
      "app-portal/deployment-manifest.json",
    ]);
    expect(JSON.parse(plan.filesToWrite["package.json"])).toMatchObject({
      scripts: { build: "next build", start: "next start" },
      engines: { node: ">=24" },
    });
    expect(JSON.parse(plan.filesToWrite["app-portal/deployment-manifest.json"])).toMatchObject({
      templateSlug: "imported-web-app",
      defaults: { githubRepository: "campus-dashboard" },
    });
  });

  it("does not rewrite package.json when start and engines already exist", () => {
    const packageJson = JSON.stringify({
      name: "campus-dashboard",
      scripts: { build: "next build", start: "next start" },
      dependencies: { next: "15.5.15" },
      engines: { node: ">=24" },
    }, null, 2);

    const plan = planPublishingBundle({
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      files: { "package.json": packageJson },
    });

    expect(plan.filesToWrite["package.json"]).toBeUndefined();
  });

  it("rejects existing target publishing files", () => {
    expect(() =>
      planPublishingBundle({
        appName: "Campus Dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        files: {
          "package.json": JSON.stringify({
            scripts: { build: "next build", start: "next start" },
            dependencies: { next: "15.5.15" },
          }),
          ".github/workflows/deploy-azure-app-service.yml": "name: Custom",
        },
      }),
    ).toThrow(".github/workflows/deploy-azure-app-service.yml already exists");
  });
});
```

- [ ] **Step 2: Run planner tests to verify they fail**

Run: `npm test -- src/features/repository-imports/publishing-bundle.test.ts`

Expected: FAIL because `publishing-bundle.ts` does not exist.

- [ ] **Step 3: Implement the planner**

Create `src/features/repository-imports/publishing-bundle.ts`:

```ts
import { buildDeploymentManifest } from "@/features/generation/deployment-manifest";
import { PUBLISHING_BUNDLE_PATHS, type RepositoryFileMap } from "./compatibility";

type PublishingBundleInput = {
  appName: string;
  repositoryOwner: string;
  repositoryName: string;
  files: RepositoryFileMap;
};

type PublishingBundlePlan = {
  filesToWrite: Record<string, string>;
};

const DEPLOY_WORKFLOW = `name: Deploy to Azure App Service

on:
  workflow_dispatch:
  push:
    branches:
      - main

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}
  DEPLOY_PACKAGE_PATH: release

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi

      - name: Build application
        run: npm run build

      - name: Prepare deployment package
        run: |
          rm -rf "\${{ env.DEPLOY_PACKAGE_PATH }}"
          mkdir -p "\${{ env.DEPLOY_PACKAGE_PATH }}"
          cp -R .next "\${{ env.DEPLOY_PACKAGE_PATH }}/.next"
          cp -R node_modules "\${{ env.DEPLOY_PACKAGE_PATH }}/node_modules"
          cp package.json "\${{ env.DEPLOY_PACKAGE_PATH }}/"
          for file in package-lock.json next.config.js next.config.mjs next.config.ts next-env.d.ts prisma.config.ts; do
            if [ -f "$file" ]; then
              cp "$file" "\${{ env.DEPLOY_PACKAGE_PATH }}/"
            fi
          done
          for dir in public prisma; do
            if [ -d "$dir" ]; then
              cp -R "$dir" "\${{ env.DEPLOY_PACKAGE_PATH }}/$dir"
            fi
          done

      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: \${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: \${{ secrets.AZURE_TENANT_ID }}
          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: \${{ env.AZURE_WEBAPP_NAME }}
          package: \${{ env.DEPLOY_PACKAGE_PATH }}
`;

function buildImportedManifest(appName: string, repositoryName: string) {
  return `${JSON.stringify(
    {
      ...buildDeploymentManifest({
        templateSlug: "imported-web-app",
        appName,
        description: `Imported app ${appName}`,
        hostingTarget: "Azure App Service",
      }),
      templateSlug: "imported-web-app",
      defaults: {
        ...buildDeploymentManifest({
          templateSlug: "imported-web-app",
          appName,
          description: `Imported app ${appName}`,
          hostingTarget: "Azure App Service",
        }).defaults,
        githubRepository: repositoryName,
      },
    },
    null,
    2,
  )}\n`;
}

function updatePackageJson(rawPackageJson: string) {
  const parsed = JSON.parse(rawPackageJson) as {
    scripts?: Record<string, string>;
    engines?: Record<string, string>;
    [key: string]: unknown;
  };
  let changed = false;

  if (!parsed.scripts?.start) {
    parsed.scripts = { ...parsed.scripts, start: "next start" };
    changed = true;
  }

  if (!parsed.engines?.node) {
    parsed.engines = { ...parsed.engines, node: ">=24" };
    changed = true;
  }

  return changed ? `${JSON.stringify(parsed, null, 2)}\n` : null;
}

function assertNoPublishingPathConflicts(files: RepositoryFileMap) {
  for (const path of PUBLISHING_BUNDLE_PATHS) {
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      throw new Error(`${path} already exists and will not be overwritten.`);
    }
  }
}

export function planPublishingBundle({
  appName,
  repositoryName,
  files,
}: PublishingBundleInput): PublishingBundlePlan {
  assertNoPublishingPathConflicts(files);
  const filesToWrite: Record<string, string> = {};
  const updatedPackageJson = updatePackageJson(files["package.json"]);

  if (updatedPackageJson) {
    filesToWrite["package.json"] = updatedPackageJson;
  }

  filesToWrite[".github/workflows/deploy-azure-app-service.yml"] = DEPLOY_WORKFLOW;
  filesToWrite[".codex/skills/publish-to-azure/SKILL.md"] =
    `# Publish to Azure\n\nUse the Cedarville App Portal as the supported Azure publishing path for this imported app.\n`;
  filesToWrite["docs/publishing/azure-app-service.md"] =
    `# Publish to Azure App Service\n\nThis imported app is prepared for Cedarville App Portal-managed Azure publishing.\n`;
  filesToWrite["docs/publishing/lessons-learned.md"] =
    `# Publishing Lessons Learned\n\nRecord manual fixes and deployment blockers here.\n`;
  filesToWrite["app-portal/deployment-manifest.json"] = buildImportedManifest(
    appName,
    repositoryName,
  );

  return { filesToWrite };
}
```

- [ ] **Step 4: Refactor duplicate manifest construction**

In `buildImportedManifest`, avoid calling `buildDeploymentManifest` twice by storing it in a local `manifest` variable. The finished function should be:

```ts
function buildImportedManifest(appName: string, repositoryName: string) {
  const manifest = buildDeploymentManifest({
    templateSlug: "imported-web-app",
    appName,
    description: `Imported app ${appName}`,
    hostingTarget: "Azure App Service",
  });

  return `${JSON.stringify(
    {
      ...manifest,
      templateSlug: "imported-web-app",
      defaults: {
        ...manifest.defaults,
        githubRepository: repositoryName,
      },
    },
    null,
    2,
  )}\n`;
}
```

- [ ] **Step 5: Run planner tests**

Run: `npm test -- src/features/repository-imports/publishing-bundle.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/repository-imports/publishing-bundle.ts src/features/repository-imports/publishing-bundle.test.ts
git commit -m "feat: plan imported app publishing bundle"
```

---

## Task 5: Expand GitHub App Client For Repo Reads, Commits, Branches, And PRs

**Files:**
- Modify: `src/features/repositories/github-app.ts`
- Modify: `src/features/repositories/github-app.test.ts`

- [ ] **Step 1: Add failing GitHub client tests**

Append tests to `src/features/repositories/github-app.test.ts`:

```ts
  it("reads repository metadata and ignores missing optional text files", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          html_url: "https://github.com/cedarville-it/campus-dashboard",
          default_branch: "main",
          name: "campus-dashboard",
          owner: { login: "cedarville-it" },
          private: true,
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(createJsonResponse({ content: Buffer.from("{}").toString("base64") }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }));

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await expect(
      client.getRepository({ owner: "cedarville-it", name: "campus-dashboard" }),
    ).resolves.toMatchObject({
      owner: "cedarville-it",
      name: "campus-dashboard",
      defaultBranch: "main",
    });
    await expect(
      client.readRepositoryTextFiles({
        owner: "cedarville-it",
        name: "campus-dashboard",
        ref: "main",
        paths: ["package.json", "package-lock.json"],
      }),
    ).resolves.toEqual({
      "package.json": "{}",
    });
  });

  it("commits files directly and opens pull requests", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(createJsonResponse({ token: "installation-token" }));

    fetchImpl
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(createJsonResponse({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "blob-1" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "tree-sha" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "commit-sha" }))
      .mockResolvedValueOnce(createJsonResponse({ ref: "refs/heads/main" }))
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(createJsonResponse({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(createJsonResponse({ ref: "refs/heads/portal/add-azure-publishing" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "blob-2" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "tree-sha-2" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "commit-sha-2" }))
      .mockResolvedValueOnce(createJsonResponse({ ref: "refs/heads/portal/add-azure-publishing" }))
      .mockResolvedValueOnce(createJsonResponse({ html_url: "https://github.com/cedarville-it/campus-dashboard/pull/1" }));

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await expect(
      client.commitFiles({
        owner: "cedarville-it",
        name: "campus-dashboard",
        branch: "main",
        message: "Add Azure publishing",
        files: { "docs/publishing/azure-app-service.md": "# Publish\n" },
      }),
    ).resolves.toEqual({ commitSha: "commit-sha" });

    await expect(
      client.createPullRequestWithFiles({
        owner: "cedarville-it",
        name: "campus-dashboard",
        baseBranch: "main",
        branch: "portal/add-azure-publishing",
        title: "Add Azure publishing",
        body: "Prepared by the portal.",
        message: "Add Azure publishing",
        files: { "docs/publishing/azure-app-service.md": "# Publish\n" },
      }),
    ).resolves.toEqual({
      commitSha: "commit-sha-2",
      pullRequestUrl: "https://github.com/cedarville-it/campus-dashboard/pull/1",
    });
  });
```

- [ ] **Step 2: Run GitHub client tests to verify they fail**

Run: `npm test -- src/features/repositories/github-app.test.ts`

Expected: FAIL because new methods are missing.

- [ ] **Step 3: Add method input and response types**

In `src/features/repositories/github-app.ts`, add:

```ts
type GetRepositoryInput = {
  owner: string;
  name: string;
};

type ReadRepositoryTextFilesInput = {
  owner: string;
  name: string;
  ref: string;
  paths: string[];
};

type CommitFilesInput = {
  owner: string;
  name: string;
  branch: string;
  message: string;
  files: Record<string, string>;
};

type CreatePullRequestWithFilesInput = {
  owner: string;
  name: string;
  baseBranch: string;
  branch: string;
  title: string;
  body: string;
  message: string;
  files: Record<string, string>;
};

type GitHubTreeListResponse = {
  tree: Array<{
    path: string;
    type: "blob" | "tree" | string;
    url: string;
  }>;
};

type GitHubContentResponse = {
  content: string;
  encoding?: string;
};

type GitHubPullRequestResponse = {
  html_url: string;
};
```

- [ ] **Step 4: Add helper functions**

In `src/features/repositories/github-app.ts`, add helpers near existing GitHub helpers:

```ts
function decodeGitHubBase64Content(data: GitHubContentResponse) {
  return Buffer.from(data.content.replaceAll(/\s/g, ""), "base64").toString("utf8");
}

async function createCommitFromFiles({
  fetchImpl,
  headers,
  owner,
  name,
  branch,
  message,
  files,
}: CommitFilesInput & {
  fetchImpl: FetchLike;
  headers: Record<string, string>;
}) {
  const encodedOwner = githubPathSegment(owner);
  const encodedName = githubPathSegment(name);
  const ref = await readJson<GitHubRefResponse>(
    await fetchImpl(
      `https://api.github.com/repos/${encodedOwner}/${encodedName}/git/ref/heads/${githubPathSegment(branch)}`,
      { method: "GET", headers },
    ),
  );
  const tree = [];

  for (const [filePath, content] of Object.entries(files)) {
    const blob = await readJson<GitHubBlobResponse>(
      await fetchImpl(
        `https://api.github.com/repos/${encodedOwner}/${encodedName}/git/blobs`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ content, encoding: "utf-8" }),
        },
      ),
    );
    tree.push({ path: filePath, mode: "100644", type: "blob", sha: blob.sha });
  }

  const createdTree = await readJson<GitHubTreeResponse>(
    await fetchImpl(`https://api.github.com/repos/${encodedOwner}/${encodedName}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tree }),
    }),
  );
  const commit = await readJson<GitHubCommitResponse>(
    await fetchImpl(`https://api.github.com/repos/${encodedOwner}/${encodedName}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        tree: createdTree.sha,
        parents: [ref.object.sha],
      }),
    }),
  );

  await readJson<{ ref: string }>(
    await fetchImpl(
      `https://api.github.com/repos/${encodedOwner}/${encodedName}/git/refs/heads/${githubPathSegment(branch)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sha: commit.sha, force: false }),
      },
    ),
  );

  return { commitSha: commit.sha };
}
```

- [ ] **Step 5: Add client methods**

Inside the object returned by `createGitHubAppClient`, add:

```ts
    async getRepository({ owner, name }: GetRepositoryInput) {
      const headers = await withInstallationHeaders();
      const repository = await readJson<GitHubRepositoryResponse & { private?: boolean }>(
        await fetchImpl(
          `https://api.github.com/repos/${githubPathSegment(owner)}/${githubPathSegment(name)}`,
          { method: "GET", headers },
        ),
      );

      return {
        owner: repository.owner.login,
        name: repository.name,
        url: repository.html_url,
        defaultBranch: repository.default_branch,
        private: Boolean(repository.private),
      };
    },
    async readRepositoryTextFiles({
      owner,
      name,
      ref,
      paths,
    }: ReadRepositoryTextFilesInput) {
      const headers = await withInstallationHeaders();
      const encodedOwner = githubPathSegment(owner);
      const encodedName = githubPathSegment(name);
      const files: Record<string, string> = {};

      for (const path of paths) {
        const response = await fetchImpl(
          `https://api.github.com/repos/${encodedOwner}/${encodedName}/contents/${path.split("/").map(githubPathSegment).join("/")}?ref=${encodeURIComponent(ref)}`,
          { method: "GET", headers },
        );

        if (response.status === 404) {
          continue;
        }

        const content = await readJson<GitHubContentResponse>(response);
        files[path] = decodeGitHubBase64Content(content);
      }

      return files;
    },
    async commitFiles(input: CommitFilesInput) {
      const headers = await withInstallationHeaders();

      return createCommitFromFiles({ ...input, fetchImpl, headers });
    },
    async createPullRequestWithFiles(input: CreatePullRequestWithFilesInput) {
      const headers = await withInstallationHeaders();
      const encodedOwner = githubPathSegment(input.owner);
      const encodedName = githubPathSegment(input.name);
      const baseRef = await readJson<GitHubRefResponse>(
        await fetchImpl(
          `https://api.github.com/repos/${encodedOwner}/${encodedName}/git/ref/heads/${githubPathSegment(input.baseBranch)}`,
          { method: "GET", headers },
        ),
      );

      await readJson<{ ref: string }>(
        await fetchImpl(`https://api.github.com/repos/${encodedOwner}/${encodedName}/git/refs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ref: `refs/heads/${input.branch}`,
            sha: baseRef.object.sha,
          }),
        }),
      );

      const commit = await createCommitFromFiles({
        owner: input.owner,
        name: input.name,
        branch: input.branch,
        message: input.message,
        files: input.files,
        fetchImpl,
        headers,
      });
      const pullRequest = await readJson<GitHubPullRequestResponse>(
        await fetchImpl(`https://api.github.com/repos/${encodedOwner}/${encodedName}/pulls`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: input.title,
            body: input.body,
            head: input.branch,
            base: input.baseBranch,
          }),
        }),
      );

      return {
        commitSha: commit.commitSha,
        pullRequestUrl: pullRequest.html_url,
      };
    },
```

- [ ] **Step 6: Run GitHub client tests**

Run: `npm test -- src/features/repositories/github-app.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/repositories/github-app.ts src/features/repositories/github-app.test.ts
git commit -m "feat: add github repository preparation APIs"
```

---

## Task 6: Prepare Already-Shared Compatible Repositories

**Files:**
- Create: `src/features/repository-imports/prepare-repository.ts`
- Create: `src/features/repository-imports/prepare-repository.test.ts`

- [ ] **Step 1: Write failing preparation tests**

Create `src/features/repository-imports/prepare-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { prepareImportedRepository } from "./prepare-repository";

const files = {
  "package.json": JSON.stringify({
    scripts: { build: "next build" },
    dependencies: { next: "15.5.15" },
  }),
};

describe("prepareImportedRepository", () => {
  it("commits publishing additions directly", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn().mockResolvedValue({ commitSha: "commit-sha" }),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).resolves.toEqual({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
    });
    expect(github.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "main",
        message: "Add Azure publishing support",
      }),
    );
  });

  it("opens a PR when requested", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn().mockResolvedValue({
        commitSha: "commit-sha",
        pullRequestUrl: "https://github.com/cedarville-it/campus-dashboard/pull/1",
      }),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "PULL_REQUEST",
        github,
      }),
    ).resolves.toEqual({
      status: "PULL_REQUEST_OPENED",
      commitSha: "commit-sha",
      pullRequestUrl: "https://github.com/cedarville-it/campus-dashboard/pull/1",
    });
  });

  it("blocks direct commits when compatibility conflicts exist", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ...files,
        "app-portal/deployment-manifest.json": "{}",
      }),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).rejects.toThrow("Repository has publishing file conflicts.");
  });
});
```

- [ ] **Step 2: Run preparation tests to verify they fail**

Run: `npm test -- src/features/repository-imports/prepare-repository.test.ts`

Expected: FAIL because `prepare-repository.ts` does not exist.

- [ ] **Step 3: Implement preparation service**

Create `src/features/repository-imports/prepare-repository.ts`:

```ts
import { PUBLISHING_BUNDLE_PATHS, scanRepositoryCompatibility } from "./compatibility";
import { planPublishingBundle } from "./publishing-bundle";

type PreparationMode = "DIRECT_COMMIT" | "PULL_REQUEST";

type GitHubPreparationClient = {
  readRepositoryTextFiles(input: {
    owner: string;
    name: string;
    ref: string;
    paths: string[];
  }): Promise<Record<string, string>>;
  commitFiles(input: {
    owner: string;
    name: string;
    branch: string;
    message: string;
    files: Record<string, string>;
  }): Promise<{ commitSha: string }>;
  createPullRequestWithFiles(input: {
    owner: string;
    name: string;
    baseBranch: string;
    branch: string;
    title: string;
    body: string;
    message: string;
    files: Record<string, string>;
  }): Promise<{ commitSha: string; pullRequestUrl: string }>;
};

type PrepareImportedRepositoryInput = {
  appName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  mode: PreparationMode;
  github: GitHubPreparationClient;
};

const READ_PATHS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  ...PUBLISHING_BUNDLE_PATHS,
];

function buildPullRequestBody(appName: string) {
  return [
    `This PR prepares ${appName} for Cedarville App Portal-managed Azure publishing.`,
    "",
    "Changes:",
    "- Adds the Azure App Service deployment workflow.",
    "- Adds the App Portal deployment manifest.",
    "- Adds publishing docs and fallback Codex skill.",
    "- Adds narrow package.json runtime defaults when missing.",
  ].join("\n");
}

export async function prepareImportedRepository({
  appName,
  owner,
  name,
  defaultBranch,
  mode,
  github,
}: PrepareImportedRepositoryInput) {
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: defaultBranch,
    paths: READ_PATHS,
  });
  const compatibility = scanRepositoryCompatibility(files);

  if (compatibility.status === "CONFLICTED") {
    throw new Error("Repository has publishing file conflicts.");
  }

  if (compatibility.status === "UNSUPPORTED") {
    throw new Error("Repository is not compatible with v1 Azure publishing.");
  }

  const plan = planPublishingBundle({
    appName,
    repositoryOwner: owner,
    repositoryName: name,
    files,
  });

  if (mode === "DIRECT_COMMIT") {
    const commit = await github.commitFiles({
      owner,
      name,
      branch: defaultBranch,
      message: "Add Azure publishing support",
      files: plan.filesToWrite,
    });

    return {
      status: "COMMITTED" as const,
      commitSha: commit.commitSha,
      pullRequestUrl: null,
    };
  }

  const branch = "portal/add-azure-publishing";
  const pullRequest = await github.createPullRequestWithFiles({
    owner,
    name,
    baseBranch: defaultBranch,
    branch,
    title: "Add Azure publishing support",
    body: buildPullRequestBody(appName),
    message: "Add Azure publishing support",
    files: plan.filesToWrite,
  });

  return {
    status: "PULL_REQUEST_OPENED" as const,
    commitSha: pullRequest.commitSha,
    pullRequestUrl: pullRequest.pullRequestUrl,
  };
}
```

- [ ] **Step 4: Run preparation tests**

Run: `npm test -- src/features/repository-imports/prepare-repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/repository-imports/prepare-repository.ts src/features/repository-imports/prepare-repository.test.ts
git commit -m "feat: prepare imported repositories for azure"
```

---

## Task 7: Add Server Actions For Submit, Analyze, And Prepare

**Files:**
- Create: `src/features/repository-imports/actions.ts`
- Create: `src/features/repository-imports/actions.test.ts`
- Modify: `src/features/repositories/config.ts`
- Modify: `src/features/repositories/config.test.ts`

- [ ] **Step 1: Add config helper tests**

Append to `src/features/repositories/config.test.ts`:

```ts
  it("returns the configured installation id for an org", () => {
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_ALLOWED_ORGS: "cedarville-it",
      GITHUB_DEFAULT_ORG: "cedarville-it",
      GITHUB_APP_INSTALLATIONS_JSON: JSON.stringify({
        "cedarville-it": "111",
        "student-org": "222",
      }),
    });

    expect(config.installationIdsByOrg["student-org"]).toBe("222");
  });
```

- [ ] **Step 2: Run config tests**

Run: `npm test -- src/features/repositories/config.test.ts`

Expected: PASS; this confirms existing config supports per-org installation lookup.

- [ ] **Step 3: Write failing action tests**

Create `src/features/repository-imports/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { addExistingAppAction, prepareExistingAppAction } from "./actions";
import { prepareImportedRepository } from "./prepare-repository";

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    template: { upsert: vi.fn() },
    appRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    repositoryImport: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("./prepare-repository", () => ({
  prepareImportedRepository: vi.fn(),
}));

describe("repository import actions", () => {
  beforeEach(() => {
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(prisma.template.upsert).mockReset();
    vi.mocked(prisma.appRequest.create).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.repositoryImport.create).mockReset();
    vi.mocked(prisma.repositoryImport.update).mockReset();
    vi.mocked(prepareImportedRepository).mockReset();
  });

  it("creates an imported app request for a shared-org repo", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-imported",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "req_123",
      supportReference: "SUP-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);

    const formData = new FormData();
    formData.set("repositoryUrl", "https://github.com/cedarville-it/campus-dashboard");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Existing dashboard.");

    await addExistingAppAction(formData, {
      defaultOrg: "cedarville-it",
      repository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });

    expect(prisma.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-123",
        appName: "Campus Dashboard",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
      }),
    });
    expect(prisma.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appRequestId: "req_123",
        importStatus: "NOT_REQUIRED",
        compatibilityStatus: "NOT_SCANNED",
      }),
    });
  });

  it("prepares an imported app by direct commit", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      userId: "user-123",
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      repositoryImport: { id: "import_123" },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prepareImportedRepository).mockResolvedValue({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
    });

    const formData = new FormData();
    formData.set("preparationMode", "DIRECT_COMMIT");

    await prepareExistingAppAction("req_123", formData, {
      github: {
        readRepositoryTextFiles: vi.fn(),
        commitFiles: vi.fn(),
        createPullRequestWithFiles: vi.fn(),
      },
    });

    expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
      where: { id: "import_123" },
      data: expect.objectContaining({
        preparationMode: "DIRECT_COMMIT",
        preparationStatus: "COMMITTED",
        preparationErrorSummary: null,
      }),
    });
  });
});
```

- [ ] **Step 4: Run action tests to verify they fail**

Run: `npm test -- src/features/repository-imports/actions.test.ts`

Expected: FAIL because `actions.ts` does not exist.

- [ ] **Step 5: Implement server actions**

Create `src/features/repository-imports/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { createSupportReference } from "@/lib/support-reference";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { parseGitHubRepositoryUrl } from "./repo-url";
import { isRepositoryInOrg } from "./target-name";
import { prepareImportedRepository } from "./prepare-repository";

const addExistingAppSchema = z.object({
  repositoryUrl: z.string().min(1),
  appName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
});

const preparationModeSchema = z.enum(["DIRECT_COMMIT", "PULL_REQUEST"]);

type AddExistingAppDeps = {
  defaultOrg?: string;
  repository?: {
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
  };
};

type PrepareExistingAppDeps = {
  github?: Parameters<typeof prepareImportedRepository>[0]["github"];
};

async function upsertImportedTemplate() {
  return prisma.template.upsert({
    where: { slug: "imported-web-app" },
    update: {
      slug: "imported-web-app",
      name: "Imported Web App",
      description: "Existing GitHub app prepared for Azure App Service publishing.",
      version: "1.0.0",
      status: "ACTIVE",
      inputSchema: {},
      hostingOptions: ["Azure App Service"],
    },
    create: {
      slug: "imported-web-app",
      name: "Imported Web App",
      description: "Existing GitHub app prepared for Azure App Service publishing.",
      version: "1.0.0",
      status: "ACTIVE",
      inputSchema: {},
      hostingOptions: ["Azure App Service"],
    },
  });
}

export async function addExistingAppAction(
  formData: FormData,
  deps: AddExistingAppDeps = {},
) {
  const parsed = addExistingAppSchema.parse({
    repositoryUrl: String(formData.get("repositoryUrl") ?? ""),
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  const source = parseGitHubRepositoryUrl(parsed.repositoryUrl);
  const defaultOrg = deps.defaultOrg ?? loadGitHubAppConfig().defaultOrg;
  const repository =
    deps.repository ??
    {
      owner: source.owner,
      name: source.name,
      url: source.normalizedUrl,
      defaultBranch: "main",
    };
  const userId = await resolveCurrentUserId();
  const template = await upsertImportedTemplate();
  const supportReference = createSupportReference();
  const isSharedOrgRepo = isRepositoryInOrg(source.owner, defaultOrg);
  const request = await prisma.appRequest.create({
    data: {
      userId,
      templateId: template.id,
      templateVersion: "1.0.0",
      appName: parsed.appName,
      submittedConfig: {
        repositoryUrl: source.normalizedUrl,
        description: parsed.description ?? "",
        hostingTarget: "Azure App Service",
      },
      generationStatus: "SUCCEEDED",
      supportReference,
      deploymentTarget: "Azure App Service",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryProvider: "GITHUB",
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      repositoryUrl: repository.url,
      repositoryDefaultBranch: repository.defaultBranch,
      repositoryVisibility: null,
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
    },
  });

  await prisma.repositoryImport.create({
    data: {
      appRequestId: request.id,
      sourceRepositoryUrl: source.normalizedUrl,
      sourceRepositoryOwner: source.owner,
      sourceRepositoryName: source.name,
      sourceRepositoryDefaultBranch: repository.defaultBranch,
      targetRepositoryOwner: repository.owner,
      targetRepositoryName: repository.name,
      targetRepositoryUrl: repository.url,
      targetRepositoryDefaultBranch: repository.defaultBranch,
      importStatus: isSharedOrgRepo ? "NOT_REQUIRED" : "PENDING",
      compatibilityStatus: "NOT_SCANNED",
      compatibilityFindings: [],
      preparationStatus: "PENDING_USER_CHOICE",
    },
  });

  await recordAuditEvent("EXISTING_APP_ADD_REQUESTED", {
    requestId: request.id,
    supportReference,
    sourceRepositoryUrl: source.normalizedUrl,
    targetRepositoryUrl: repository.url,
  });

  revalidatePath("/apps");

  return { requestId: request.id };
}

function createDefaultPreparationGitHubClient(owner: string) {
  const config = loadGitHubAppConfig();
  const installationId = config.installationIdsByOrg[owner];

  if (!installationId) {
    throw new Error(`No GitHub App installation is configured for org "${owner}".`);
  }

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId,
  });
}

export async function prepareExistingAppAction(
  requestId: string,
  formData: FormData,
  deps: PrepareExistingAppDeps,
) {
  const mode = preparationModeSchema.parse(formData.get("preparationMode"));
  const userId = await resolveCurrentUserId();
  const appRequest = await prisma.appRequest.findFirst({
    where: { id: requestId, userId },
    include: { repositoryImport: true },
  });

  if (
    !appRequest?.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch ||
    !appRequest.repositoryImport
  ) {
    throw new Error("Imported app repository is not ready for preparation.");
  }

  await prisma.repositoryImport.update({
    where: { id: appRequest.repositoryImport.id },
    data: {
      preparationMode: mode,
      preparationStatus: "RUNNING",
      preparationErrorSummary: null,
    },
  });

  try {
    const result = await prepareImportedRepository({
      appName: appRequest.appName,
      owner: appRequest.repositoryOwner,
      name: appRequest.repositoryName,
      defaultBranch: appRequest.repositoryDefaultBranch,
      mode,
      github: deps.github ?? createDefaultPreparationGitHubClient(appRequest.repositoryOwner),
    });

    await prisma.repositoryImport.update({
      where: { id: appRequest.repositoryImport.id },
      data: {
        preparationMode: mode,
        preparationStatus: result.status,
        preparationPullRequestUrl: result.pullRequestUrl,
        preparationErrorSummary: null,
      },
    });

    await recordAuditEvent(
      result.status === "COMMITTED"
        ? "REPOSITORY_PREPARATION_COMMITTED"
        : "REPOSITORY_PREPARATION_PR_OPENED",
      {
        requestId,
        pullRequestUrl: result.pullRequestUrl,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";

    await prisma.repositoryImport.update({
      where: { id: appRequest.repositoryImport.id },
      data: {
        preparationMode: mode,
        preparationStatus: "FAILED",
        preparationErrorSummary: message,
      },
    });

    throw error;
  }

  revalidatePath("/apps");
}
```

- [ ] **Step 6: Run action tests**

Run: `npm test -- src/features/repository-imports/actions.test.ts src/features/repositories/config.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts src/features/repositories/config.test.ts
git commit -m "feat: add imported app server actions"
```

---

## Task 8: Add The `/apps/add` Page

**Files:**
- Create: `src/app/apps/add/page.tsx`
- Create: `src/app/apps/add/page.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.smoke.test.tsx`

- [ ] **Step 1: Write failing add page tests**

Create `src/app/apps/add/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddExistingAppPage from "./page";

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/repository-imports/actions", () => ({
  addExistingAppAction: vi.fn(),
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";

afterEach(() => {
  cleanup();
});

describe("AddExistingAppPage", () => {
  it("renders the add existing app form for signed-in users", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");

    render(await AddExistingAppPage());

    expect(
      screen.getByRole("heading", { name: /add existing app/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/github repository url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^app name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /analyze repository/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run add page tests to verify they fail**

Run: `npm test -- src/app/apps/add/page.test.tsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement add page**

Create `src/app/apps/add/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { addExistingAppAction } from "@/features/repository-imports/actions";

export default async function AddExistingAppPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/apps">My Apps</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Add Existing App</span>
      </nav>
      <h1>Add Existing App</h1>
      <p>Add a compatible GitHub app repository to prepare it for portal-managed Azure publishing.</p>
      <form action={addExistingAppAction}>
        <label>
          GitHub Repository URL
          <input
            name="repositoryUrl"
            type="url"
            required
            placeholder="https://github.com/owner/repo"
          />
        </label>
        <label>
          App Name
          <input name="appName" type="text" required />
        </label>
        <label>
          Description
          <textarea name="description" rows={4} />
        </label>
        <button type="submit">Analyze Repository</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Add home-page link test**

Modify `src/app/page.smoke.test.tsx` to also expect:

```tsx
expect(
  screen.getByRole("link", { name: /add existing app/i }),
).toHaveAttribute("href", "/apps/add");
```

- [ ] **Step 5: Add home-page link**

Modify `src/app/page.tsx` to include a second link:

```tsx
<Link href="/apps/add">Add Existing App</Link>
```

- [ ] **Step 6: Run page tests**

Run: `npm test -- src/app/apps/add/page.test.tsx src/app/page.smoke.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/apps/add/page.tsx src/app/apps/add/page.test.tsx src/app/page.tsx src/app/page.smoke.test.tsx
git commit -m "feat: add existing app entry point"
```

---

## Task 9: Show Imported App Status And Preparation Choices In `My Apps`

**Files:**
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`

- [ ] **Step 1: Add failing `My Apps` tests**

Append to `src/app/apps/page.test.tsx`:

```tsx
  it("shows imported app repository import and preparation status", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_imported",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        publishUrl: null,
        primaryPublishUrl: null,
        azureWebAppName: null,
        azureDatabaseName: null,
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/student-org/campus-dashboard",
          importStatus: "SUCCEEDED",
          compatibilityStatus: "NEEDS_ADDITIONS",
          preparationStatus: "PENDING_USER_CHOICE",
          preparationPullRequestUrl: null,
          preparationErrorSummary: null,
        },
        publishAttempts: [],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    expect(screen.getByText(/source repo: https:\/\/github.com\/student-org\/campus-dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/import: succeeded/i)).toBeInTheDocument();
    expect(screen.getByText(/compatibility: needs additions/i)).toBeInTheDocument();
    expect(screen.getByText(/preparation: pending user choice/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /commit azure publishing additions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open azure publishing pr/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run `My Apps` test to verify it fails**

Run: `npm test -- src/app/apps/page.test.tsx`

Expected: FAIL because `repositoryImport` is not included or rendered.

- [ ] **Step 3: Include repository import records in query**

In `src/app/apps/page.tsx`, update the `findMany` include:

```ts
include: {
  repositoryImport: true,
  publishAttempts: {
    orderBy: { createdAt: "desc" },
    take: 1,
  },
},
```

- [ ] **Step 4: Import preparation action**

In `src/app/apps/page.tsx`, add:

```ts
import { prepareExistingAppAction } from "@/features/repository-imports/actions";
```

- [ ] **Step 5: Render imported status panel**

Add a helper in `src/app/apps/page.tsx`:

```tsx
function renderRepositoryImportPanel(request: {
  id: string;
  repositoryImport?: {
    sourceRepositoryUrl: string;
    importStatus: string;
    compatibilityStatus: string;
    preparationStatus: string;
    preparationPullRequestUrl: string | null;
    preparationErrorSummary: string | null;
  } | null;
}) {
  if (!request.repositoryImport) {
    return null;
  }

  const directFormDataName = "preparationMode";
  const prepareAction = prepareExistingAppAction.bind(null, request.id);

  return (
    <section aria-label="Imported repository status">
      <p>Source repo: {request.repositoryImport.sourceRepositoryUrl}</p>
      <p>Import: {formatStatus(request.repositoryImport.importStatus)}</p>
      <p>
        Compatibility: {formatStatus(request.repositoryImport.compatibilityStatus)}
      </p>
      <p>Preparation: {formatStatus(request.repositoryImport.preparationStatus)}</p>
      {request.repositoryImport.preparationPullRequestUrl ? (
        <p>
          Preparation PR:{" "}
          <a href={request.repositoryImport.preparationPullRequestUrl}>
            {request.repositoryImport.preparationPullRequestUrl}
          </a>
        </p>
      ) : null}
      {request.repositoryImport.preparationErrorSummary ? (
        <p>Preparation error: {request.repositoryImport.preparationErrorSummary}</p>
      ) : null}
      {request.repositoryImport.preparationStatus === "PENDING_USER_CHOICE" ? (
        <>
          <form action={prepareAction}>
            <input
              name={directFormDataName}
              type="hidden"
              value="DIRECT_COMMIT"
            />
            <button type="submit">Commit Azure Publishing Additions</button>
          </form>
          <form action={prepareAction}>
            <input
              name={directFormDataName}
              type="hidden"
              value="PULL_REQUEST"
            />
            <button type="submit">Open Azure Publishing PR</button>
          </form>
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 6: Render the panel inside each app list item**

Inside the `appRequests.map` item in `src/app/apps/page.tsx`, after repository URL rendering, add:

```tsx
{renderRepositoryImportPanel({
  id: request.id,
  repositoryImport: request.repositoryImport,
})}
```

- [ ] **Step 7: Run `My Apps` tests**

Run: `npm test -- src/app/apps/page.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/apps/page.tsx src/app/apps/page.test.tsx
git commit -m "feat: show imported apps in my apps"
```

---

## Task 10: Verify Imported Publish Readiness And Gate Publishing

**Files:**
- Create: `src/features/repository-imports/publish-readiness.ts`
- Create: `src/features/repository-imports/publish-readiness.test.ts`
- Modify: `src/features/repository-imports/actions.ts`
- Modify: `src/features/repository-imports/actions.test.ts`
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/azure/runtime.ts`
- Modify: `src/features/publishing/azure/runtime.test.ts`

- [ ] **Step 1: Add failing publish readiness tests**

Create `src/features/repository-imports/publish-readiness.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { verifyImportedPublishReadiness } from "./publish-readiness";

describe("verifyImportedPublishReadiness", () => {
  it("passes when all required publishing files are present on the default branch", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        ".github/workflows/deploy-azure-app-service.yml": "name: Deploy",
        ".codex/skills/publish-to-azure/SKILL.md": "# Publish",
        "docs/publishing/azure-app-service.md": "# Azure",
        "docs/publishing/lessons-learned.md": "# Lessons",
        "app-portal/deployment-manifest.json": "{}",
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({ ready: true, missingPaths: [] });
  });

  it("returns missing paths when a PR has not been merged", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: [
        ".github/workflows/deploy-azure-app-service.yml",
        ".codex/skills/publish-to-azure/SKILL.md",
        "docs/publishing/azure-app-service.md",
        "docs/publishing/lessons-learned.md",
        "app-portal/deployment-manifest.json",
      ],
    });
  });
});
```

- [ ] **Step 2: Run publish readiness tests to verify they fail**

Run: `npm test -- src/features/repository-imports/publish-readiness.test.ts`

Expected: FAIL because `publish-readiness.ts` does not exist.

- [ ] **Step 3: Implement publish readiness verification**

Create `src/features/repository-imports/publish-readiness.ts`:

```ts
import { PUBLISHING_BUNDLE_PATHS } from "./compatibility";

type PublishReadinessGithubClient = {
  readRepositoryTextFiles(input: {
    owner: string;
    name: string;
    ref: string;
    paths: string[];
  }): Promise<Record<string, string>>;
};

export async function verifyImportedPublishReadiness({
  owner,
  name,
  defaultBranch,
  github,
}: {
  owner: string;
  name: string;
  defaultBranch: string;
  github: PublishReadinessGithubClient;
}) {
  const requiredPaths = ["package.json", ...PUBLISHING_BUNDLE_PATHS];
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: defaultBranch,
    paths: requiredPaths,
  });
  const missingPaths = PUBLISHING_BUNDLE_PATHS.filter(
    (path) => !Object.prototype.hasOwnProperty.call(files, path),
  );

  return {
    ready: missingPaths.length === 0,
    missingPaths,
  };
}
```

- [ ] **Step 4: Add action tests for verifying a merged PR**

Append to `src/features/repository-imports/actions.test.ts`:

```ts
import { verifyExistingAppPreparationAction } from "./actions";
import { verifyImportedPublishReadiness } from "./publish-readiness";

vi.mock("./publish-readiness", () => ({
  verifyImportedPublishReadiness: vi.fn(),
}));

it("marks a PR-prepared imported app committed after required files reach the default branch", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "req_123",
    userId: "user-123",
    repositoryOwner: "cedarville-it",
    repositoryName: "campus-dashboard",
    repositoryDefaultBranch: "main",
    repositoryImport: { id: "import_123" },
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  vi.mocked(verifyImportedPublishReadiness).mockResolvedValue({
    ready: true,
    missingPaths: [],
  });

  await verifyExistingAppPreparationAction("req_123", {
    github: {
      readRepositoryTextFiles: vi.fn(),
    },
  });

  expect(prisma.repositoryImport.update).toHaveBeenCalledWith({
    where: { id: "import_123" },
    data: {
      preparationStatus: "COMMITTED",
      preparationErrorSummary: null,
    },
  });
});
```

- [ ] **Step 5: Implement verify action**

In `src/features/repository-imports/actions.ts`, import:

```ts
import { verifyImportedPublishReadiness } from "./publish-readiness";
```

Add a dependency type:

```ts
type VerifyExistingAppDeps = {
  github?: Parameters<typeof verifyImportedPublishReadiness>[0]["github"];
};
```

Add the action:

```ts
export async function verifyExistingAppPreparationAction(
  requestId: string,
  deps: VerifyExistingAppDeps = {},
) {
  const userId = await resolveCurrentUserId();
  const appRequest = await prisma.appRequest.findFirst({
    where: { id: requestId, userId },
    include: { repositoryImport: true },
  });

  if (
    !appRequest?.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch ||
    !appRequest.repositoryImport
  ) {
    throw new Error("Imported app repository is not ready for verification.");
  }

  const github =
    deps.github ?? createDefaultPreparationGitHubClient(appRequest.repositoryOwner);
  const result = await verifyImportedPublishReadiness({
    owner: appRequest.repositoryOwner,
    name: appRequest.repositoryName,
    defaultBranch: appRequest.repositoryDefaultBranch,
    github,
  });

  if (!result.ready) {
    await prisma.repositoryImport.update({
      where: { id: appRequest.repositoryImport.id },
      data: {
        preparationStatus: "PULL_REQUEST_OPENED",
        preparationErrorSummary: `Missing publishing files on default branch: ${result.missingPaths.join(", ")}`,
      },
    });
    return;
  }

  await prisma.repositoryImport.update({
    where: { id: appRequest.repositoryImport.id },
    data: {
      preparationStatus: "COMMITTED",
      preparationErrorSummary: null,
    },
  });

  await recordAuditEvent("REPOSITORY_PREPARATION_VERIFIED", {
    requestId,
  });

  revalidatePath("/apps");
}
```

- [ ] **Step 6: Add failing publish action test**

In `src/features/publishing/actions.test.ts`, add a test that an imported app with an unprepared repo cannot queue:

```ts
  it("blocks publishing imported apps until preparation is committed", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_imported",
      userId: "user-123",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryImport: {
        preparationStatus: "PENDING_USER_CHOICE",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(publishToAzureAction("req_imported")).rejects.toThrow(
      "Imported app must have Azure publishing additions committed before publishing.",
    );
  });
```

- [ ] **Step 7: Run publish action tests to verify failure**

Run: `npm test -- src/features/publishing/actions.test.ts`

Expected: FAIL because the action does not inspect `repositoryImport`.

- [ ] **Step 8: Include repositoryImport in publish action load**

In `src/features/publishing/actions.ts`, update `loadOwnedAppRequest`:

```ts
const appRequest = await prisma.appRequest.findFirst({
  where: {
    id: requestId,
    userId,
  },
  include: {
    repositoryImport: true,
  },
});
```

- [ ] **Step 9: Add publish readiness guard**

In `queuePublishAttempt`, after the repository ready check, add:

```ts
if (
  appRequest.sourceOfTruth === "IMPORTED_REPOSITORY" &&
  appRequest.repositoryImport?.preparationStatus !== "COMMITTED"
) {
  throw new Error(
    "Imported app must have Azure publishing additions committed before publishing.",
  );
}
```

- [ ] **Step 10: Update `My Apps` to offer readiness verification**

In `src/app/apps/page.tsx`, import:

```ts
import {
  prepareExistingAppAction,
  verifyExistingAppPreparationAction,
} from "@/features/repository-imports/actions";
```

In `renderRepositoryImportPanel`, when `preparationStatus === "PULL_REQUEST_OPENED"`, render:

```tsx
<form action={verifyExistingAppPreparationAction.bind(null, request.id)}>
  <button type="submit">Verify PR Merge</button>
</form>
```

Add an assertion to `src/app/apps/page.test.tsx` for imported apps with `preparationStatus: "PULL_REQUEST_OPENED"`:

```tsx
expect(screen.getByRole("button", { name: /verify pr merge/i })).toBeInTheDocument();
```

- [ ] **Step 11: Update runtime test for imported template slug**

If `src/features/publishing/azure/runtime.test.ts` assumes template slug is always `web-app`, add a test case that imported apps still tag Azure resources with `imported-web-app`:

```ts
expect(arm.putWebApp).toHaveBeenCalledWith(
  expect.objectContaining({
    tags: expect.objectContaining({
      templateSlug: "imported-web-app",
    }),
  }),
);
```

- [ ] **Step 12: Run publish and readiness tests**

Run:

```bash
npm test -- \
  src/features/repository-imports/publish-readiness.test.ts \
  src/features/repository-imports/actions.test.ts \
  src/app/apps/page.test.tsx \
  src/features/publishing/actions.test.ts \
  src/features/publishing/azure/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/features/repository-imports/publish-readiness.ts src/features/repository-imports/publish-readiness.test.ts src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts src/app/apps/page.tsx src/app/apps/page.test.tsx src/features/publishing/actions.ts src/features/publishing/actions.test.ts src/features/publishing/azure/runtime.test.ts
git commit -m "feat: verify imported app publish readiness"
```

---

## Task 11: Preserve History When Importing External Repositories

**Files:**
- Create: `src/features/repository-imports/import-repository.ts`
- Create: `src/features/repository-imports/import-repository.test.ts`
- Modify: `src/features/repository-imports/actions.ts`
- Modify: `src/features/repository-imports/actions.test.ts`

- [ ] **Step 1: Write failing import tests**

Create `src/features/repository-imports/import-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { importRepositoryWithHistory } from "./import-repository";

describe("importRepositoryWithHistory", () => {
  it("clones source history and pushes it to the shared org target", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      createInstallationToken: vi.fn().mockResolvedValue("installation-token"),
    };

    await expect(
      importRepositoryWithHistory({
        source: {
          owner: "student-org",
          name: "campus-dashboard",
          url: "https://github.com/student-org/campus-dashboard",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
        },
        github,
        exec,
        tempRoot: "/tmp",
      }),
    ).resolves.toEqual({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    });
    expect(exec).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["clone", "--mirror"]),
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(exec).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["push", "--mirror"]),
      expect.objectContaining({ cwd: expect.stringContaining("campus-dashboard.git") }),
    );
  });
});
```

- [ ] **Step 2: Run import tests to verify they fail**

Run: `npm test -- src/features/repository-imports/import-repository.test.ts`

Expected: FAIL because `import-repository.ts` does not exist.

- [ ] **Step 3: Export installation token creation from GitHub client**

In `src/features/repositories/github-app.ts`, add a returned method:

```ts
    async createInstallationTokenForGit() {
      return createInstallationToken();
    },
```

Also add a test that calls `createInstallationTokenForGit` and expects `"installation-token"`.

- [ ] **Step 4: Implement import service**

Create `src/features/repository-imports/import-repository.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

type Exec = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<void>;

type ImportRepositoryInput = {
  source: {
    owner: string;
    name: string;
    url: string;
  };
  target: {
    owner: string;
    name: string;
  };
  github: {
    createRepository(input: {
      owner: string;
      name: string;
      visibility: "private" | "internal" | "public";
      files: Record<string, string>;
      defaultBranch: string;
      reuseIfAlreadyExists?: boolean;
    }): Promise<{
      owner: string;
      name: string;
      url: string;
      defaultBranch: string;
    }>;
    createInstallationTokenForGit(): Promise<string>;
  };
  visibility?: "private" | "internal" | "public";
  exec?: Exec;
  tempRoot?: string;
};

function defaultExec(command: string, args: string[], options: { cwd: string }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "ignore",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function authenticatedGitHubUrl(owner: string, name: string, token: string) {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${name}.git`;
}

export async function importRepositoryWithHistory({
  source,
  target,
  github,
  visibility = "private",
  exec = defaultExec,
  tempRoot = os.tmpdir(),
}: ImportRepositoryInput) {
  const tempDir = await mkdtemp(path.join(tempRoot, "cu-app-import-"));
  const mirrorDir = path.join(tempDir, `${source.name}.git`);

  try {
    const token = await github.createInstallationTokenForGit();
    const sourceRemote = authenticatedGitHubUrl(source.owner, source.name, token);
    const targetRepository = await github.createRepository({
      owner: target.owner,
      name: target.name,
      visibility,
      files: {},
      defaultBranch: "main",
      reuseIfAlreadyExists: false,
    });
    const targetRemote = authenticatedGitHubUrl(
      targetRepository.owner,
      targetRepository.name,
      token,
    );

    await exec("git", ["clone", "--mirror", sourceRemote, mirrorDir], {
      cwd: tempDir,
    });
    await exec("git", ["push", "--mirror", targetRemote], {
      cwd: mirrorDir,
    });

    return targetRepository;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Wire import into actions**

Update `addExistingAppAction` so non-shared repos call `importRepositoryWithHistory` before creating the app request. Inject `importRepositoryWithHistory` via deps in tests to avoid live GitHub/git work.

Use this import-status mapping:

```ts
const importStatus = isSharedOrgRepo ? "NOT_REQUIRED" : "SUCCEEDED";
```

If import throws, create the `AppRequest` and `RepositoryImport` with:

```ts
repositoryStatus: "FAILED",
importStatus: "FAILED",
importErrorSummary: message,
preparationStatus: "BLOCKED",
publishErrorSummary: message,
```

- [ ] **Step 6: Run import and action tests**

Run: `npm test -- src/features/repository-imports/import-repository.test.ts src/features/repository-imports/actions.test.ts src/features/repositories/github-app.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/repository-imports/import-repository.ts src/features/repository-imports/import-repository.test.ts src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts src/features/repositories/github-app.ts src/features/repositories/github-app.test.ts
git commit -m "feat: import external repositories with history"
```

---

## Task 12: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/portal/setup.md`
- Modify: `docs/readme.test.ts` if README link coverage requires it

- [ ] **Step 1: Update README**

Add a short section under `What It Does`:

```md
Users can also add an existing compatible GitHub app repository to the portal. If the repo is outside the configured Cedarville GitHub org, the portal imports it into the shared org while preserving history, scans it for the supported Node/Next Azure App Service path, and lets the user choose direct publishing additions or a review PR.
```

- [ ] **Step 2: Update setup docs**

In `docs/portal/setup.md`, add:

```md
### Add Existing App

The Add Existing App flow uses the same GitHub App configuration as managed repo creation. V1 accepts repositories the portal can read through the GitHub App or public GitHub access. Private repositories from personal accounts are not read through user OAuth in v1.

When a submitted repository is outside `GITHUB_DEFAULT_ORG`, the portal imports it into the default org using a short-lived GitHub App installation token and preserves git history. The GitHub App must have repository creation permission in the target org and read access to the source repository.

V1 supports root Node/Next apps that can be built with `npm run build` and run on Azure App Service with Node 24.
```

- [ ] **Step 3: Run documentation tests**

Run: `npm test -- docs/readme.test.ts`

Expected: PASS. If it fails because the docs link list changed, update `docs/readme.test.ts` with the exact expected link text and rerun.

- [ ] **Step 4: Run targeted feature tests**

Run:

```bash
npm test -- \
  src/features/repository-imports/repo-url.test.ts \
  src/features/repository-imports/target-name.test.ts \
  src/features/repository-imports/compatibility.test.ts \
  src/features/repository-imports/publishing-bundle.test.ts \
  src/features/repository-imports/prepare-repository.test.ts \
  src/features/repository-imports/publish-readiness.test.ts \
  src/features/repository-imports/import-repository.test.ts \
  src/features/repository-imports/actions.test.ts \
  src/app/apps/add/page.test.tsx \
  src/app/apps/page.test.tsx \
  src/features/publishing/actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Run production build**

Run: `npm run build`

Expected: build exits 0.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/portal/setup.md docs/readme.test.ts
git commit -m "docs: document existing app imports"
```

---

## Notes For Execution

- Keep the existing dirty main worktree untouched. Work only in `/Users/marchollins/projects/cu-app-portal/.worktrees/add-existing-app`.
- Use TDD per task: write the failing test, run it, implement, rerun.
- Prefer focused commits after each task.
- Do not weaken authorized download behavior or scoped deletion behavior.
- Do not introduce GitHub OAuth in this implementation.
- Do not make direct commits when compatibility reports conflicts.
- Do not overwrite existing publishing files in imported repositories.
