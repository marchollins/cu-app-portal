# Publishing Preflight And Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a universal publishing setup preflight and repair flow so imported and generated apps verify Azure, Microsoft Graph, and GitHub prerequisites before publishing, and can refresh stale portal-managed credentials without dispatching a deployment.

**Architecture:** Add durable setup status and check evidence to Prisma, then extract publishing setup from the Azure runtime into reusable preflight/repair services. Publishing actions become setup-aware: repair rewires Azure app settings, Entra redirect URI, GitHub OIDC federated credentials, and GitHub Actions secrets; publish and retry are shown only when setup is ready.

**Tech Stack:** Next.js App Router server actions, TypeScript, Prisma/PostgreSQL, Vitest, Testing Library, GitHub App REST API, Microsoft Graph REST API, Azure ARM client.

---

## Proposed File Structure

### Database

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260514160000_publishing_setup_status/migration.sql`

### Publishing Setup Domain

- Create: `src/features/publishing/setup/status.ts`
  - Classify provider/setup errors and map check results to setup status.
- Create: `src/features/publishing/setup/status.test.ts`
- Create: `src/features/publishing/setup/checks.ts`
  - Shared check keys, check result builders, and persistence helpers.
- Create: `src/features/publishing/setup/checks.test.ts`
- Create: `src/features/publishing/setup/service.ts`
  - Build context, run read-only preflight, repair setup, and record check evidence.
- Create: `src/features/publishing/setup/service.test.ts`
- Create: `src/features/publishing/setup/actions.ts`
  - Server actions for preflight and repair.
- Create: `src/features/publishing/setup/actions.test.ts`

### Provider Clients

- Modify: `src/features/repositories/github-app.ts`
  - Add `getActionsSecret` and `deleteActionsSecret`.
- Modify: `src/features/repositories/github-app.test.ts`
- Modify: `src/features/publishing/azure/graph-client.ts`
  - Add federated credential listing/deletion/replacement and redirect URI read checks.
- Modify: `src/features/publishing/azure/graph-client.test.ts`

### Publishing Runtime Integration

- Modify: `src/features/publishing/azure/runtime.ts`
  - Reuse setup service before workflow dispatch.
- Modify: `src/features/publishing/azure/runtime.test.ts`
- Modify: `src/features/publishing/run-publish-attempt.ts`
  - Persist setup-classified failures.
- Modify: `src/features/publishing/run-publish-attempt.test.ts`
- Modify: `src/features/publishing/actions.ts`
  - Gate retry/publish by setup status.
- Modify: `src/features/publishing/actions.test.ts`

### Import Flow Integration

- Modify: `src/features/repository-imports/actions.ts`
  - Run setup preflight after successful preparation/verification.
- Modify: `src/features/repository-imports/actions.test.ts`

### UI

- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`
- Modify: `src/app/globals.css`

### Documentation

- Modify: `README.md`
- Modify: `docs/portal/setup.md`

---

## Task 1: Add Publishing Setup Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260514160000_publishing_setup_status/migration.sql`

- [ ] **Step 1: Update Prisma schema**

Add the setup state fields to `AppRequest`, the check model, and enums.

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
  deploymentTriggerMode DeploymentTriggerMode @default(PORTAL_DISPATCH)
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
  publishingSetupStatus PublishingSetupStatus @default(NOT_CHECKED)
  publishingSetupCheckedAt DateTime?
  publishingSetupRepairedAt DateTime?
  publishingSetupErrorSummary String?
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
  publishSetupChecks PublishSetupCheck[]
}

model PublishSetupCheck {
  id           String                  @id @default(cuid())
  appRequestId String
  checkKey     String
  status       PublishSetupCheckStatus
  message      String
  metadata     Json
  checkedAt    DateTime
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @updatedAt
  appRequest   AppRequest              @relation(fields: [appRequestId], references: [id], onDelete: Cascade)

  @@index([appRequestId])
  @@unique([appRequestId, checkKey])
}

enum PublishingSetupStatus {
  NOT_CHECKED
  CHECKING
  READY
  NEEDS_REPAIR
  REPAIRING
  BLOCKED
}

enum PublishSetupCheckStatus {
  PASS
  WARN
  FAIL
  UNKNOWN
}
```

- [ ] **Step 2: Add SQL migration**

Create `prisma/migrations/20260514160000_publishing_setup_status/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "PublishingSetupStatus" AS ENUM ('NOT_CHECKED', 'CHECKING', 'READY', 'NEEDS_REPAIR', 'REPAIRING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PublishSetupCheckStatus" AS ENUM ('PASS', 'WARN', 'FAIL', 'UNKNOWN');

-- AlterTable
ALTER TABLE "AppRequest"
ADD COLUMN "publishingSetupStatus" "PublishingSetupStatus" NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN "publishingSetupCheckedAt" TIMESTAMP(3),
ADD COLUMN "publishingSetupRepairedAt" TIMESTAMP(3),
ADD COLUMN "publishingSetupErrorSummary" TEXT;

-- CreateTable
CREATE TABLE "PublishSetupCheck" (
    "id" TEXT NOT NULL,
    "appRequestId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "status" "PublishSetupCheckStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishSetupCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishSetupCheck_appRequestId_idx" ON "PublishSetupCheck"("appRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishSetupCheck_appRequestId_checkKey_key" ON "PublishSetupCheck"("appRequestId", "checkKey");

-- AddForeignKey
ALTER TABLE "PublishSetupCheck" ADD CONSTRAINT "PublishSetupCheck_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
npm run prisma:generate
```

Expected: exits 0 and regenerates the Prisma client.

- [ ] **Step 4: Run schema compile checks**

Run:

```bash
npm test -- prisma/seed.test.ts src/features/publishing/actions.test.ts
```

Expected: PASS. If TypeScript flags existing test fixtures for missing setup
fields, update generated-app fixtures to include:

```ts
publishingSetupStatus: "NOT_CHECKED",
publishingSetupErrorSummary: null,
publishSetupChecks: [],
```

and update ready-to-publish imported app fixtures to include:

```ts
publishingSetupStatus: "READY",
publishingSetupErrorSummary: null,
publishSetupChecks: [],
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260514160000_publishing_setup_status/migration.sql
git commit -m "feat: add publishing setup status schema"
```

---

## Task 2: Add Setup Status Classification

**Files:**
- Create: `src/features/publishing/setup/status.ts`
- Create: `src/features/publishing/setup/status.test.ts`

- [ ] **Step 1: Write failing classification tests**

Create `src/features/publishing/setup/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  classifyPublishingSetupError,
  summarizePublishingSetupChecks,
  type PublishingSetupCheckResult,
} from "./status";

describe("classifyPublishingSetupError", () => {
  it("classifies Graph Authorization_RequestDenied during stale credential repair as repairable", () => {
    const result = classifyPublishingSetupError({
      step: "github_federated_credential",
      error: new Error(
        'Microsoft Graph request failed: 403 {"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges to complete the operation."}}',
      ),
      repairWasReplacingPortalManagedCredential: true,
    });

    expect(result).toEqual({
      setupStatus: "NEEDS_REPAIR",
      summary: "Publishing credentials are out of date and need to be refreshed.",
      operatorDetail:
        "Update the portal's configured Azure and Entra credential values if needed, then run Repair Publishing Setup.",
      providerRequestId: null,
    });
  });

  it("classifies Graph Authorization_RequestDenied for app registration writes as blocked", () => {
    const result = classifyPublishingSetupError({
      step: "entra_redirect_uri",
      error: new Error(
        'Microsoft Graph request failed: 403 {"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges to complete the operation.","innerError":{"request-id":"graph-request-123"}}}',
      ),
    });

    expect(result).toEqual({
      setupStatus: "BLOCKED",
      summary: "Microsoft Graph permission is missing for Entra publishing setup.",
      operatorDetail:
        "Grant the portal runtime identity permission to update the shared app registration redirect URIs and the publisher application's federated identity credentials, then run Repair Publishing Setup.",
      providerRequestId: "graph-request-123",
    });
  });

  it("classifies non-Graph setup failures as repairable by default", () => {
    const result = classifyPublishingSetupError({
      step: "github_actions_secrets",
      error: new Error("GitHub API request failed: 404 Not Found"),
    });

    expect(result.setupStatus).toBe("NEEDS_REPAIR");
    expect(result.summary).toBe("Publishing setup needs to be repaired.");
  });
});

describe("summarizePublishingSetupChecks", () => {
  const baseChecks: PublishingSetupCheckResult[] = [
    {
      checkKey: "github_workflow_file",
      status: "PASS",
      message: "Deployment workflow exists.",
      metadata: {},
    },
  ];

  it("returns READY when all checks pass", () => {
    expect(summarizePublishingSetupChecks(baseChecks)).toEqual({
      setupStatus: "READY",
      errorSummary: null,
    });
  });

  it("returns NEEDS_REPAIR when any check fails repairably", () => {
    expect(
      summarizePublishingSetupChecks([
        ...baseChecks,
        {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
          metadata: { repairable: true },
        },
      ]),
    ).toEqual({
      setupStatus: "NEEDS_REPAIR",
      errorSummary: "Required GitHub Actions secrets are missing.",
    });
  });

  it("returns BLOCKED when any check fails non-repairably", () => {
    expect(
      summarizePublishingSetupChecks([
        ...baseChecks,
        {
          checkKey: "entra_redirect_uri",
          status: "FAIL",
          message: "Microsoft Graph permission is missing for Entra publishing setup.",
          metadata: { repairable: false },
        },
      ]),
    ).toEqual({
      setupStatus: "BLOCKED",
      errorSummary: "Microsoft Graph permission is missing for Entra publishing setup.",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/features/publishing/setup/status.test.ts
```

Expected: FAIL because `status.ts` does not exist.

- [ ] **Step 3: Implement status classification**

Create `src/features/publishing/setup/status.ts`:

```ts
export type PublishingSetupStatus =
  | "NOT_CHECKED"
  | "CHECKING"
  | "READY"
  | "NEEDS_REPAIR"
  | "REPAIRING"
  | "BLOCKED";

export type PublishSetupCheckStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";

export type PublishingSetupCheckKey =
  | "azure_resource_access"
  | "azure_app_settings"
  | "entra_redirect_uri"
  | "github_federated_credential"
  | "github_actions_secrets"
  | "github_workflow_file"
  | "github_workflow_dispatch";

export type PublishingSetupCheckResult = {
  checkKey: PublishingSetupCheckKey;
  status: PublishSetupCheckStatus;
  message: string;
  metadata: Record<string, unknown>;
};

export type PublishingSetupErrorClassification = {
  setupStatus: Extract<PublishingSetupStatus, "NEEDS_REPAIR" | "BLOCKED">;
  summary: string;
  operatorDetail: string;
  providerRequestId: string | null;
};

type ClassificationInput = {
  step: PublishingSetupCheckKey;
  error: unknown;
  repairWasReplacingPortalManagedCredential?: boolean;
};

const STALE_CREDENTIAL_SUMMARY =
  "Publishing credentials are out of date and need to be refreshed.";
const STALE_CREDENTIAL_DETAIL =
  "Update the portal's configured Azure and Entra credential values if needed, then run Repair Publishing Setup.";
const GRAPH_PERMISSION_SUMMARY =
  "Microsoft Graph permission is missing for Entra publishing setup.";
const GRAPH_PERMISSION_DETAIL =
  "Grant the portal runtime identity permission to update the shared app registration redirect URIs and the publisher application's federated identity credentials, then run Repair Publishing Setup.";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseGraphErrorPayload(message: string) {
  const jsonStart = message.indexOf("{");

  if (jsonStart === -1) {
    return null;
  }

  try {
    return JSON.parse(message.slice(jsonStart)) as {
      error?: {
        code?: string;
        innerError?: {
          "request-id"?: string;
          requestId?: string;
        };
      };
    };
  } catch {
    return null;
  }
}

function getProviderRequestId(payload: ReturnType<typeof parseGraphErrorPayload>) {
  return (
    payload?.error?.innerError?.["request-id"] ??
    payload?.error?.innerError?.requestId ??
    null
  );
}

function isGraphAuthorizationDenied(message: string) {
  const payload = parseGraphErrorPayload(message);

  return (
    message.includes("Microsoft Graph request failed: 403") &&
    (message.includes("Authorization_RequestDenied") ||
      payload?.error?.code === "Authorization_RequestDenied")
  );
}

export function classifyPublishingSetupError({
  step,
  error,
  repairWasReplacingPortalManagedCredential = false,
}: ClassificationInput): PublishingSetupErrorClassification {
  const message = errorMessage(error);
  const graphPayload = parseGraphErrorPayload(message);

  if (isGraphAuthorizationDenied(message)) {
    if (
      repairWasReplacingPortalManagedCredential ||
      step === "github_federated_credential" ||
      step === "github_actions_secrets"
    ) {
      return {
        setupStatus: "NEEDS_REPAIR",
        summary: STALE_CREDENTIAL_SUMMARY,
        operatorDetail: STALE_CREDENTIAL_DETAIL,
        providerRequestId: getProviderRequestId(graphPayload),
      };
    }

    return {
      setupStatus: "BLOCKED",
      summary: GRAPH_PERMISSION_SUMMARY,
      operatorDetail: GRAPH_PERMISSION_DETAIL,
      providerRequestId: getProviderRequestId(graphPayload),
    };
  }

  return {
    setupStatus: "NEEDS_REPAIR",
    summary: "Publishing setup needs to be repaired.",
    operatorDetail: "Run Repair Publishing Setup to refresh Azure, Entra, and GitHub publishing prerequisites.",
    providerRequestId: null,
  };
}

export function summarizePublishingSetupChecks(
  checks: PublishingSetupCheckResult[],
): {
  setupStatus: Extract<PublishingSetupStatus, "READY" | "NEEDS_REPAIR" | "BLOCKED">;
  errorSummary: string | null;
} {
  const failed = checks.filter((check) => check.status === "FAIL");
  const blocked = failed.find((check) => check.metadata.repairable === false);

  if (blocked) {
    return {
      setupStatus: "BLOCKED",
      errorSummary: blocked.message,
    };
  }

  if (failed.length > 0 || checks.some((check) => check.status === "UNKNOWN")) {
    return {
      setupStatus: "NEEDS_REPAIR",
      errorSummary:
        failed[0]?.message ??
        checks.find((check) => check.status === "UNKNOWN")?.message ??
        "Publishing setup needs to be repaired.",
    };
  }

  return {
    setupStatus: "READY",
    errorSummary: null,
  };
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/features/publishing/setup/status.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/publishing/setup/status.ts src/features/publishing/setup/status.test.ts
git commit -m "feat: classify publishing setup failures"
```

---

## Task 3: Add GitHub And Graph Repair Client Methods

**Files:**
- Modify: `src/features/repositories/github-app.ts`
- Modify: `src/features/repositories/github-app.test.ts`
- Modify: `src/features/publishing/azure/graph-client.ts`
- Modify: `src/features/publishing/azure/graph-client.test.ts`

- [ ] **Step 1: Write failing GitHub client tests**

Append to `src/features/repositories/github-app.test.ts`:

```ts
it("deletes an actions secret and treats missing secrets as already removed", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(json({ token: "installation-token" }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  const client = createGitHubAppClient({
    appId: "123",
    privateKey: TEST_PRIVATE_KEY,
    installationId: "456",
    fetchImpl,
  });

  await client.deleteActionsSecret({
    owner: "cedarville-it",
    name: "campus-dashboard",
    secretName: "AZURE_CLIENT_ID",
  });
  await client.deleteActionsSecret({
    owner: "cedarville-it",
    name: "campus-dashboard",
    secretName: "AZURE_CLIENT_ID",
  });

  expect(fetchImpl).toHaveBeenCalledWith(
    "https://api.github.com/repos/cedarville-it/campus-dashboard/actions/secrets/AZURE_CLIENT_ID",
    expect.objectContaining({ method: "DELETE" }),
  );
});

it("checks whether an actions secret exists by name", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(json({ token: "installation-token" }))
    .mockResolvedValueOnce(json({ name: "AZURE_CLIENT_ID" }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  const client = createGitHubAppClient({
    appId: "123",
    privateKey: TEST_PRIVATE_KEY,
    installationId: "456",
    fetchImpl,
  });

  await expect(
    client.getActionsSecret({
      owner: "cedarville-it",
      name: "campus-dashboard",
      secretName: "AZURE_CLIENT_ID",
    }),
  ).resolves.toEqual({ exists: true });
  await expect(
    client.getActionsSecret({
      owner: "cedarville-it",
      name: "campus-dashboard",
      secretName: "AZURE_TENANT_ID",
    }),
  ).resolves.toEqual({ exists: false });
});
```

Use the existing `json` response helper and `TEST_PRIVATE_KEY` constant already
defined in `src/features/repositories/github-app.test.ts`. If the constant is
currently local to another `describe` block, move it to module scope before
adding these tests.

- [ ] **Step 2: Implement GitHub methods**

In `src/features/repositories/github-app.ts`, add input types near `SetActionsSecretInput`:

```ts
type GetActionsSecretInput = {
  owner: string;
  name: string;
  secretName: string;
};

type DeleteActionsSecretInput = {
  owner: string;
  name: string;
  secretName: string;
};
```

Add response type near `GitHubActionsPublicKeyResponse`:

```ts
type GitHubActionsSecretResponse = {
  name: string;
};
```

Add methods next to `setActionsSecret` in the returned client object:

```ts
async getActionsSecret({ owner, name, secretName }: GetActionsSecretInput) {
  const headers = await withInstallationHeaders();
  const response = await fetchImpl(
    `https://api.github.com/repos/${githubPathSegment(owner)}/${githubPathSegment(name)}/actions/secrets/${githubPathSegment(secretName)}`,
    {
      method: "GET",
      headers,
    },
  );

  if (response.status === 404) {
    return { exists: false as const };
  }

  await readJson<GitHubActionsSecretResponse>(response);

  return { exists: true as const };
},
async deleteActionsSecret({
  owner,
  name,
  secretName,
}: DeleteActionsSecretInput) {
  const headers = await withInstallationHeaders();
  const response = await fetchImpl(
    `https://api.github.com/repos/${githubPathSegment(owner)}/${githubPathSegment(name)}/actions/secrets/${githubPathSegment(secretName)}`,
    {
      method: "DELETE",
      headers,
    },
  );

  await requireGitHubStatus(response, [204, 404]);
},
```

- [ ] **Step 3: Write failing Graph client tests**

Append to `src/features/publishing/azure/graph-client.test.ts`:

```ts
it("replaces a federated credential by name", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(
      json({
        value: [{ id: "credential-id", name: "github-campus-dashboard" }],
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(json({ id: "new-credential-id" }, { status: 201 }));
  const client = createMicrosoftGraphClient({
    tokenProvider: async () => "token",
    fetchImpl,
  });

  await client.replaceFederatedCredential({
    applicationAppId: "client-id",
    name: "github-campus-dashboard",
    repository: "cedarville-it/campus-dashboard",
    branch: "main",
  });

  expect(fetchImpl).toHaveBeenNthCalledWith(
    2,
    "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials/credential-id",
    expect.objectContaining({ method: "DELETE" }),
  );
  expect(fetchImpl).toHaveBeenNthCalledWith(
    3,
    "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials",
    expect.objectContaining({ method: "POST" }),
  );
});

it("checks whether a redirect uri exists", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(
      json({
        web: {
          redirectUris: [
            "https://app-campus-dashboard.azurewebsites.net/api/auth/callback/microsoft-entra-id",
          ],
        },
      }),
    );
  const client = createMicrosoftGraphClient({
    tokenProvider: async () => "token",
    fetchImpl,
  });

  await expect(
    client.hasRedirectUri({
      applicationObjectId: "app-object-id",
      redirectUri:
        "https://app-campus-dashboard.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    }),
  ).resolves.toEqual({ exists: true });
});
```

- [ ] **Step 4: Implement Graph methods**

In `src/features/publishing/azure/graph-client.ts`, add helper functions inside `createMicrosoftGraphClient`:

```ts
function federatedCredentialsUrl(applicationAppId: string) {
  return `https://graph.microsoft.com/v1.0/applications(appId='${applicationAppId}')/federatedIdentityCredentials`;
}

function federatedCredentialUrl(applicationAppId: string, credentialId: string) {
  return `${federatedCredentialsUrl(applicationAppId)}/${credentialId}`;
}

function federatedCredentialPayload({
  name,
  repository,
  branch,
}: {
  name: string;
  repository: string;
  branch: string;
}) {
  return {
    name,
    issuer: "https://token.actions.githubusercontent.com",
    subject: `repo:${repository}:ref:refs/heads/${branch}`,
    audiences: ["api://AzureADTokenExchange"],
  };
}
```

Refactor `ensureFederatedCredential` to call `federatedCredentialsUrl()` and `federatedCredentialPayload()`.

Add these local functions before the returned object:

```ts
async function listFederatedCredentials({
  applicationAppId,
}: {
  applicationAppId: string;
}) {
  const data = await readJson<{
    value?: Array<{ id: string; name: string; subject?: string }>;
  }>(
    await fetchImpl(federatedCredentialsUrl(applicationAppId), {
      method: "GET",
      headers: await headers(),
    }),
  );

  return data.value ?? [];
}

async function deleteFederatedCredential({
  applicationAppId,
  credentialId,
}: {
  applicationAppId: string;
  credentialId: string;
}) {
  const response = await fetchImpl(
    federatedCredentialUrl(applicationAppId, credentialId),
    {
      method: "DELETE",
      headers: await headers(),
    },
  );

  if (response.status !== 204 && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
  }
}

async function replaceFederatedCredential({
  applicationAppId,
  name,
  repository,
  branch,
}: {
  applicationAppId: string;
  name: string;
  repository: string;
  branch: string;
}) {
  const credentials = await listFederatedCredentials({ applicationAppId });
  const existing = credentials.find((credential) => credential.name === name);

  if (existing) {
    await deleteFederatedCredential({
      applicationAppId,
      credentialId: existing.id,
    });
  }

  await readJson<unknown>(
    await fetchImpl(federatedCredentialsUrl(applicationAppId), {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify(
        federatedCredentialPayload({ name, repository, branch }),
      ),
    }),
  );
}

async function hasRedirectUri({
  applicationObjectId,
  redirectUri,
}: {
  applicationObjectId: string;
  redirectUri: string;
}) {
  const application = await readJson<{ web?: { redirectUris?: string[] } }>(
    await fetchImpl(
      `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
      { method: "GET", headers: await headers() },
    ),
  );

  return { exists: Boolean(application.web?.redirectUris?.includes(redirectUri)) };
}
```

Expose those functions from the returned object:

```ts
listFederatedCredentials,
deleteFederatedCredential,
replaceFederatedCredential,
hasRedirectUri,
```

Keep all existing returned methods and add the four properties above to the same
object.

- [ ] **Step 5: Run provider tests**

Run:

```bash
npm test -- src/features/repositories/github-app.test.ts src/features/publishing/azure/graph-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/repositories/github-app.ts src/features/repositories/github-app.test.ts src/features/publishing/azure/graph-client.ts src/features/publishing/azure/graph-client.test.ts
git commit -m "feat: add publishing setup repair client methods"
```

---

## Task 4: Persist Publishing Setup Checks

**Files:**
- Create: `src/features/publishing/setup/checks.ts`
- Create: `src/features/publishing/setup/checks.test.ts`

- [ ] **Step 1: Write failing check persistence tests**

Create `src/features/publishing/setup/checks.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { persistPublishingSetupChecks } from "./checks";

vi.mock("@/lib/db", () => ({
  prisma: {
    publishSetupCheck: {
      upsert: vi.fn(),
    },
  },
}));

describe("persistPublishingSetupChecks", () => {
  beforeEach(() => {
    vi.mocked(prisma.publishSetupCheck.upsert).mockReset();
  });

  it("upserts check evidence without secret values", async () => {
    const checkedAt = new Date("2026-05-14T16:00:00.000Z");

    await persistPublishingSetupChecks({
      appRequestId: "req_123",
      checkedAt,
      checks: [
        {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
          metadata: {
            repairable: true,
            secretNames: ["AZURE_CLIENT_ID"],
            secretValue: "must-not-persist",
            token: "must-not-persist",
          },
        },
      ],
    });

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_checkKey: {
          appRequestId: "req_123",
          checkKey: "github_actions_secrets",
        },
      },
      create: {
        appRequestId: "req_123",
        checkKey: "github_actions_secrets",
        status: "FAIL",
        message: "Required GitHub Actions secrets are missing.",
        metadata: { repairable: true, secretNames: ["AZURE_CLIENT_ID"] },
        checkedAt,
      },
      update: {
        status: "FAIL",
        message: "Required GitHub Actions secrets are missing.",
        metadata: { repairable: true, secretNames: ["AZURE_CLIENT_ID"] },
        checkedAt,
      },
    });
  });
});
```

- [ ] **Step 2: Implement check persistence**

Create `src/features/publishing/setup/checks.ts`:

```ts
import { prisma } from "@/lib/db";
import type { PublishingSetupCheckResult } from "./status";

const SECRET_METADATA_KEYS = new Set([
  "secret",
  "secretValue",
  "token",
  "privateKey",
  "connectionString",
  "databaseUrl",
]);

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue);
  }

  if (value && typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !SECRET_METADATA_KEYS.has(key))
      .map(([key, value]) => [key, sanitizeMetadataValue(value)]),
  );
}

export async function persistPublishingSetupChecks({
  appRequestId,
  checks,
  checkedAt,
}: {
  appRequestId: string;
  checks: PublishingSetupCheckResult[];
  checkedAt: Date;
}) {
  await Promise.all(
    checks.map((check) =>
      prisma.publishSetupCheck.upsert({
        where: {
          appRequestId_checkKey: {
            appRequestId,
            checkKey: check.checkKey,
          },
        },
        create: {
          appRequestId,
          checkKey: check.checkKey,
          status: check.status,
          message: check.message,
          metadata: sanitizeMetadata(check.metadata),
          checkedAt,
        },
        update: {
          status: check.status,
          message: check.message,
          metadata: sanitizeMetadata(check.metadata),
          checkedAt,
        },
      }),
    ),
  );
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm test -- src/features/publishing/setup/checks.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/publishing/setup/checks.ts src/features/publishing/setup/checks.test.ts
git commit -m "feat: persist publishing setup checks"
```

---

## Task 5: Add Preflight And Repair Service

**Files:**
- Create: `src/features/publishing/setup/service.ts`
- Create: `src/features/publishing/setup/service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/features/publishing/setup/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  preflightPublishingSetup,
  repairPublishingSetup,
} from "./service";

const appRequest = {
  id: "req_123",
  appName: "Campus Dashboard",
  userId: "user-123",
  supportReference: "SUP-123",
  repositoryOwner: "cedarville-it",
  repositoryName: "campus-dashboard",
  repositoryDefaultBranch: "main",
  repositoryStatus: "READY",
  deploymentTarget: "Azure App Service",
  primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
  template: { slug: "imported-web-app" },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    publishSetupCheck: {
      upsert: vi.fn(),
    },
  },
}));

function createDeps(overrides: Partial<Parameters<typeof preflightPublishingSetup>[1]> = {}) {
  return {
    config: {
      resourceGroup: "rg-cu-apps-published",
      appServicePlan: "asp-cu-apps-published",
      postgresServer: "psql-cu-apps-published",
      postgresAdminUser: "portaladmin",
      postgresAdminPassword: "secret",
      location: "eastus",
      runtimeStack: "NODE|24-lts" as const,
      azureClientId: "azure-client-id",
      azureTenantId: "tenant-id",
      azureSubscriptionId: "sub-id",
      authSecret: "auth-secret",
      entraClientId: "entra-client-id",
      entraClientSecret: "entra-client-secret",
      entraIssuer: "https://login.microsoftonline.com/tenant/v2.0",
      entraAppObjectId: "entra-object-id",
    },
    arm: {
      appServicePlanId: vi.fn(() => "/plans/asp-cu-apps-published"),
      putPostgresDatabase: vi.fn(),
      putWebApp: vi.fn().mockResolvedValue({
        properties: { defaultHostName: "app-campus-dashboard.azurewebsites.net" },
      }),
      putAppSettings: vi.fn(),
    },
    graph: {
      hasRedirectUri: vi.fn().mockResolvedValue({ exists: true }),
      ensureRedirectUri: vi.fn(),
      listFederatedCredentials: vi.fn().mockResolvedValue([
        {
          id: "credential-id",
          name: "github-campus-dashboard-req_123",
          subject: "repo:cedarville-it/campus-dashboard:ref:refs/heads/main",
        },
      ]),
      replaceFederatedCredential: vi.fn(),
    },
    github: {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ".github/workflows/deploy-azure-app-service.yml": "name: Deploy",
      }),
      getActionsSecret: vi.fn().mockResolvedValue({ exists: true }),
      deleteActionsSecret: vi.fn(),
      setActionsSecret: vi.fn(),
    },
    ...overrides,
  };
}

describe("publishing setup service", () => {
  beforeEach(() => {
    vi.mocked(prisma.appRequest.findUnique).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.publishSetupCheck.upsert).mockReset();
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(
      appRequest as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>,
    );
  });

  it("marks setup ready when preflight checks pass", async () => {
    await preflightPublishingSetup("req_123", createDeps());

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "READY",
        publishingSetupErrorSummary: null,
      }),
    });
  });

  it("marks setup needs repair when a required secret is missing", async () => {
    const deps = createDeps({
      github: {
        ...createDeps().github,
        getActionsSecret: vi.fn().mockResolvedValue({ exists: false }),
      },
    });

    await preflightPublishingSetup("req_123", deps);

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary: "Required GitHub Actions secrets are missing.",
      }),
    });
  });

  it("repairs setup without dispatching a deployment workflow", async () => {
    const deps = createDeps();

    await repairPublishingSetup("req_123", deps);

    expect(deps.github.deleteActionsSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "AZURE_CLIENT_ID" }),
    );
    expect(deps.github.setActionsSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "AZURE_CLIENT_ID" }),
    );
    expect(deps.graph.replaceFederatedCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationAppId: "azure-client-id",
        repository: "cedarville-it/campus-dashboard",
        branch: "main",
      }),
    );
    expect("dispatchWorkflow" in deps.github).toBe(false);
    expect(prisma.appRequest.update).toHaveBeenLastCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "READY",
        publishingSetupErrorSummary: null,
      }),
    });
  });
});
```

- [ ] **Step 2: Implement service**

Create `src/features/publishing/setup/service.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { DefaultAzureCredential } from "@azure/identity";
import { prisma } from "@/lib/db";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createAzureArmClient } from "@/features/publishing/azure/arm-client";
import { loadAzurePublishConfig } from "@/features/publishing/azure/config";
import { buildPublishTargetNames } from "@/features/publishing/azure/naming";
import type { AzurePublishConfig } from "@/features/publishing/azure/config";
import { createMicrosoftGraphClient } from "@/features/publishing/azure/graph-client";
import { persistPublishingSetupChecks } from "./checks";
import {
  classifyPublishingSetupError,
  summarizePublishingSetupChecks,
  type PublishingSetupCheckResult,
} from "./status";

const REQUIRED_SECRETS = [
  "AZURE_CLIENT_ID",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_WEBAPP_NAME",
] as const;
const WORKFLOW_PATH = ".github/workflows/deploy-azure-app-service.yml";
const ENTRA_CALLBACK_PATH = "/api/auth/callback/microsoft-entra-id";

type SetupAppRequest = {
  id: string;
  appName: string;
  userId: string;
  supportReference: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
  repositoryDefaultBranch: string | null;
  repositoryStatus: string;
  primaryPublishUrl: string | null;
  template: { slug: string };
};

type SetupDeps = {
  config: AzurePublishConfig;
  prisma?: Pick<PrismaClient, "appRequest" | "publishSetupCheck">;
  arm: {
    appServicePlanId(resourceGroup: string, name: string): string;
    putWebApp(input: {
      resourceGroup: string;
      name: string;
      location: string;
      appServicePlanId: string;
      runtimeStack: "NODE|24-lts";
      startupCommand: string;
      tags: Record<string, string>;
    }): Promise<{ properties?: { defaultHostName?: string } }>;
    putAppSettings(input: {
      resourceGroup: string;
      name: string;
      settings: Record<string, string>;
    }): Promise<void>;
    putPostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }): Promise<void>;
  };
  graph: {
    hasRedirectUri(input: {
      applicationObjectId: string;
      redirectUri: string;
    }): Promise<{ exists: boolean }>;
    ensureRedirectUri(input: {
      applicationObjectId: string;
      redirectUri: string;
    }): Promise<void>;
    listFederatedCredentials(input: {
      applicationAppId: string;
    }): Promise<Array<{ id: string; name: string; subject?: string }>>;
    replaceFederatedCredential(input: {
      applicationAppId: string;
      name: string;
      repository: string;
      branch: string;
    }): Promise<void>;
  };
  github: {
    readRepositoryTextFiles(input: {
      owner: string;
      name: string;
      ref: string;
      paths: string[];
    }): Promise<Record<string, string>>;
    getActionsSecret(input: {
      owner: string;
      name: string;
      secretName: string;
    }): Promise<{ exists: boolean }>;
    deleteActionsSecret(input: {
      owner: string;
      name: string;
      secretName: string;
    }): Promise<void>;
    setActionsSecret(input: {
      owner: string;
      name: string;
      secretName: string;
      secretValue: string;
    }): Promise<void>;
  };
};

function createAzureTokenProvider(scope: string) {
  const credential = new DefaultAzureCredential();

  return async () => {
    const token = await credential.getToken(scope);

    if (!token?.token) {
      throw new Error(`Azure token was not available for scope ${scope}.`);
    }

    return token.token;
  };
}

function createDefaultSetupDeps(): SetupDeps {
  const config = loadAzurePublishConfig();
  const githubConfig = loadGitHubAppConfig();
  const installationId =
    githubConfig.installationIdsByOrg[githubConfig.defaultOrg];

  if (!installationId) {
    throw new Error(
      `No GitHub App installation is configured for org "${githubConfig.defaultOrg}".`,
    );
  }

  return {
    config,
    arm: createAzureArmClient({
      subscriptionId: config.azureSubscriptionId,
      tokenProvider: createAzureTokenProvider(
        "https://management.azure.com/.default",
      ),
    }),
    graph: createMicrosoftGraphClient({
      tokenProvider: createAzureTokenProvider(
        "https://graph.microsoft.com/.default",
      ),
    }),
    github: createGitHubAppClient({
      appId: githubConfig.appId,
      privateKey: githubConfig.privateKey,
      installationId,
    }),
  };
}

async function loadSetupRequest(appRequestId: string, db = prisma) {
  const appRequest = await db.appRequest.findUnique({
    where: { id: appRequestId },
    include: { template: true },
  });

  if (
    !appRequest?.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch ||
    appRequest.repositoryStatus !== "READY"
  ) {
    throw new Error("Managed repository is not ready for publishing setup.");
  }

  return appRequest as SetupAppRequest;
}

function buildSetupNames(appRequest: SetupAppRequest) {
  return buildPublishTargetNames({
    requestId: appRequest.id,
    appName: appRequest.appName,
  });
}

function buildDatabaseUrl(config: AzurePublishConfig, databaseName: string) {
  const password = encodeURIComponent(config.postgresAdminPassword);

  return `postgresql://${config.postgresAdminUser}:${password}@${config.postgresServer}.postgres.database.azure.com:5432/${databaseName}?sslmode=require`;
}

function buildSecretValues(config: AzurePublishConfig, webAppName: string) {
  return {
    AZURE_CLIENT_ID: config.azureClientId,
    AZURE_TENANT_ID: config.azureTenantId,
    AZURE_SUBSCRIPTION_ID: config.azureSubscriptionId,
    AZURE_WEBAPP_NAME: webAppName,
  };
}

function federatedCredentialName(appRequest: SetupAppRequest) {
  return buildSetupNames(appRequest).federatedCredentialName;
}

function primaryPublishUrl(appRequest: SetupAppRequest) {
  return appRequest.primaryPublishUrl ?? buildSetupNames(appRequest).primaryPublishUrl;
}

async function recordSetupState({
  appRequestId,
  checks,
  db = prisma,
}: {
  appRequestId: string;
  checks: PublishingSetupCheckResult[];
  db?: Pick<PrismaClient, "appRequest" | "publishSetupCheck">;
}) {
  const checkedAt = new Date();
  const summary = summarizePublishingSetupChecks(checks);

  await persistPublishingSetupChecks({
    appRequestId,
    checks,
    checkedAt,
  });
  await db.appRequest.update({
    where: { id: appRequestId },
    data: {
      publishingSetupStatus: summary.setupStatus,
      publishingSetupCheckedAt: checkedAt,
      publishingSetupErrorSummary: summary.errorSummary,
    },
  });

  return summary;
}

export async function preflightPublishingSetup(
  appRequestId: string,
  providedDeps?: SetupDeps,
) {
  const deps = providedDeps ?? createDefaultSetupDeps();
  const db = deps.prisma ?? prisma;
  const appRequest = await loadSetupRequest(appRequestId, db);
  const owner = appRequest.repositoryOwner as string;
  const name = appRequest.repositoryName as string;
  const branch = appRequest.repositoryDefaultBranch as string;
  const names = buildSetupNames(appRequest);
  const redirectUri = `${primaryPublishUrl(appRequest)}${ENTRA_CALLBACK_PATH}`;
  const checks: PublishingSetupCheckResult[] = [];

  const files = await deps.github.readRepositoryTextFiles({
    owner,
    name,
    ref: branch,
    paths: [WORKFLOW_PATH],
  });
  checks.push(
    files[WORKFLOW_PATH]
      ? {
          checkKey: "github_workflow_file",
          status: "PASS",
          message: "Deployment workflow exists.",
          metadata: { path: WORKFLOW_PATH },
        }
      : {
          checkKey: "github_workflow_file",
          status: "FAIL",
          message: "Deployment workflow is missing.",
          metadata: { path: WORKFLOW_PATH, repairable: false },
        },
  );

  const secretResults = await Promise.all(
    REQUIRED_SECRETS.map((secretName) =>
      deps.github.getActionsSecret({ owner, name, secretName }),
    ),
  );
  const missingSecrets = REQUIRED_SECRETS.filter(
    (_secretName, index) => !secretResults[index].exists,
  );
  checks.push(
    missingSecrets.length === 0
      ? {
          checkKey: "github_actions_secrets",
          status: "PASS",
          message: "Required GitHub Actions secrets are present.",
          metadata: { secretNames: [...REQUIRED_SECRETS] },
        }
      : {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
          metadata: { secretNames: missingSecrets, repairable: true },
        },
  );

  const redirect = await deps.graph.hasRedirectUri({
    applicationObjectId: deps.config.entraAppObjectId,
    redirectUri,
  });
  checks.push(
    redirect.exists
      ? {
          checkKey: "entra_redirect_uri",
          status: "PASS",
          message: "Entra redirect URI is registered.",
          metadata: { redirectUri },
        }
      : {
          checkKey: "entra_redirect_uri",
          status: "FAIL",
          message: "Entra redirect URI is missing.",
          metadata: { redirectUri, repairable: true },
        },
  );

  const credentials = await deps.graph.listFederatedCredentials({
    applicationAppId: deps.config.azureClientId,
  });
  const expectedSubject = `repo:${owner}/${name}:ref:refs/heads/${branch}`;
  const credential = credentials.find(
    (item) =>
      item.name === federatedCredentialName(appRequest) &&
      item.subject === expectedSubject,
  );
  checks.push(
    credential
      ? {
          checkKey: "github_federated_credential",
          status: "PASS",
          message: "GitHub OIDC federated credential is present.",
          metadata: { credentialName: federatedCredentialName(appRequest) },
        }
      : {
          checkKey: "github_federated_credential",
          status: "FAIL",
          message: "GitHub OIDC federated credential is missing or stale.",
          metadata: {
            credentialName: federatedCredentialName(appRequest),
            repairable: true,
          },
        },
  );

  checks.push({
    checkKey: "azure_resource_access",
    status: "PASS",
    message: "Azure target names can be derived.",
    metadata: {
      resourceGroup: deps.config.resourceGroup,
      webAppName: names.webAppName,
      databaseName: names.databaseName,
    },
  });

  checks.push({
    checkKey: "azure_app_settings",
    status: "WARN",
    message: "Azure App Service settings are refreshed during repair.",
    metadata: { repairable: true },
  });

  checks.push({
    checkKey: "github_workflow_dispatch",
    status: "WARN",
    message: "Workflow dispatch readiness is verified during publish.",
    metadata: { repairable: true },
  });

  return recordSetupState({ appRequestId, checks, db });
}

export async function repairPublishingSetup(
  appRequestId: string,
  providedDeps?: SetupDeps,
) {
  const deps = providedDeps ?? createDefaultSetupDeps();
  const db = deps.prisma ?? prisma;
  const appRequest = await loadSetupRequest(appRequestId, db);
  const owner = appRequest.repositoryOwner as string;
  const name = appRequest.repositoryName as string;
  const branch = appRequest.repositoryDefaultBranch as string;
  const names = buildSetupNames(appRequest);
  const publishUrl = primaryPublishUrl(appRequest);

  await db.appRequest.update({
    where: { id: appRequestId },
    data: {
      publishingSetupStatus: "REPAIRING",
      publishingSetupErrorSummary: null,
    },
  });

  try {
    await deps.arm.putPostgresDatabase({
      resourceGroup: deps.config.resourceGroup,
      serverName: deps.config.postgresServer,
      databaseName: names.databaseName,
    });
    const webApp = await deps.arm.putWebApp({
      resourceGroup: deps.config.resourceGroup,
      name: names.webAppName,
      location: deps.config.location,
      appServicePlanId: deps.arm.appServicePlanId(
        deps.config.resourceGroup,
        deps.config.appServicePlan,
      ),
      runtimeStack: deps.config.runtimeStack,
      startupCommand: "npm start",
      tags: {
        "app-portal-request-id": appRequest.id,
        "app-portal-template": appRequest.template.slug,
      },
    });
    const azureDefaultHostName =
      webApp.properties?.defaultHostName ?? names.azureDefaultHostName;
    const effectivePublishUrl = `https://${azureDefaultHostName}`;

    await deps.arm.putAppSettings({
      resourceGroup: deps.config.resourceGroup,
      name: names.webAppName,
      settings: {
        DATABASE_URL: buildDatabaseUrl(deps.config, names.databaseName),
        AUTH_URL: effectivePublishUrl,
        NEXTAUTH_URL: effectivePublishUrl,
        AUTH_SECRET: deps.config.authSecret,
        AUTH_MICROSOFT_ENTRA_ID_ID: deps.config.entraClientId,
        AUTH_MICROSOFT_ENTRA_ID_SECRET: deps.config.entraClientSecret,
        AUTH_MICROSOFT_ENTRA_ID_ISSUER: deps.config.entraIssuer,
        NODE_ENV: "production",
        SCM_DO_BUILD_DURING_DEPLOYMENT: "false",
        ENABLE_ORYX_BUILD: "false",
        WEBSITE_RUN_FROM_PACKAGE: "1",
      },
    });

    await deps.graph.ensureRedirectUri({
      applicationObjectId: deps.config.entraAppObjectId,
      redirectUri: `${effectivePublishUrl}${ENTRA_CALLBACK_PATH}`,
    });
    await deps.graph.replaceFederatedCredential({
      applicationAppId: deps.config.azureClientId,
      name: federatedCredentialName(appRequest),
      repository: `${owner}/${name}`,
      branch,
    });

    const secretValues = buildSecretValues(deps.config, names.webAppName);
    for (const secretName of REQUIRED_SECRETS) {
      await deps.github.deleteActionsSecret({ owner, name, secretName });
      await deps.github.setActionsSecret({
        owner,
        name,
        secretName,
        secretValue: secretValues[secretName],
      });
    }

    await db.appRequest.update({
      where: { id: appRequestId },
      data: {
        azureResourceGroup: deps.config.resourceGroup,
        azureAppServicePlan: deps.config.appServicePlan,
        azureWebAppName: names.webAppName,
        azurePostgresServer: deps.config.postgresServer,
        azureDatabaseName: names.databaseName,
        azureDefaultHostName,
        primaryPublishUrl: publishUrl ?? effectivePublishUrl,
        publishingSetupRepairedAt: new Date(),
      },
    });

    return preflightPublishingSetup(appRequestId, deps);
  } catch (error) {
    const classification = classifyPublishingSetupError({
      step: "github_federated_credential",
      error,
      repairWasReplacingPortalManagedCredential: true,
    });

    await db.appRequest.update({
      where: { id: appRequestId },
      data: {
        publishingSetupStatus: classification.setupStatus,
        publishingSetupErrorSummary: classification.summary,
      },
    });

    throw error;
  }
}
```

This first slice records `azure_app_settings` and `github_workflow_dispatch` as
`WARN` checks because repair refreshes settings and publish still performs the
bounded workflow dispatch proof.

- [ ] **Step 3: Run service tests**

Run:

```bash
npm test -- src/features/publishing/setup/service.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/publishing/setup/service.ts src/features/publishing/setup/service.test.ts
git commit -m "feat: add publishing setup preflight and repair service"
```

---

## Task 6: Add Repair Server Actions

**Files:**
- Create: `src/features/publishing/setup/actions.ts`
- Create: `src/features/publishing/setup/actions.test.ts`

- [ ] **Step 1: Write failing action tests**

Create `src/features/publishing/setup/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";
import { repairPublishingSetupAction } from "./actions";
import { repairPublishingSetup } from "./service";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("./service", () => ({
  repairPublishingSetup: vi.fn(),
}));

describe("publishing setup actions", () => {
  beforeEach(() => {
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(repairPublishingSetup).mockReset();
    vi.mocked(revalidatePath).mockReset();
  });

  it("repairs setup for an app owned by the current user", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      userId: "user-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await repairPublishingSetupAction("req_123");

    expect(repairPublishingSetup).toHaveBeenCalledWith("req_123");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/req_123");
  });

  it("rejects repair for unauthorized app requests", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(repairPublishingSetupAction("req_123")).rejects.toThrow(
      "App request not found.",
    );
    expect(repairPublishingSetup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement actions**

Create `src/features/publishing/setup/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";
import { repairPublishingSetup } from "./service";

async function loadOwnedAppRequest(requestId: string) {
  const userId = await resolveCurrentUserId();
  const appRequest = await prisma.appRequest.findFirst({
    where: {
      id: requestId,
      userId,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

function revalidateSetupViews(requestId: string) {
  revalidatePath("/apps");
  revalidatePath(`/download/${requestId}`);
}

export async function repairPublishingSetupAction(requestId: string) {
  await loadOwnedAppRequest(requestId);
  await repairPublishingSetup(requestId);
  revalidateSetupViews(requestId);
}
```

The production default dependency factory was added in Task 5, so
`repairPublishingSetup(requestId)` is valid without explicit dependencies in the
server action.

- [ ] **Step 3: Run action tests**

Run:

```bash
npm test -- src/features/publishing/setup/actions.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/publishing/setup/actions.ts src/features/publishing/setup/actions.test.ts
git commit -m "feat: add publishing setup repair action"
```

---

## Task 7: Gate Publish And Retry By Setup Readiness

**Files:**
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/run-publish-attempt.ts`
- Modify: `src/features/publishing/run-publish-attempt.test.ts`

- [ ] **Step 1: Add failing publish action tests**

Append to `src/features/publishing/actions.test.ts`:

```ts
it("rejects publish requests when publishing setup needs repair", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "request-123",
    userId: "user-123",
    repositoryStatus: "READY",
    publishStatus: "NOT_STARTED",
    publishingSetupStatus: "NEEDS_REPAIR",
    sourceOfTruth: "PORTAL_MANAGED_REPO",
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

  await expect(publishToAzureAction("request-123")).rejects.toThrow(
    "Publishing setup must be repaired before publishing.",
  );
  expect(prisma.publishAttempt.create).not.toHaveBeenCalled();
});

it("allows publish requests when publishing setup is ready", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "request-123",
    userId: "user-123",
    repositoryStatus: "READY",
    publishStatus: "NOT_STARTED",
    publishingSetupStatus: "READY",
    sourceOfTruth: "PORTAL_MANAGED_REPO",
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
    id: "attempt-123",
  } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);

  await publishToAzureAction("request-123");

  expect(prisma.publishAttempt.create).toHaveBeenCalled();
});
```

- [ ] **Step 2: Gate queuePublishAttempt**

In `src/features/publishing/actions.ts`, add:

```ts
function requiresSetupRepair(status: string | null | undefined) {
  return (
    status === "NEEDS_REPAIR" ||
    status === "REPAIRING" ||
    status === "BLOCKED"
  );
}
```

Inside `queuePublishAttempt` after repository readiness and imported preparation checks:

```ts
if (requiresSetupRepair(appRequest.publishingSetupStatus)) {
  throw new Error("Publishing setup must be repaired before publishing.");
}
```

Allow `NOT_CHECKED` for generated apps so the worker can perform setup classification on first publish. For imported apps, require ready:

```ts
if (
  appRequest.sourceOfTruth === "IMPORTED_REPOSITORY" &&
  appRequest.publishingSetupStatus !== "READY"
) {
  throw new Error("Imported app publishing setup must be ready before publishing.");
}
```

- [ ] **Step 3: Add failing worker setup-failure test**

Append to `src/features/publishing/run-publish-attempt.test.ts`:

```ts
it("records setup repair state when publishing setup fails before deployment", async () => {
  const runtime = {
    provisionInfrastructure: vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Microsoft Graph request failed: 403 {"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges to complete the operation."}}',
        ),
      ),
    deployRepository: vi.fn(),
    verifyDeployment: vi.fn(),
  };
  vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue({
    id: "attempt-123",
    appRequestId: "request-123",
    appRequest: { id: "request-123" },
  } as Awaited<ReturnType<typeof prisma.publishAttempt.findUnique>>);

  await expect(runPublishAttempt("attempt-123", runtime)).rejects.toThrow(
    "Microsoft Graph request failed",
  );

  expect(prisma.appRequest.update).toHaveBeenCalledWith({
    where: { id: "request-123" },
    data: expect.objectContaining({
      publishStatus: "FAILED",
      publishingSetupStatus: expect.stringMatching(/NEEDS_REPAIR|BLOCKED/),
      publishingSetupErrorSummary: expect.any(String),
    }),
  });
  expect(runtime.deployRepository).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Classify setup failures in worker**

In `src/features/publishing/run-publish-attempt.ts`, import:

```ts
import { classifyPublishingSetupError } from "./setup/status";
```

Track whether the worker has dispatched deployment:

```ts
let deploymentDispatched = false;
```

Set `deploymentDispatched = true` immediately after `effectiveRuntime.deployRepository()` resolves because the workflow has been dispatched by that point.

In the catch block, before updating `appRequest`, add:

```ts
const setupClassification = deploymentDispatched
  ? null
  : classifyPublishingSetupError({
      step: "entra_redirect_uri",
      error,
    });
```

Update `appRequest` with setup fields when `setupClassification` is present:

```ts
await prisma.appRequest.update({
  where: { id: attempt.appRequestId },
  data: {
    publishStatus: "FAILED",
    publishErrorSummary: setupClassification
      ? `Publishing setup failed: ${setupClassification.summary}`
      : errorSummary,
    ...(setupClassification
      ? {
          publishingSetupStatus: setupClassification.setupStatus,
          publishingSetupErrorSummary: setupClassification.summary,
        }
      : {}),
  },
});
```

- [ ] **Step 5: Run publishing tests**

Run:

```bash
npm test -- src/features/publishing/actions.test.ts src/features/publishing/run-publish-attempt.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/publishing/actions.ts src/features/publishing/actions.test.ts src/features/publishing/run-publish-attempt.ts src/features/publishing/run-publish-attempt.test.ts
git commit -m "feat: gate publishing by setup readiness"
```

---

## Task 8: Show Setup Status And Repair In UI

**Files:**
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add failing My Apps UI test**

Append to `src/app/apps/page.test.tsx`:

```ts
it("shows repair instead of publish when publishing setup needs repair", async () => {
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
  vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
    {
      id: "req_setup_repair",
      appName: "Campus Dashboard",
      generationStatus: "SUCCEEDED",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      publishStatus: "FAILED",
      publishErrorSummary: "Publishing setup failed: Publishing credentials are out of date and need to be refreshed.",
      publishingSetupStatus: "NEEDS_REPAIR",
      publishingSetupErrorSummary:
        "Publishing credentials are out of date and need to be refreshed.",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      azureDatabaseName: null,
      repositoryImport: null,
      publishSetupChecks: [
        {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
        },
      ],
      publishAttempts: [],
    },
  ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    githubUsername: "portalstaff",
  } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

  render(await MyAppsPage());

  expect(screen.getByText(/setup: needs repair/i)).toBeInTheDocument();
  expect(
    screen.getByText(/publishing credentials are out of date/i),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /repair publishing setup/i }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /retry publish/i }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Update My Apps query and rendering**

In `src/app/apps/page.tsx`, import:

```ts
import { repairPublishingSetupAction } from "@/features/publishing/setup/actions";
```

Include setup checks:

```ts
publishSetupChecks: {
  orderBy: { checkedAt: "desc" },
  take: 7,
},
```

Add helper:

```tsx
function needsPublishingSetupRepair(status: string | null | undefined) {
  return status === "NEEDS_REPAIR" || status === "BLOCKED";
}

function renderPublishingSetupStatus(request: {
  id: string;
  publishingSetupStatus?: string | null;
  publishingSetupErrorSummary?: string | null;
  publishSetupChecks?: Array<{
    checkKey: string;
    status: string;
    message: string;
  }>;
}) {
  const status = request.publishingSetupStatus ?? "NOT_CHECKED";
  const repairAction = repairPublishingSetupAction.bind(null, request.id);

  return (
    <section aria-label="Publishing setup status" className="setup-status">
      <h3 className="setup-status__title">Publishing setup</h3>
      <p>Setup: {formatStatus(status)}</p>
      {request.publishingSetupErrorSummary ? (
        <p>{request.publishingSetupErrorSummary}</p>
      ) : null}
      {request.publishSetupChecks?.length ? (
        <ul className="setup-status__checks">
          {request.publishSetupChecks.map((check) => (
            <li key={check.checkKey}>
              {formatStatus(check.checkKey)}: {formatStatus(check.status)} -{" "}
              {check.message}
            </li>
          ))}
        </ul>
      ) : null}
      {needsPublishingSetupRepair(status) ? (
        <form action={repairAction}>
          <PendingSubmitButton
            idleLabel="Repair Publishing Setup"
            pendingLabel="Repairing Publishing Setup..."
            statusText="Refreshing Azure, Entra, and GitHub publishing setup."
            variant="primary-solid"
            size="sm"
          />
        </form>
      ) : null}
    </section>
  );
}
```

Render it inside each app card before action buttons:

```tsx
{renderPublishingSetupStatus({
  id: request.id,
  publishingSetupStatus: request.publishingSetupStatus,
  publishingSetupErrorSummary: request.publishingSetupErrorSummary,
  publishSetupChecks: request.publishSetupChecks,
})}
```

Update `renderActionButton` to accept `publishingSetupStatus` and return repair-required text before retry/publish:

```tsx
if (needsPublishingSetupRepair(publishingSetupStatus)) {
  return (
    <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
      Repair publishing setup before publishing.
    </span>
  );
}
```

- [ ] **Step 3: Add app details page equivalent**

In `src/app/download/[requestId]/page.tsx`, import the repair action:

```ts
import { repairPublishingSetupAction } from "@/features/publishing/setup/actions";
```

Include check evidence in the existing app request query:

```ts
publishSetupChecks: {
  orderBy: { checkedAt: "desc" },
  take: 7,
},
```

Add the same helpers used on `My Apps`:

```tsx
function needsPublishingSetupRepair(status: string | null | undefined) {
  return status === "NEEDS_REPAIR" || status === "BLOCKED";
}

function renderPublishingSetupStatus(request: {
  id: string;
  publishingSetupStatus?: string | null;
  publishingSetupErrorSummary?: string | null;
  publishSetupChecks?: Array<{
    checkKey: string;
    status: string;
    message: string;
  }>;
}) {
  const status = request.publishingSetupStatus ?? "NOT_CHECKED";
  const repairAction = repairPublishingSetupAction.bind(null, request.id);

  return (
    <section aria-label="Publishing setup status" className="setup-status">
      <h2 className="section-title">Publishing setup</h2>
      <p>Setup: {formatStatus(status)}</p>
      {request.publishingSetupErrorSummary ? (
        <p>{request.publishingSetupErrorSummary}</p>
      ) : null}
      {request.publishSetupChecks?.length ? (
        <ul className="setup-status__checks">
          {request.publishSetupChecks.map((check) => (
            <li key={check.checkKey}>
              {formatStatus(check.checkKey)}: {formatStatus(check.status)} -{" "}
              {check.message}
            </li>
          ))}
        </ul>
      ) : null}
      {needsPublishingSetupRepair(status) ? (
        <form action={repairAction}>
          <PendingSubmitButton
            idleLabel="Repair Publishing Setup"
            pendingLabel="Repairing Publishing Setup..."
            statusText="Refreshing Azure, Entra, and GitHub publishing setup."
            variant="primary-solid"
            size="sm"
          />
        </form>
      ) : null}
    </section>
  );
}
```

Render the section near the existing publish status content:

```tsx
{renderPublishingSetupStatus({
  id: appRequest.id,
  publishingSetupStatus: appRequest.publishingSetupStatus,
  publishingSetupErrorSummary: appRequest.publishingSetupErrorSummary,
  publishSetupChecks: appRequest.publishSetupChecks,
})}
```

Pass `appRequest.publishingSetupStatus` into the app details publish action
helper and return this message before showing `Publish to Azure` or
`Retry Publish`:

```tsx
if (needsPublishingSetupRepair(publishingSetupStatus)) {
  return (
    <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
      Repair publishing setup before publishing.
    </span>
  );
}
```

- [ ] **Step 4: Add minimal CSS**

Append to `src/app/globals.css`:

```css
.setup-status {
  margin-top: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  background: var(--bg-light);
}

.setup-status__title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--cu-navy);
  margin: 0 0 0.5rem;
}

.setup-status__checks {
  margin: 0.5rem 0 0.75rem;
  padding-left: 1.25rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
```

- [ ] **Step 5: Run page tests**

Run:

```bash
npm test -- src/app/apps/page.test.tsx src/app/download/[requestId]/page.test.tsx
```

Expected: PASS. Existing generated-app fixtures should include:

```ts
publishingSetupStatus: "NOT_CHECKED",
publishingSetupErrorSummary: null,
publishSetupChecks: [],
```

Existing ready-to-publish imported app fixtures should include:

```ts
publishingSetupStatus: "READY",
publishingSetupErrorSummary: null,
publishSetupChecks: [],
```

- [ ] **Step 6: Commit**

```bash
git add src/app/apps/page.tsx src/app/apps/page.test.tsx src/app/download/[requestId]/page.tsx src/app/download/[requestId]/page.test.tsx src/app/globals.css
git commit -m "feat: show publishing setup repair controls"
```

---

## Task 9: Run Import-Time Preflight After Preparation

**Files:**
- Modify: `src/features/repository-imports/actions.ts`
- Modify: `src/features/repository-imports/actions.test.ts`

- [ ] **Step 1: Write failing import action test**

Append to `src/features/repository-imports/actions.test.ts`:

```ts
it("runs publishing setup preflight after imported repository preparation is committed", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "req_123",
    userId: "user-123",
    appName: "Campus Dashboard",
    repositoryOwner: "cedarville-it",
    repositoryName: "campus-dashboard",
    repositoryDefaultBranch: "main",
    repositoryImport: {
      id: "import_123",
      preparationStatus: "PENDING_USER_CHOICE",
    },
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  vi.mocked(prepareImportedRepository).mockResolvedValue({
    status: "COMMITTED",
    commitSha: "commit-sha",
    pullRequestUrl: null,
  });
  vi.mocked(preflightPublishingSetup).mockResolvedValue({
    setupStatus: "READY",
    errorSummary: null,
  });

  const formData = new FormData();
  formData.set("preparationMode", "DIRECT_COMMIT");

  await prepareExistingAppAction("req_123", formData, {
    github: {
      getBranchHead: vi.fn(),
      readRepositoryTextFiles: vi.fn(),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    },
  });

  expect(preflightPublishingSetup).toHaveBeenCalledWith("req_123");
});
```

At the top of the test file, mock and import:

```ts
vi.mock("@/features/publishing/setup/service", () => ({
  preflightPublishingSetup: vi.fn(),
}));

import { preflightPublishingSetup } from "@/features/publishing/setup/service";
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/actions.test.ts
```

Expected: FAIL because preflight is not called.

- [ ] **Step 3: Call preflight after committed preparation and verification**

In `src/features/repository-imports/actions.ts`, import:

```ts
import { preflightPublishingSetup } from "@/features/publishing/setup/service";
```

After successful `prepareImportedRepository`, call preflight only for committed direct changes:

```ts
if (result.status === "COMMITTED") {
  await preflightPublishingSetup(requestId);
}
```

In `verifyExistingAppPreparationAction`, after updating preparation to `COMMITTED`, call:

```ts
await preflightPublishingSetup(requestId);
```

Add a helper in `src/features/repository-imports/actions.ts` so preflight
failure never rolls back repository preparation:

```ts
async function runPublishingSetupPreflightBestEffort(requestId: string) {
  try {
    await preflightPublishingSetup(requestId);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Publishing setup preflight failed.";

    await prisma.appRequest.update({
      where: { id: requestId },
      data: {
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary: message,
      },
    });
  }
}
```

Use the helper after direct committed preparation:

```ts
if (result.status === "COMMITTED") {
  await runPublishingSetupPreflightBestEffort(requestId);
}
```

Use the helper after PR merge verification updates preparation to `COMMITTED`:

```ts
await runPublishingSetupPreflightBestEffort(requestId);
```

- [ ] **Step 4: Run import tests**

Run:

```bash
npm test -- src/features/repository-imports/actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts
git commit -m "feat: preflight imported app publishing setup"
```

---

## Task 10: Update Setup Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/portal/setup.md`

- [ ] **Step 1: Update README docs**

In `README.md`, add a short note to the “What It Does” or setup area:

```md
The portal also tracks publishing setup readiness for both generated and imported
apps. If Azure, Entra, or GitHub publishing credentials drift, users see a
Repair Publishing Setup action instead of repeatedly retrying a deployment that
cannot succeed.
```

- [ ] **Step 2: Update portal setup docs**

In `docs/portal/setup.md`, under “Portal-Managed Azure Publishing”, add:

```md
Publishing setup repair

The portal can refresh portal-managed GitHub Actions secrets and GitHub OIDC
federated credentials when configured values rotate. Repair removes and resets
only portal-managed publishing secrets and credentials for the target app. It
does not delete app repositories, dispatch deployment workflows, or delete Azure
resources.

If Microsoft Graph returns `Authorization_RequestDenied`, first confirm whether
the portal's configured Azure/Entra credential values have expired or rotated.
Update the configured values and run Repair Publishing Setup. If the current
values are valid and Graph still denies writes, grant the portal runtime identity
permission to update the shared app registration redirect URIs and the publisher
application's federated identity credentials.
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/features/publishing/setup/status.test.ts src/features/publishing/setup/service.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/portal/setup.md
git commit -m "docs: document publishing setup repair"
```

---

## Final Verification

- [ ] **Step 1: Run unit and page test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run targeted e2e smoke if local services are available**

Run:

```bash
npm run test:e2e -- e2e/create-and-download.spec.ts
```

Expected: PASS. If local Postgres or dev server setup is not available, record the exact blocker and run the full unit suite and build instead.

- [ ] **Step 4: Review final git status**

Run:

```bash
git status --short
```

Expected: clean working tree after commits, or only intentional uncommitted changes requested by the user.
