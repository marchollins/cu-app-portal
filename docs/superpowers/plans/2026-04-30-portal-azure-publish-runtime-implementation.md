# Portal Azure Publish Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real portal-managed Azure publish runtime so a ready managed GitHub repo can be provisioned, deployed through GitHub Actions, tracked, and verified from the portal.

**Architecture:** Keep the runtime split into focused units: Prisma state, pure naming/config helpers, Azure control-plane client, Microsoft Graph redirect client, GitHub Actions extensions, publish orchestration, and UI surfacing. The portal remains the orchestrator; generated repositories build and deploy through their own GitHub Actions workflow using OIDC.

**Tech Stack:** Next.js server actions, Prisma/PostgreSQL, Vitest, GitHub REST API via `fetch`, Azure REST API via `fetch`, Microsoft Graph REST API, Azure Identity token acquisition, libsodium GitHub secret encryption, Node 24 LTS.

---

## File Structure

- Modify `prisma/schema.prisma` and add one Prisma migration for durable Azure target fields and GitHub workflow metadata.
- Modify `src/features/publishing/actions.ts` so queueing returns the new attempt id and can start orchestration.
- Modify `src/features/publishing/run-publish-attempt.ts` so the worker can track durable target fields and workflow evidence.
- Create `src/features/publishing/azure/config.ts` for publish runtime environment parsing.
- Create `src/features/publishing/azure/naming.ts` for deterministic Azure-safe names and tags.
- Create `src/features/publishing/azure/arm-client.ts` for Azure Resource Manager operations.
- Create `src/features/publishing/azure/graph-client.ts` for shared Entra redirect URI and federated credential operations.
- Create `src/features/publishing/azure/runtime.ts` for the concrete `PublishRuntime` implementation.
- Extend `src/features/repositories/github-app.ts` with Actions secret and workflow APIs.
- Modify `src/app/download/[requestId]/page.tsx` and `src/app/apps/page.tsx` to show Azure URL, workflow URL, and in-progress status.
- Update `docs/portal/setup.md` with required Azure publish runtime settings.

## Task 0: Add Publishing Runtime Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install runtime dependencies**

Run:

```bash
npm install @azure/identity libsodium-wrappers
```

Expected: `package.json` and `package-lock.json` include `@azure/identity` and `libsodium-wrappers`.

- [ ] **Step 2: Run dependency verification**

Run: `npm test -- src/features/repositories/github-app.test.ts`

Expected: Existing GitHub App tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add azure publishing runtime dependencies"
```

## Task 1: Persist Azure Publish Target And Workflow Metadata

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260430120000_azure_publish_runtime/migration.sql`
- Modify: `src/features/publishing/run-publish-attempt.test.ts`
- Modify: `src/features/publishing/actions.test.ts`

- [ ] **Step 1: Write failing model-shape tests**

Add assertions to `src/features/publishing/run-publish-attempt.test.ts` that the worker stores durable URLs and run metadata when the runtime returns them.

```ts
it("stores durable azure target and workflow metadata when publishing succeeds", async () => {
  vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue({
    id: "attempt-123",
    appRequestId: "request-123",
    appRequest: {
      id: "request-123",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
    },
  } as Awaited<ReturnType<typeof prisma.publishAttempt.findUnique>>);

  await runPublishAttempt("attempt-123", {
    provisionInfrastructure: vi.fn().mockResolvedValue({
      azureResourceGroup: "rg-cu-apps-published",
      azureAppServicePlan: "asp-cu-apps-published",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      azurePostgresServer: "psql-cu-apps-published",
      azureDatabaseName: "db_campus_dashboard_clx9abc1",
      azureDefaultHostName: "app-campus-dashboard-clx9abc1.azurewebsites.net",
      primaryPublishUrl:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    }),
    deployRepository: vi.fn().mockResolvedValue({
      publishUrl: "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      githubWorkflowRunId: "123456789",
      githubWorkflowRunUrl:
        "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
    }),
    verifyDeployment: vi.fn().mockResolvedValue({
      verifiedAt: new Date("2026-04-30T12:00:00.000Z"),
    }),
  });

  expect(prisma.appRequest.update).toHaveBeenCalledWith({
    where: { id: "request-123" },
    data: expect.objectContaining({
      azureResourceGroup: "rg-cu-apps-published",
      azureAppServicePlan: "asp-cu-apps-published",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      azurePostgresServer: "psql-cu-apps-published",
      azureDatabaseName: "db_campus_dashboard_clx9abc1",
      azureDefaultHostName: "app-campus-dashboard-clx9abc1.azurewebsites.net",
      primaryPublishUrl:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    }),
  });
  expect(prisma.publishAttempt.update).toHaveBeenCalledWith({
    where: { id: "attempt-123" },
    data: expect.objectContaining({
      githubWorkflowRunId: "123456789",
      githubWorkflowRunUrl:
        "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
      deploymentStartedAt: expect.any(Date),
    }),
  });
});
```

- [ ] **Step 2: Run the focused worker tests and confirm failure**

Run: `npm test -- src/features/publishing/run-publish-attempt.test.ts`

Expected: FAIL because `PublishRuntime.provisionInfrastructure` currently returns `void`, the worker does not persist Azure target fields, and `PublishAttempt` has no GitHub workflow fields.

- [ ] **Step 3: Update Prisma schema**

Add these fields to `AppRequest` in `prisma/schema.prisma` near existing publish fields:

```prisma
  azureResourceGroup    String?
  azureAppServicePlan   String?
  azureWebAppName       String?
  azurePostgresServer   String?
  azureDatabaseName     String?
  azureDefaultHostName  String?
  customDomain          String?
  primaryPublishUrl     String?
```

Add these fields to `PublishAttempt`:

```prisma
  githubWorkflowRunId  String?
  githubWorkflowRunUrl String?
  deploymentStartedAt  DateTime?
  verifiedAt           DateTime?
```

- [ ] **Step 4: Add the migration**

Create `prisma/migrations/20260430120000_azure_publish_runtime/migration.sql`:

```sql
ALTER TABLE "AppRequest"
ADD COLUMN "azureResourceGroup" TEXT,
ADD COLUMN "azureAppServicePlan" TEXT,
ADD COLUMN "azureWebAppName" TEXT,
ADD COLUMN "azurePostgresServer" TEXT,
ADD COLUMN "azureDatabaseName" TEXT,
ADD COLUMN "azureDefaultHostName" TEXT,
ADD COLUMN "customDomain" TEXT,
ADD COLUMN "primaryPublishUrl" TEXT;

ALTER TABLE "PublishAttempt"
ADD COLUMN "githubWorkflowRunId" TEXT,
ADD COLUMN "githubWorkflowRunUrl" TEXT,
ADD COLUMN "deploymentStartedAt" TIMESTAMP(3),
ADD COLUMN "verifiedAt" TIMESTAMP(3);
```

- [ ] **Step 5: Update worker runtime types and persistence**

In `src/features/publishing/run-publish-attempt.ts`, replace `PublishRuntime` with:

```ts
export type ProvisionedPublishTarget = {
  azureResourceGroup: string;
  azureAppServicePlan: string;
  azureWebAppName: string;
  azurePostgresServer: string;
  azureDatabaseName: string;
  azureDefaultHostName: string;
  primaryPublishUrl: string;
};

export type DeploymentRun = {
  publishUrl: string;
  githubWorkflowRunId: string;
  githubWorkflowRunUrl: string;
};

export type VerificationResult = {
  verifiedAt: Date;
};

export type PublishRuntime = {
  provisionInfrastructure: (
    appRequestId: string,
  ) => Promise<ProvisionedPublishTarget>;
  deployRepository: (appRequestId: string) => Promise<DeploymentRun>;
  verifyDeployment: (publishUrl: string) => Promise<VerificationResult>;
};
```

After `provisionInfrastructure`, persist target fields:

```ts
const target = await runtime.provisionInfrastructure(attempt.appRequestId);

await prisma.appRequest.update({
  where: { id: attempt.appRequestId },
  data: {
    azureResourceGroup: target.azureResourceGroup,
    azureAppServicePlan: target.azureAppServicePlan,
    azureWebAppName: target.azureWebAppName,
    azurePostgresServer: target.azurePostgresServer,
    azureDatabaseName: target.azureDatabaseName,
    azureDefaultHostName: target.azureDefaultHostName,
    primaryPublishUrl: target.primaryPublishUrl,
  },
});
```

After `deployRepository`, persist workflow metadata:

```ts
const deployment = await runtime.deployRepository(attempt.appRequestId);
const deploymentStartedAt = new Date();

await prisma.publishAttempt.update({
  where: { id: attemptId },
  data: {
    githubWorkflowRunId: deployment.githubWorkflowRunId,
    githubWorkflowRunUrl: deployment.githubWorkflowRunUrl,
    deploymentStartedAt,
  },
});
```

Use `deployment.publishUrl` in verification and final request update.

- [ ] **Step 6: Run Prisma generate and tests**

Run: `npm run prisma:generate`

Expected: Prisma client generation succeeds.

Run: `npm test -- src/features/publishing/run-publish-attempt.test.ts src/features/publishing/actions.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260430120000_azure_publish_runtime/migration.sql src/features/publishing/run-publish-attempt.ts src/features/publishing/run-publish-attempt.test.ts src/features/publishing/actions.test.ts
git commit -m "feat: persist azure publish runtime metadata"
```

## Task 2: Add Publish Runtime Config And Naming Helpers

**Files:**
- Create: `src/features/publishing/azure/config.ts`
- Create: `src/features/publishing/azure/config.test.ts`
- Create: `src/features/publishing/azure/naming.ts`
- Create: `src/features/publishing/azure/naming.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `src/features/publishing/azure/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadAzurePublishConfig } from "./config";

describe("loadAzurePublishConfig", () => {
  it("loads the approved shared azure publish target", () => {
    expect(
      loadAzurePublishConfig({
        AZURE_PUBLISH_RESOURCE_GROUP: "rg-cu-apps-published",
        AZURE_PUBLISH_APP_SERVICE_PLAN: "asp-cu-apps-published",
        AZURE_PUBLISH_POSTGRES_SERVER: "psql-cu-apps-published",
        AZURE_PUBLISH_POSTGRES_ADMIN_USER: "portaladmin",
        AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD: "secret",
        AZURE_PUBLISH_LOCATION: "eastus2",
        AZURE_PUBLISH_RUNTIME_STACK: "NODE|24-lts",
        AZURE_PUBLISH_CLIENT_ID: "client-id",
        AZURE_PUBLISH_TENANT_ID: "tenant-id",
        AZURE_PUBLISH_SUBSCRIPTION_ID: "subscription-id",
        AZURE_PUBLISH_AUTH_SECRET: "auth-secret",
        AZURE_PUBLISH_ENTRA_CLIENT_ID: "entra-client-id",
        AZURE_PUBLISH_ENTRA_CLIENT_SECRET: "entra-client-secret",
        AZURE_PUBLISH_ENTRA_ISSUER:
          "https://login.microsoftonline.com/tenant-id/v2.0",
        AZURE_PUBLISH_ENTRA_APP_OBJECT_ID: "entra-object-id",
      }),
    ).toEqual({
      resourceGroup: "rg-cu-apps-published",
      appServicePlan: "asp-cu-apps-published",
      postgresServer: "psql-cu-apps-published",
      postgresAdminUser: "portaladmin",
      postgresAdminPassword: "secret",
      location: "eastus2",
      runtimeStack: "NODE|24-lts",
      azureClientId: "client-id",
      azureTenantId: "tenant-id",
      azureSubscriptionId: "subscription-id",
      authSecret: "auth-secret",
      entraClientId: "entra-client-id",
      entraClientSecret: "entra-client-secret",
      entraIssuer: "https://login.microsoftonline.com/tenant-id/v2.0",
      entraAppObjectId: "entra-object-id",
    });
  });

  it("rejects non-node-24 runtime stacks", () => {
    expect(() =>
      loadAzurePublishConfig({
        AZURE_PUBLISH_RESOURCE_GROUP: "rg-cu-apps-published",
        AZURE_PUBLISH_APP_SERVICE_PLAN: "asp-cu-apps-published",
        AZURE_PUBLISH_POSTGRES_SERVER: "psql-cu-apps-published",
        AZURE_PUBLISH_POSTGRES_ADMIN_USER: "portaladmin",
        AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD: "secret",
        AZURE_PUBLISH_LOCATION: "eastus2",
        AZURE_PUBLISH_RUNTIME_STACK: "NODE|20-lts",
        AZURE_PUBLISH_CLIENT_ID: "client-id",
        AZURE_PUBLISH_TENANT_ID: "tenant-id",
        AZURE_PUBLISH_SUBSCRIPTION_ID: "subscription-id",
        AZURE_PUBLISH_AUTH_SECRET: "auth-secret",
        AZURE_PUBLISH_ENTRA_CLIENT_ID: "entra-client-id",
        AZURE_PUBLISH_ENTRA_CLIENT_SECRET: "entra-client-secret",
        AZURE_PUBLISH_ENTRA_ISSUER:
          "https://login.microsoftonline.com/tenant-id/v2.0",
        AZURE_PUBLISH_ENTRA_APP_OBJECT_ID: "entra-object-id",
      }),
    ).toThrow(/NODE\|24-lts/);
  });
});
```

- [ ] **Step 2: Write failing naming tests**

Create `src/features/publishing/azure/naming.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPublishTargetNames, buildPublishResourceTags } from "./naming";

describe("buildPublishTargetNames", () => {
  it("creates stable azure-safe and postgres-safe names", () => {
    expect(
      buildPublishTargetNames({
        requestId: "clx9abc123zzzzzzzzzz",
        appName: "Campus Dashboard!",
      }),
    ).toEqual({
      shortRequestId: "clx9abc1",
      baseName: "campus-dashboard-clx9abc1",
      webAppName: "app-campus-dashboard-clx9abc1",
      databaseName: "db_campus_dashboard_clx9abc1",
      federatedCredentialName: "github-campus-dashboard-clx9abc1",
      azureDefaultHostName:
        "app-campus-dashboard-clx9abc1.azurewebsites.net",
      primaryPublishUrl:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    });
  });

  it("keeps the request id suffix when truncating long names", () => {
    const names = buildPublishTargetNames({
      requestId: "clx9abc123zzzzzzzzzz",
      appName:
        "This App Name Is So Long That Azure Web App Names Need Truncation",
    });

    expect(names.webAppName.length).toBeLessThanOrEqual(60);
    expect(names.webAppName.endsWith("-clx9abc1")).toBe(true);
    expect(names.databaseName.endsWith("_clx9abc1")).toBe(true);
  });
});

describe("buildPublishResourceTags", () => {
  it("builds the required ownership tags", () => {
    expect(
      buildPublishResourceTags({
        requestId: "request-123",
        appName: "Campus Dashboard",
        templateSlug: "web-app",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        ownerUserId: "user-123",
        supportReference: "CU-123",
      }),
    ).toEqual({
      managedBy: "cu-app-portal",
      appRequestId: "request-123",
      appName: "Campus Dashboard",
      templateSlug: "web-app",
      repository: "cedarville-it/campus-dashboard",
      environment: "published",
      ownerUserId: "user-123",
      supportReference: "CU-123",
      createdBy: "portal-publish-worker",
    });
  });
});
```

- [ ] **Step 3: Run tests and confirm failures**

Run: `npm test -- src/features/publishing/azure/config.test.ts src/features/publishing/azure/naming.test.ts`

Expected: FAIL because the files do not exist.

- [ ] **Step 4: Implement config loader**

Create `src/features/publishing/azure/config.ts`:

```ts
import { z } from "zod";

const azurePublishConfigSchema = z.object({
  AZURE_PUBLISH_RESOURCE_GROUP: z.string().min(1),
  AZURE_PUBLISH_APP_SERVICE_PLAN: z.string().min(1),
  AZURE_PUBLISH_POSTGRES_SERVER: z.string().min(1),
  AZURE_PUBLISH_POSTGRES_ADMIN_USER: z.string().min(1),
  AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD: z.string().min(1),
  AZURE_PUBLISH_LOCATION: z.string().min(1),
  AZURE_PUBLISH_RUNTIME_STACK: z.literal("NODE|24-lts"),
  AZURE_PUBLISH_CLIENT_ID: z.string().min(1),
  AZURE_PUBLISH_TENANT_ID: z.string().min(1),
  AZURE_PUBLISH_SUBSCRIPTION_ID: z.string().min(1),
  AZURE_PUBLISH_AUTH_SECRET: z.string().min(1),
  AZURE_PUBLISH_ENTRA_CLIENT_ID: z.string().min(1),
  AZURE_PUBLISH_ENTRA_CLIENT_SECRET: z.string().min(1),
  AZURE_PUBLISH_ENTRA_ISSUER: z.string().url(),
  AZURE_PUBLISH_ENTRA_APP_OBJECT_ID: z.string().min(1),
});

export type AzurePublishConfig = {
  resourceGroup: string;
  appServicePlan: string;
  postgresServer: string;
  postgresAdminUser: string;
  postgresAdminPassword: string;
  location: string;
  runtimeStack: "NODE|24-lts";
  azureClientId: string;
  azureTenantId: string;
  azureSubscriptionId: string;
  authSecret: string;
  entraClientId: string;
  entraClientSecret: string;
  entraIssuer: string;
  entraAppObjectId: string;
};

export function loadAzurePublishConfig(
  source: Record<string, string | undefined> = process.env,
): AzurePublishConfig {
  const parsed = azurePublishConfigSchema.parse(source);

  return {
    resourceGroup: parsed.AZURE_PUBLISH_RESOURCE_GROUP,
    appServicePlan: parsed.AZURE_PUBLISH_APP_SERVICE_PLAN,
    postgresServer: parsed.AZURE_PUBLISH_POSTGRES_SERVER,
    postgresAdminUser: parsed.AZURE_PUBLISH_POSTGRES_ADMIN_USER,
    postgresAdminPassword: parsed.AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD,
    location: parsed.AZURE_PUBLISH_LOCATION,
    runtimeStack: parsed.AZURE_PUBLISH_RUNTIME_STACK,
    azureClientId: parsed.AZURE_PUBLISH_CLIENT_ID,
    azureTenantId: parsed.AZURE_PUBLISH_TENANT_ID,
    azureSubscriptionId: parsed.AZURE_PUBLISH_SUBSCRIPTION_ID,
    authSecret: parsed.AZURE_PUBLISH_AUTH_SECRET,
    entraClientId: parsed.AZURE_PUBLISH_ENTRA_CLIENT_ID,
    entraClientSecret: parsed.AZURE_PUBLISH_ENTRA_CLIENT_SECRET,
    entraIssuer: parsed.AZURE_PUBLISH_ENTRA_ISSUER,
    entraAppObjectId: parsed.AZURE_PUBLISH_ENTRA_APP_OBJECT_ID,
  };
}
```

- [ ] **Step 5: Implement naming helpers**

Create `src/features/publishing/azure/naming.ts`:

```ts
function toSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "app"
  );
}

function withMaxLength(prefix: string, slug: string, suffix: string, max: number) {
  const reserved = prefix.length + suffix.length + 2;
  const slugMax = Math.max(1, max - reserved);
  const shortenedSlug = slug.slice(0, slugMax).replaceAll(/-+$/g, "") || "app";

  return `${prefix}-${shortenedSlug}-${suffix}`;
}

export function buildPublishTargetNames({
  requestId,
  appName,
}: {
  requestId: string;
  appName: string;
}) {
  const shortRequestId = toSlug(requestId).replaceAll("-", "").slice(0, 7);
  const slug = toSlug(appName);
  const baseName = `${slug}-${shortRequestId}`;
  const webAppName = withMaxLength("app", slug, shortRequestId, 60);
  const databaseSlug = webAppName
    .replace(/^app-/, "")
    .replaceAll("-", "_")
    .replaceAll(/[^a-z0-9_]/g, "");

  return {
    shortRequestId,
    baseName,
    webAppName,
    databaseName: `db_${databaseSlug}`,
    federatedCredentialName: withMaxLength("github", slug, shortRequestId, 120),
    azureDefaultHostName: `${webAppName}.azurewebsites.net`,
    primaryPublishUrl: `https://${webAppName}.azurewebsites.net`,
  };
}

export function buildPublishResourceTags({
  requestId,
  appName,
  templateSlug,
  repositoryOwner,
  repositoryName,
  ownerUserId,
  supportReference,
}: {
  requestId: string;
  appName: string;
  templateSlug: string;
  repositoryOwner: string;
  repositoryName: string;
  ownerUserId: string;
  supportReference: string;
}) {
  return {
    managedBy: "cu-app-portal",
    appRequestId: requestId,
    appName,
    templateSlug,
    repository: `${repositoryOwner}/${repositoryName}`,
    environment: "published",
    ownerUserId,
    supportReference,
    createdBy: "portal-publish-worker",
  };
}

export function assertPortalOwnership(
  tags: Record<string, string | undefined> | null | undefined,
  requestId: string,
  resourceName: string,
) {
  if (tags?.managedBy === "cu-app-portal" && tags.appRequestId === requestId) {
    return;
  }

  throw new Error(
    `Azure resource ${resourceName} exists but is not tagged for this app request.`,
  );
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/features/publishing/azure/config.test.ts src/features/publishing/azure/naming.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/publishing/azure/config.ts src/features/publishing/azure/config.test.ts src/features/publishing/azure/naming.ts src/features/publishing/azure/naming.test.ts
git commit -m "feat: add azure publish config and naming"
```

## Task 3: Extend GitHub App Client For Actions Secrets And Workflow Runs

**Files:**
- Modify: `src/features/repositories/github-app.ts`
- Modify: `src/features/repositories/github-app.test.ts`

- [ ] **Step 1: Write failing GitHub client tests**

Add tests to `src/features/repositories/github-app.test.ts`:

```ts
it("sets an actions secret using the repository public key", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
    .mockResolvedValueOnce(
      createJsonResponse({
        key_id: "key-id-123",
        key: Buffer.from("test-public-key").toString("base64"),
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));

  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    installationId: "111",
    fetchImpl,
  });

  await client.setActionsSecret({
    owner: "cedarville-it",
    name: "campus-dashboard",
    secretName: "AZURE_CLIENT_ID",
    secretValue: "client-id",
  });

  expect(fetchImpl).toHaveBeenLastCalledWith(
    "https://api.github.com/repos/cedarville-it/campus-dashboard/actions/secrets/AZURE_CLIENT_ID",
    expect.objectContaining({ method: "PUT" }),
  );
});

it("dispatches a workflow and finds the newest run", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
    .mockResolvedValueOnce(
      createJsonResponse({
        workflow_runs: [
          {
            id: 123456789,
            html_url:
              "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
            status: "queued",
            conclusion: null,
          },
        ],
      }),
    );

  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    installationId: "111",
    fetchImpl,
  });

  await client.dispatchWorkflow({
    owner: "cedarville-it",
    name: "campus-dashboard",
    workflowFileName: "deploy-azure-app-service.yml",
    ref: "main",
  });

  const run = await client.getLatestWorkflowRun({
    owner: "cedarville-it",
    name: "campus-dashboard",
    workflowFileName: "deploy-azure-app-service.yml",
    branch: "main",
  });

  expect(run).toEqual({
    id: "123456789",
    url:
      "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
    status: "queued",
    conclusion: null,
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/features/repositories/github-app.test.ts`

Expected: FAIL because `setActionsSecret`, `dispatchWorkflow`, and `getLatestWorkflowRun` are missing.

- [ ] **Step 3: Add client methods**

In `src/features/repositories/github-app.ts`, add input/response types:

```ts
type SetActionsSecretInput = {
  owner: string;
  name: string;
  secretName: string;
  secretValue: string;
};

type DispatchWorkflowInput = {
  owner: string;
  name: string;
  workflowFileName: string;
  ref: string;
};

type GetLatestWorkflowRunInput = {
  owner: string;
  name: string;
  workflowFileName: string;
  branch: string;
};

type GitHubActionsPublicKeyResponse = {
  key_id: string;
  key: string;
};

type GitHubWorkflowRunsResponse = {
  workflow_runs: Array<{
    id: number;
    html_url: string;
    status: string;
    conclusion: string | null;
  }>;
};
```

Add the libsodium-based encryption helper required by GitHub Actions secrets:

```ts
import sodium from "libsodium-wrappers";

async function encryptGitHubSecret(publicKey: string, secretValue: string) {
  await sodium.ready;
  const binaryKey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const binarySecret = sodium.from_string(secretValue);
  const encrypted = sodium.crypto_box_seal(binarySecret, binaryKey);

  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}
```

Add methods inside the returned client:

```ts
async setActionsSecret({
  owner,
  name,
  secretName,
  secretValue,
}: SetActionsSecretInput) {
  const headers = await withInstallationHeaders();
  const key = await readJson<GitHubActionsPublicKeyResponse>(
    await fetchImpl(
      `https://api.github.com/repos/${owner}/${name}/actions/secrets/public-key`,
      { method: "GET", headers },
    ),
  );

  const response = await fetchImpl(
    `https://api.github.com/repos/${owner}/${name}/actions/secrets/${secretName}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        encrypted_value: await encryptGitHubSecret(key.key, secretValue),
        key_id: key.key_id,
      }),
    },
  );

  if (response.status !== 201 && response.status !== 204) {
    await readJson<unknown>(response);
  }
},
async dispatchWorkflow({
  owner,
  name,
  workflowFileName,
  ref,
}: DispatchWorkflowInput) {
  const headers = await withInstallationHeaders();
  const response = await fetchImpl(
    `https://api.github.com/repos/${owner}/${name}/actions/workflows/${workflowFileName}/dispatches`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref }),
    },
  );

  if (response.status !== 204) {
    await readJson<unknown>(response);
  }
},
async getLatestWorkflowRun({
  owner,
  name,
  workflowFileName,
  branch,
}: GetLatestWorkflowRunInput) {
  const headers = await withInstallationHeaders();
  const data = await readJson<GitHubWorkflowRunsResponse>(
    await fetchImpl(
      `https://api.github.com/repos/${owner}/${name}/actions/workflows/${workflowFileName}/runs?branch=${encodeURIComponent(branch)}&per_page=1`,
      { method: "GET", headers },
    ),
  );
  const run = data.workflow_runs[0];

  if (!run) {
    throw new Error(
      `No GitHub workflow runs found for ${owner}/${name} ${workflowFileName}.`,
    );
  }

  return {
    id: String(run.id),
    url: run.html_url,
    status: run.status,
    conclusion: run.conclusion,
  };
},
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/features/repositories/github-app.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/repositories/github-app.ts src/features/repositories/github-app.test.ts
git commit -m "feat: add github actions automation client"
```

## Task 4: Add Azure ARM And Microsoft Graph Clients

**Files:**
- Create: `src/features/publishing/azure/arm-client.ts`
- Create: `src/features/publishing/azure/arm-client.test.ts`
- Create: `src/features/publishing/azure/graph-client.ts`
- Create: `src/features/publishing/azure/graph-client.test.ts`

- [ ] **Step 1: Write failing ARM client tests**

Create `src/features/publishing/azure/arm-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAzureArmClient } from "./arm-client";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("createAzureArmClient", () => {
  it("creates or updates a web app with app settings and startup command", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ id: "resource-id", properties: {} }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.putWebApp({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      location: "eastus2",
      appServicePlanId:
        "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/serverfarms/asp-cu-apps-published",
      runtimeStack: "NODE|24-lts",
      startupCommand: "npm run prisma:migrate:deploy && npm start",
      tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(
        "/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1",
      ),
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
```

- [ ] **Step 2: Write failing Graph client tests**

Create `src/features/publishing/azure/graph-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createMicrosoftGraphClient } from "./graph-client";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("createMicrosoftGraphClient", () => {
  it("adds a redirect uri only when it is missing", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ web: { redirectUris: ["https://old/cb"] } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.ensureRedirectUri({
      applicationObjectId: "app-object-id",
      redirectUri:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://graph.microsoft.com/v1.0/applications/app-object-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          web: {
            redirectUris: [
              "https://old/cb",
              "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
            ],
          },
        }),
      }),
    );
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm test -- src/features/publishing/azure/arm-client.test.ts src/features/publishing/azure/graph-client.test.ts`

Expected: FAIL because both clients are missing.

- [ ] **Step 4: Implement ARM client skeleton**

Create `src/features/publishing/azure/arm-client.ts` with focused REST helpers:

```ts
type FetchLike = typeof fetch;

type AzureArmClientOptions = {
  subscriptionId: string;
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : null;

  if (!response.ok) {
    throw new Error(`Azure ARM request failed: ${response.status} ${text}`);
  }

  return body as T;
}

export function createAzureArmClient({
  subscriptionId,
  tokenProvider,
  fetchImpl = fetch,
}: AzureArmClientOptions) {
  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  function resourceUrl(path: string, apiVersion: string) {
    return `https://management.azure.com/subscriptions/${subscriptionId}${path}?api-version=${apiVersion}`;
  }

  return {
    appServicePlanId(resourceGroup: string, name: string) {
      return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/serverfarms/${name}`;
    },
    async putWebApp(input: {
      resourceGroup: string;
      name: string;
      location: string;
      appServicePlanId: string;
      runtimeStack: "NODE|24-lts";
      startupCommand: string;
      tags: Record<string, string>;
    }) {
      return readJson(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}`,
            "2023-12-01",
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              location: input.location,
              kind: "app,linux",
              tags: input.tags,
              properties: {
                serverFarmId: input.appServicePlanId,
                httpsOnly: true,
                siteConfig: {
                  linuxFxVersion: input.runtimeStack,
                  appCommandLine: input.startupCommand,
                },
              },
            }),
          },
        ),
      );
    },
  };
}
```

- [ ] **Step 5: Implement Graph client**

Create `src/features/publishing/azure/graph-client.ts`:

```ts
type FetchLike = typeof fetch;

type MicrosoftGraphClientOptions = {
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : null;

  if (!response.ok) {
    throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
  }

  return body as T;
}

export function createMicrosoftGraphClient({
  tokenProvider,
  fetchImpl = fetch,
}: MicrosoftGraphClientOptions) {
  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  return {
    async ensureRedirectUri({
      applicationObjectId,
      redirectUri,
    }: {
      applicationObjectId: string;
      redirectUri: string;
    }) {
      const application = await readJson<{
        web?: { redirectUris?: string[] };
      }>(
        await fetchImpl(
          `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
          { method: "GET", headers: await headers() },
        ),
      );
      const redirectUris = application.web?.redirectUris ?? [];

      if (redirectUris.includes(redirectUri)) {
        return;
      }

      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
        {
          method: "PATCH",
          headers: await headers(),
          body: JSON.stringify({
            web: { redirectUris: [...redirectUris, redirectUri] },
          }),
        },
      );

      if (response.status !== 204) {
        await readJson<unknown>(response);
      }
    },
  };
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/features/publishing/azure/arm-client.test.ts src/features/publishing/azure/graph-client.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/publishing/azure/arm-client.ts src/features/publishing/azure/arm-client.test.ts src/features/publishing/azure/graph-client.ts src/features/publishing/azure/graph-client.test.ts
git commit -m "feat: add azure publishing provider clients"
```

## Task 5: Implement Concrete Azure Publish Runtime

**Files:**
- Create: `src/features/publishing/azure/runtime.ts`
- Create: `src/features/publishing/azure/runtime.test.ts`
- Modify: `src/features/publishing/run-publish-attempt.ts`

- [ ] **Step 1: Write failing runtime orchestration test**

Create `src/features/publishing/azure/runtime.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAzurePublishRuntime } from "./runtime";

describe("createAzurePublishRuntime", () => {
  it("provisions shared-target app resources and configures github deployment", async () => {
    const arm = {
      appServicePlanId: vi.fn().mockReturnValue("/plans/asp-cu-apps-published"),
      putWebApp: vi.fn().mockResolvedValue({
        properties: {
          defaultHostName:
            "app-campus-dashboard-clx9abc1.azurewebsites.net",
        },
      }),
      putAppSettings: vi.fn().mockResolvedValue(undefined),
      putPostgresDatabase: vi.fn().mockResolvedValue(undefined),
    };
    const graph = {
      ensureRedirectUri: vi.fn().mockResolvedValue(undefined),
      ensureFederatedCredential: vi.fn().mockResolvedValue(undefined),
    };
    const github = {
      setActionsSecret: vi.fn().mockResolvedValue(undefined),
      dispatchWorkflow: vi.fn().mockResolvedValue(undefined),
      getLatestWorkflowRun: vi.fn().mockResolvedValue({
        id: "123",
        url: "https://github.com/org/repo/actions/runs/123",
        status: "queued",
        conclusion: null,
      }),
    };
    const prisma = {
      appRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "clx9abc123zzzzzzzzzz",
          appName: "Campus Dashboard",
          userId: "user-123",
          template: { slug: "web-app" },
          supportReference: "CU-123",
          repositoryOwner: "cedarville-it",
          repositoryName: "campus-dashboard",
          repositoryDefaultBranch: "main",
        }),
      },
    };

    const runtime = createAzurePublishRuntime({
      config: {
        resourceGroup: "rg-cu-apps-published",
        appServicePlan: "asp-cu-apps-published",
        postgresServer: "psql-cu-apps-published",
        postgresAdminUser: "portaladmin",
        postgresAdminPassword: "secret",
        location: "eastus2",
        runtimeStack: "NODE|24-lts",
        azureClientId: "client-id",
        azureTenantId: "tenant-id",
        azureSubscriptionId: "sub-id",
        authSecret: "auth-secret",
        entraClientId: "entra-client-id",
        entraClientSecret: "entra-client-secret",
        entraIssuer: "https://login.microsoftonline.com/tenant/v2.0",
        entraAppObjectId: "entra-object-id",
      },
      prisma,
      arm,
      graph,
      github,
    });

    const target = await runtime.provisionInfrastructure(
      "clx9abc123zzzzzzzzzz",
    );
    const run = await runtime.deployRepository("clx9abc123zzzzzzzzzz");

    expect(target).toEqual(
      expect.objectContaining({
        azureResourceGroup: "rg-cu-apps-published",
        azureWebAppName: "app-campus-dashboard-clx9abc1",
        azureDatabaseName: "db_campus_dashboard_clx9abc1",
        primaryPublishUrl:
          "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      }),
    );
    expect(graph.ensureRedirectUri).toHaveBeenCalledWith({
      applicationObjectId: "entra-object-id",
      redirectUri:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    });
    expect(github.setActionsSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "AZURE_CLIENT_ID" }),
    );
    expect(run.githubWorkflowRunId).toBe("123");
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- src/features/publishing/azure/runtime.test.ts`

Expected: FAIL because `runtime.ts` is missing.

- [ ] **Step 3: Implement runtime factory**

Create `src/features/publishing/azure/runtime.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type {
  DeploymentRun,
  ProvisionedPublishTarget,
  PublishRuntime,
  VerificationResult,
} from "../run-publish-attempt";
import type { AzurePublishConfig } from "./config";
import { buildPublishResourceTags, buildPublishTargetNames } from "./naming";

type RuntimeDeps = {
  config: AzurePublishConfig;
  prisma: Pick<PrismaClient, "appRequest">;
  arm: {
    appServicePlanId: (resourceGroup: string, name: string) => string;
    putWebApp: (input: {
      resourceGroup: string;
      name: string;
      location: string;
      appServicePlanId: string;
      runtimeStack: "NODE|24-lts";
      startupCommand: string;
      tags: Record<string, string>;
    }) => Promise<{ properties?: { defaultHostName?: string } }>;
    putAppSettings: (input: {
      resourceGroup: string;
      name: string;
      settings: Record<string, string>;
    }) => Promise<void>;
    putPostgresDatabase: (input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }) => Promise<void>;
  };
  graph: {
    ensureRedirectUri: (input: {
      applicationObjectId: string;
      redirectUri: string;
    }) => Promise<void>;
    ensureFederatedCredential: (input: {
      applicationAppId: string;
      name: string;
      repository: string;
      branch: string;
    }) => Promise<void>;
  };
  github: {
    setActionsSecret: (input: {
      owner: string;
      name: string;
      secretName: string;
      secretValue: string;
    }) => Promise<void>;
    dispatchWorkflow: (input: {
      owner: string;
      name: string;
      workflowFileName: string;
      ref: string;
    }) => Promise<void>;
    getLatestWorkflowRun: (input: {
      owner: string;
      name: string;
      workflowFileName: string;
      branch: string;
    }) => Promise<{ id: string; url: string }>;
  };
};

async function loadPublishableRequest(deps: RuntimeDeps, appRequestId: string) {
  const appRequest = await deps.prisma.appRequest.findUnique({
    where: { id: appRequestId },
    include: { template: true },
  });

  if (
    !appRequest?.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch
  ) {
    throw new Error("Managed repository is not ready for Azure publishing.");
  }

  return appRequest;
}

function buildDatabaseUrl(config: AzurePublishConfig, databaseName: string) {
  const password = encodeURIComponent(config.postgresAdminPassword);

  return `postgresql://${config.postgresAdminUser}:${password}@${config.postgresServer}.postgres.database.azure.com:5432/${databaseName}?sslmode=require`;
}

export function createAzurePublishRuntime(deps: RuntimeDeps): PublishRuntime {
  return {
    async provisionInfrastructure(appRequestId): Promise<ProvisionedPublishTarget> {
      const appRequest = await loadPublishableRequest(deps, appRequestId);
      const names = buildPublishTargetNames({
        requestId: appRequest.id,
        appName: appRequest.appName,
      });
      const tags = buildPublishResourceTags({
        requestId: appRequest.id,
        appName: appRequest.appName,
        templateSlug: appRequest.template.slug,
        repositoryOwner: appRequest.repositoryOwner,
        repositoryName: appRequest.repositoryName,
        ownerUserId: appRequest.userId,
        supportReference: appRequest.supportReference,
      });

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
        startupCommand: "npm run prisma:migrate:deploy && npm start",
        tags,
      });

      const azureDefaultHostName =
        webApp.properties?.defaultHostName ?? names.azureDefaultHostName;
      const primaryPublishUrl = `https://${azureDefaultHostName}`;

      await deps.arm.putAppSettings({
        resourceGroup: deps.config.resourceGroup,
        name: names.webAppName,
        settings: {
          DATABASE_URL: buildDatabaseUrl(deps.config, names.databaseName),
          AUTH_URL: primaryPublishUrl,
          NEXTAUTH_URL: primaryPublishUrl,
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
        redirectUri: `${primaryPublishUrl}/api/auth/callback/microsoft-entra-id`,
      });

      return {
        azureResourceGroup: deps.config.resourceGroup,
        azureAppServicePlan: deps.config.appServicePlan,
        azureWebAppName: names.webAppName,
        azurePostgresServer: deps.config.postgresServer,
        azureDatabaseName: names.databaseName,
        azureDefaultHostName,
        primaryPublishUrl,
      };
    },
    async deployRepository(appRequestId): Promise<DeploymentRun> {
      const appRequest = await loadPublishableRequest(deps, appRequestId);
      const names = buildPublishTargetNames({
        requestId: appRequest.id,
        appName: appRequest.appName,
      });
      const repository = `${appRequest.repositoryOwner}/${appRequest.repositoryName}`;
      const branch = appRequest.repositoryDefaultBranch;

      await deps.graph.ensureFederatedCredential({
        applicationAppId: deps.config.azureClientId,
        name: names.federatedCredentialName,
        repository,
        branch,
      });

      await deps.github.setActionsSecret({
        owner: appRequest.repositoryOwner,
        name: appRequest.repositoryName,
        secretName: "AZURE_CLIENT_ID",
        secretValue: deps.config.azureClientId,
      });
      await deps.github.setActionsSecret({
        owner: appRequest.repositoryOwner,
        name: appRequest.repositoryName,
        secretName: "AZURE_TENANT_ID",
        secretValue: deps.config.azureTenantId,
      });
      await deps.github.setActionsSecret({
        owner: appRequest.repositoryOwner,
        name: appRequest.repositoryName,
        secretName: "AZURE_SUBSCRIPTION_ID",
        secretValue: deps.config.azureSubscriptionId,
      });

      await deps.github.dispatchWorkflow({
        owner: appRequest.repositoryOwner,
        name: appRequest.repositoryName,
        workflowFileName: "deploy-azure-app-service.yml",
        ref: branch,
      });

      const run = await deps.github.getLatestWorkflowRun({
        owner: appRequest.repositoryOwner,
        name: appRequest.repositoryName,
        workflowFileName: "deploy-azure-app-service.yml",
        branch,
      });

      return {
        publishUrl:
          appRequest.primaryPublishUrl ??
          buildPublishTargetNames({
            requestId: appRequest.id,
            appName: appRequest.appName,
          }).primaryPublishUrl,
        githubWorkflowRunId: run.id,
        githubWorkflowRunUrl: run.url,
      };
    },
    async verifyDeployment(): Promise<VerificationResult> {
      return { verifiedAt: new Date() };
    },
  };
}
```

This first runtime version wires the orchestration shape. Task 7 replaces `verifyDeployment` with real HTTP/workflow verification.

- [ ] **Step 4: Add ARM database, app settings, and Graph federated credential methods**

Extend `arm-client.ts` with `putPostgresDatabase` and `putAppSettings`:

```ts
async putPostgresDatabase({
  resourceGroup,
  serverName,
  databaseName,
}: {
  resourceGroup: string;
  serverName: string;
  databaseName: string;
}) {
  const response = await fetchImpl(
    resourceUrl(
      `/resourceGroups/${resourceGroup}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${serverName}/databases/${databaseName}`,
      "2023-06-01-preview",
    ),
    {
      method: "PUT",
      headers: await headers(),
      body: JSON.stringify({
        properties: {
          charset: "UTF8",
          collation: "en_US.utf8",
        },
      }),
    },
  );

  await readJson<unknown>(response);
},
async putAppSettings({
  resourceGroup,
  name,
  settings,
}: {
  resourceGroup: string;
  name: string;
  settings: Record<string, string>;
}) {
  const response = await fetchImpl(
    resourceUrl(
      `/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}/config/appsettings`,
      "2023-12-01",
    ),
    {
      method: "PUT",
      headers: await headers(),
      body: JSON.stringify({
        properties: settings,
      }),
    },
  );

  await readJson<unknown>(response);
},
```

Extend `graph-client.ts` with `ensureFederatedCredential`:

```ts
async ensureFederatedCredential({
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
  const subject = `repo:${repository}:ref:refs/heads/${branch}`;
  const response = await fetchImpl(
    `https://graph.microsoft.com/v1.0/applications(appId='${applicationAppId}')/federatedIdentityCredentials`,
    {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({
        name,
        issuer: "https://token.actions.githubusercontent.com",
        subject,
        audiences: ["api://AzureADTokenExchange"],
      }),
    },
  );

  if (response.status === 409) {
    return;
  }

  await readJson<unknown>(response);
}
```

Use these exact method signatures:

```ts
putPostgresDatabase(input: {
  resourceGroup: string;
  serverName: string;
  databaseName: string;
}): Promise<void>

putAppSettings(input: {
  resourceGroup: string;
  name: string;
  settings: Record<string, string>;
}): Promise<void>

ensureFederatedCredential(input: {
  applicationAppId: string;
  name: string;
  repository: string;
  branch: string;
}): Promise<void>
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/features/publishing/azure/runtime.test.ts src/features/publishing/azure/arm-client.test.ts src/features/publishing/azure/graph-client.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/publishing/azure/runtime.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/azure/arm-client.ts src/features/publishing/azure/arm-client.test.ts src/features/publishing/azure/graph-client.ts src/features/publishing/azure/graph-client.test.ts
git commit -m "feat: add concrete azure publish runtime"
```

## Task 6: Wire Publish Actions To Start The Runtime

**Files:**
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/run-publish-attempt.ts`

- [ ] **Step 1: Write failing server action test**

In `src/features/publishing/actions.test.ts`, mock `runPublishAttempt` and assert the publish action starts it:

```ts
vi.mock("./run-publish-attempt", () => ({
  runPublishAttempt: vi.fn(),
}));

import { runPublishAttempt } from "./run-publish-attempt";

it("starts the publish worker after queueing an attempt", async () => {
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "request-123",
    repositoryStatus: "READY",
    publishStatus: "NOT_STARTED",
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  vi.mocked(prisma.publishAttempt.create).mockResolvedValue({
    id: "attempt-123",
  } as Awaited<ReturnType<typeof prisma.publishAttempt.create>>);
  vi.mocked(runPublishAttempt).mockResolvedValue(undefined);

  await publishToAzureAction("request-123");

  expect(runPublishAttempt).toHaveBeenCalledWith("attempt-123");
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- src/features/publishing/actions.test.ts`

Expected: FAIL because actions only queue and do not start the worker.

- [ ] **Step 3: Return attempt id from queue helper**

In `src/features/publishing/actions.ts`, return the attempt id:

```ts
async function queuePublishAttempt(requestId: string) {
  // existing checks and create call
  return attempt.id;
}
```

Then call the worker:

```ts
export async function publishToAzureAction(requestId: string) {
  const attemptId = await queuePublishAttempt(requestId);
  await runPublishAttempt(attemptId);
}
```

Do the same in `retryPublishAction`.

- [ ] **Step 4: Inject concrete runtime in `runPublishAttempt` default**

After Task 5, replace the throwing default runtime with a lazy concrete runtime builder. Add imports to `src/features/publishing/run-publish-attempt.ts`:

```ts
import { createAzurePublishRuntime } from "./azure/runtime";
import { loadAzurePublishConfig } from "./azure/config";
import { createAzureArmClient } from "./azure/arm-client";
import { createMicrosoftGraphClient } from "./azure/graph-client";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { prisma } from "@/lib/db";
import { DefaultAzureCredential } from "@azure/identity";
```

Add token helpers and default runtime construction:

```ts
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

function createDefaultRuntime() {
  const config = loadAzurePublishConfig();
  const githubConfig = loadGitHubAppConfig();
  const installationId =
    githubConfig.installationIdsByOrg[githubConfig.defaultOrg];

  if (!installationId) {
    throw new Error(
      `No GitHub App installation is configured for org "${githubConfig.defaultOrg}".`,
    );
  }

  return createAzurePublishRuntime({
    config,
    prisma,
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
  });
}
```

Change the default parameter to use the concrete runtime:

```ts
export async function runPublishAttempt(
  attemptId: string,
  runtime: PublishRuntime = createDefaultRuntime(),
) {
  // existing worker body
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/features/publishing/actions.test.ts src/features/publishing/run-publish-attempt.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/publishing/actions.ts src/features/publishing/actions.test.ts src/features/publishing/run-publish-attempt.ts
git commit -m "feat: start azure publish worker from actions"
```

## Task 7: Add Workflow Polling And URL Verification

**Files:**
- Create: `src/features/publishing/azure/verify-deployment.ts`
- Create: `src/features/publishing/azure/verify-deployment.test.ts`
- Modify: `src/features/publishing/azure/runtime.ts`
- Modify: `src/features/repositories/github-app.ts`
- Modify: `src/features/repositories/github-app.test.ts`

- [ ] **Step 1: Write failing verification tests**

Create `src/features/publishing/azure/verify-deployment.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { verifyPublishedUrl } from "./verify-deployment";

describe("verifyPublishedUrl", () => {
  it("accepts 200 responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).resolves.toEqual({ verifiedAt: expect.any(Date) });
  });

  it("accepts auth redirect responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://login.microsoftonline.com/tenant" },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).resolves.toEqual({ verifiedAt: expect.any(Date) });
  });

  it("rejects runtime error pages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("Application Error", { status: 500 }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/did not return a healthy response/);
  });
});
```

- [ ] **Step 2: Run verification test and confirm failure**

Run: `npm test -- src/features/publishing/azure/verify-deployment.test.ts`

Expected: FAIL because file is missing.

- [ ] **Step 3: Implement URL verifier**

Create `src/features/publishing/azure/verify-deployment.ts`:

```ts
type VerifyOptions = {
  fetchImpl?: typeof fetch;
};

export async function verifyPublishedUrl(
  publishUrl: string,
  { fetchImpl = fetch }: VerifyOptions = {},
) {
  const response = await fetchImpl(publishUrl, {
    method: "GET",
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";

  if (
    response.status === 200 ||
    (response.status >= 300 &&
      response.status < 400 &&
      location.includes("login.microsoftonline.com"))
  ) {
    return { verifiedAt: new Date() };
  }

  throw new Error(
    `Published URL ${publishUrl} did not return a healthy response. Status: ${response.status}.`,
  );
}
```

- [ ] **Step 4: Add workflow run status support**

Extend `github-app.ts` with `getWorkflowRun`:

```ts
type GetWorkflowRunInput = {
  owner: string;
  name: string;
  runId: string;
};
```

Return:

```ts
{
  id: string;
  url: string;
  status: string;
  conclusion: string | null;
}
```

Add this test to `src/features/repositories/github-app.test.ts`:

```ts
it("reads a workflow run by id", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
    .mockResolvedValueOnce(
      createJsonResponse({
        id: 123456789,
        html_url:
          "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
        status: "completed",
        conclusion: "success",
      }),
    );

  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    installationId: "111",
    fetchImpl,
  });

  await expect(
    client.getWorkflowRun({
      owner: "cedarville-it",
      name: "campus-dashboard",
      runId: "123456789",
    }),
  ).resolves.toEqual({
    id: "123456789",
    url:
      "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
    status: "completed",
    conclusion: "success",
  });
});
```

- [ ] **Step 5: Use verifier in runtime**

In `runtime.ts`, replace the placeholder `verifyDeployment` with:

```ts
async verifyDeployment(publishUrl) {
  return verifyPublishedUrl(publishUrl);
}
```

Add workflow polling in `runtime.ts` before URL verification:

```ts
async function waitForSuccessfulWorkflowRun({
  github,
  owner,
  name,
  runId,
}: {
  github: RuntimeDeps["github"] & {
    getWorkflowRun: (input: {
      owner: string;
      name: string;
      runId: string;
    }) => Promise<{ status: string; conclusion: string | null; url: string }>;
  };
  owner: string;
  name: string;
  runId: string;
}) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const run = await github.getWorkflowRun({ owner, name, runId });

    if (run.status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      continue;
    }

    if (run.conclusion === "success") {
      return;
    }

    throw new Error(`Deployment workflow failed. See ${run.url}`);
  }

  throw new Error(`Deployment workflow did not complete in time. Run id: ${runId}`);
}
```

Then use it inside `verifyDeployment` before `verifyPublishedUrl`.

- [ ] **Step 6: Run tests**

Run: `npm test -- src/features/publishing/azure/verify-deployment.test.ts src/features/repositories/github-app.test.ts src/features/publishing/azure/runtime.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/publishing/azure/verify-deployment.ts src/features/publishing/azure/verify-deployment.test.ts src/features/publishing/azure/runtime.ts src/features/repositories/github-app.ts src/features/repositories/github-app.test.ts
git commit -m "feat: verify github deployment results"
```

## Task 8: Surface Azure And Workflow State In The UI

**Files:**
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`

- [ ] **Step 1: Write failing download page test**

Add to `src/app/download/[requestId]/page.test.tsx`:

```tsx
it("shows azure publish and workflow metadata when present", async () => {
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "request-123",
    appName: "Campus Dashboard",
    repositoryStatus: "READY",
    repositoryAccessStatus: "GRANTED",
    repositoryAccessNote: null,
    repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
    publishStatus: "DEPLOYING",
    publishUrl: null,
    publishErrorSummary: null,
    primaryPublishUrl:
      "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    azureWebAppName: "app-campus-dashboard-clx9abc1",
    publishAttempts: [
      {
        githubWorkflowRunUrl:
          "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
      },
    ],
    artifact: { filename: "campus-dashboard.zip" },
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

  render(await DownloadPage({ params: Promise.resolve({ requestId: "request-123" }) }));

  expect(
    screen.getByText(/app-campus-dashboard-clx9abc1/i),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /github workflow/i })).toHaveAttribute(
    "href",
    "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
  );
});
```

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `npm test -- src/app/download/[requestId]/page.test.tsx src/app/apps/page.test.tsx`

Expected: FAIL because pages do not include the new fields or latest attempt.

- [ ] **Step 3: Include latest publish attempt in queries**

In both pages, update the Prisma query:

```ts
include: {
  artifact: true,
  publishAttempts: {
    orderBy: { createdAt: "desc" },
    take: 1,
  },
}
```

For `/apps`, include latest attempt for each listed request:

```ts
include: {
  publishAttempts: {
    orderBy: { createdAt: "desc" },
    take: 1,
  },
}
```

- [ ] **Step 4: Render Azure and workflow links**

Add a small rendering helper to each page or a shared component later:

```tsx
function renderPublishMetadata(request: {
  azureWebAppName: string | null;
  primaryPublishUrl: string | null;
  publishAttempts?: Array<{ githubWorkflowRunUrl: string | null }>;
}) {
  const latestAttempt = request.publishAttempts?.[0];

  return (
    <>
      {request.azureWebAppName ? <p>Azure app: {request.azureWebAppName}</p> : null}
      {request.primaryPublishUrl ? (
        <p>
          Publish URL: <a href={request.primaryPublishUrl}>{request.primaryPublishUrl}</a>
        </p>
      ) : null}
      {latestAttempt?.githubWorkflowRunUrl ? (
        <p>
          <a href={latestAttempt.githubWorkflowRunUrl}>GitHub workflow</a>
        </p>
      ) : null}
    </>
  );
}
```

- [ ] **Step 5: Run UI tests**

Run: `npm test -- src/app/download/[requestId]/page.test.tsx src/app/apps/page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/download/[requestId]/page.tsx src/app/download/[requestId]/page.test.tsx src/app/apps/page.tsx src/app/apps/page.test.tsx
git commit -m "feat: show azure publish metadata"
```

## Task 9: Update Setup Documentation

**Files:**
- Modify: `docs/portal/setup.md`
- Modify: `docs/publishing/azure-app-service.md`
- Modify: `README.md`
- Modify: `docs/readme.test.ts`

- [ ] **Step 1: Write failing docs test**

In `docs/readme.test.ts`, add expectations that setup docs mention the shared Azure publish resources:

```ts
it("documents portal-managed azure publish runtime settings", async () => {
  const setup = await readFile("docs/portal/setup.md", "utf8");

  expect(setup).toContain("AZURE_PUBLISH_RESOURCE_GROUP");
  expect(setup).toContain("rg-cu-apps-published");
  expect(setup).toContain("AZURE_PUBLISH_RUNTIME_STACK");
  expect(setup).toContain("NODE|24-lts");
});
```

- [ ] **Step 2: Run docs test and confirm failure**

Run: `npm test -- docs/readme.test.ts`

Expected: FAIL if setup docs do not yet include the new Azure publish settings.

- [ ] **Step 3: Update docs**

Add a `Portal-Managed Azure Publishing` subsection to `docs/portal/setup.md` with:

```md
To enable portal-managed Azure publishing for generated apps, configure:

- `AZURE_PUBLISH_RESOURCE_GROUP=rg-cu-apps-published`
- `AZURE_PUBLISH_APP_SERVICE_PLAN=asp-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_SERVER=psql-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_ADMIN_USER`
- `AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD`
- `AZURE_PUBLISH_LOCATION`
- `AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts`
- `AZURE_PUBLISH_CLIENT_ID`
- `AZURE_PUBLISH_TENANT_ID`
- `AZURE_PUBLISH_SUBSCRIPTION_ID`
- `AZURE_PUBLISH_AUTH_SECRET`
- `AZURE_PUBLISH_ENTRA_CLIENT_ID`
- `AZURE_PUBLISH_ENTRA_CLIENT_SECRET`
- `AZURE_PUBLISH_ENTRA_ISSUER`
- `AZURE_PUBLISH_ENTRA_APP_OBJECT_ID`
```

Update `README.md` to link the approved runtime spec and state that generated app publishing uses the shared resource group, shared plan, shared PostgreSQL server, and per-app web app/database.

- [ ] **Step 4: Run docs test**

Run: `npm test -- docs/readme.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/portal/setup.md docs/publishing/azure-app-service.md README.md docs/readme.test.ts
git commit -m "docs: document portal azure publish runtime setup"
```

## Task 10: Final Verification

**Files:**
- Modify only files implicated by failing verification output.

- [ ] **Step 1: Run focused publishing suite**

Run:

```bash
npm test -- \
  src/features/publishing/actions.test.ts \
  src/features/publishing/run-publish-attempt.test.ts \
  src/features/publishing/azure/config.test.ts \
  src/features/publishing/azure/naming.test.ts \
  src/features/publishing/azure/arm-client.test.ts \
  src/features/publishing/azure/graph-client.test.ts \
  src/features/publishing/azure/runtime.test.ts \
  src/features/publishing/azure/verify-deployment.test.ts \
  src/features/repositories/github-app.test.ts \
  src/app/download/[requestId]/page.test.tsx \
  src/app/apps/page.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit any verification fixes**

If verification requires fixes, inspect `git status --short`, stage the exact files shown as changed by the fix, and commit them. Example for a runtime typing fix:

```bash
git add src/features/publishing/azure/runtime.ts src/features/publishing/azure/runtime.test.ts
git commit -m "fix: stabilize azure publish runtime"
```

If no fixes are required, do not create an empty commit.
