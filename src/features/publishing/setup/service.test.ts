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
  primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
  template: { slug: "imported-web-app" },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn((operations) => Promise.all(operations)),
    appRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    publishSetupCheck: {
      upsert: vi.fn(),
    },
  },
}));

function createDeps(
  overrides: Partial<Parameters<typeof preflightPublishingSetup>[1]> = {},
) {
  const deps = {
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
      getAppSettings: vi.fn().mockResolvedValue({
        exists: true,
        settings: {
          DATABASE_URL: "postgresql://example",
          AUTH_URL: "https://app-campus-dashboard.azurewebsites.net",
          NEXTAUTH_URL: "https://app-campus-dashboard.azurewebsites.net",
          AUTH_SECRET: "auth-secret",
          AUTH_MICROSOFT_ENTRA_ID_ID: "entra-client-id",
          AUTH_MICROSOFT_ENTRA_ID_SECRET: "entra-client-secret",
          AUTH_MICROSOFT_ENTRA_ID_ISSUER:
            "https://login.microsoftonline.com/tenant/v2.0",
          NODE_ENV: "production",
          SCM_DO_BUILD_DURING_DEPLOYMENT: "false",
          ENABLE_ORYX_BUILD: "false",
          WEBSITE_RUN_FROM_PACKAGE: "1",
          EXISTING_CUSTOM_SETTING: "keep-me",
        },
      }),
      putPostgresDatabase: vi.fn(),
      putWebApp: vi.fn().mockResolvedValue({
        properties: {
          defaultHostName: "app-campus-dashboard.azurewebsites.net",
        },
      }),
      putAppSettings: vi.fn(),
    },
    graph: {
      hasRedirectUri: vi.fn().mockResolvedValue({ exists: true }),
      ensureRedirectUri: vi.fn(),
      listFederatedCredentials: vi.fn().mockResolvedValue([
        {
          id: "credential-id",
          name: "github-campus-dashboard-req123",
          subject: "repo:cedarville-it/campus-dashboard:ref:refs/heads/main",
        },
      ]),
      replaceFederatedCredential: vi.fn(),
    },
    github: {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ".github/workflows/deploy-azure-app-service.yml":
          "name: Deploy\non:\n  workflow_dispatch:\n",
      }),
      getActionsSecret: vi.fn().mockResolvedValue({ exists: true }),
      deleteActionsSecret: vi.fn(),
      setActionsSecret: vi.fn(),
    },
  };

  return { ...deps, ...overrides };
}

describe("publishing setup service", () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.$transaction).mockImplementation((operations) =>
      Promise.all(operations),
    );
    vi.mocked(prisma.appRequest.findUnique).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.publishSetupCheck.upsert).mockReset();
    vi.mocked(prisma.publishSetupCheck.upsert).mockResolvedValue(
      {} as Awaited<ReturnType<typeof prisma.publishSetupCheck.upsert>>,
    );
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(
      appRequest as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>,
    );
  });

  it("marks setup ready when preflight checks pass", async () => {
    const deps = createDeps();

    await preflightPublishingSetup("req_123", deps);

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledTimes(7);
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "READY",
        publishingSetupErrorSummary: null,
      }),
    });
    expect(deps.arm.putPostgresDatabase).not.toHaveBeenCalled();
    expect(deps.arm.putWebApp).not.toHaveBeenCalled();
    expect(deps.arm.putAppSettings).not.toHaveBeenCalled();
    expect(deps.graph.ensureRedirectUri).not.toHaveBeenCalled();
    expect(deps.graph.replaceFederatedCredential).not.toHaveBeenCalled();
    expect(deps.github.deleteActionsSecret).not.toHaveBeenCalled();
    expect(deps.github.setActionsSecret).not.toHaveBeenCalled();
  });

  it("marks setup needs repair when a required secret is missing", async () => {
    const baseDeps = createDeps();
    const deps = createDeps({
      github: {
        ...baseDeps.github,
        getActionsSecret: vi.fn().mockResolvedValue({ exists: false }),
      },
    });

    await preflightPublishingSetup("req_123", deps);

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary:
          "Required GitHub Actions secrets are missing.",
      }),
    });
    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          checkKey: "github_actions_secrets",
          metadata: {
            missingSecretNames: [
              "AZURE_CLIENT_ID",
              "AZURE_TENANT_ID",
              "AZURE_SUBSCRIPTION_ID",
              "AZURE_WEBAPP_NAME",
            ],
            repairable: true,
          },
        }),
      }),
    );
  });

  it("marks setup needs repair when required Azure app settings are missing", async () => {
    const baseDeps = createDeps();
    const deps = createDeps({
      arm: {
        ...baseDeps.arm,
        getAppSettings: vi.fn().mockResolvedValue({
          exists: true,
          settings: {
            DATABASE_URL: "postgresql://example",
            NODE_ENV: "production",
          },
        }),
      },
    });

    await preflightPublishingSetup("req_123", deps);

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary:
          "Required Azure App Service settings are missing.",
      }),
    });
  });

  it("marks workflow dispatch readiness pass only when static dispatch proof exists", async () => {
    await preflightPublishingSetup("req_123", createDeps());

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          checkKey: "github_workflow_dispatch",
          status: "PASS",
          message: "Workflow dispatch can be attempted from the default branch.",
          metadata: {
            branch: "main",
            workflowPath: ".github/workflows/deploy-azure-app-service.yml",
          },
        }),
      }),
    );
  });

  it.each([
    ["inline scalar", "name: Deploy\non: workflow_dispatch\n"],
    ["inline sequence", "name: Deploy\non: [workflow_dispatch, push]\n"],
    ["double-quoted on key", 'name: Deploy\n"on":\n  workflow_dispatch:\n'],
    ["single-quoted on key", "name: Deploy\n'on':\n  workflow_dispatch:\n"],
    [
      "indented mapping",
      "name: Deploy\non:\n  workflow_dispatch:\n  push:\n    branches: [main]\n",
    ],
    ["indented scalar", "name: Deploy\non:\n  workflow_dispatch\n"],
    [
      "block sequence",
      "name: Deploy\non:\n  - workflow_dispatch\n  - push\n",
    ],
    [
      "quoted direct child mapping",
      'name: Deploy\non:\n  "workflow_dispatch":\n',
    ],
    [
      "quoted block sequence item",
      'name: Deploy\non:\n  - "workflow_dispatch"\n  - push\n',
    ],
  ])("accepts top-level workflow dispatch trigger via %s", async (_label, workflow) => {
    const baseDeps = createDeps();
    const deps = createDeps({
      github: {
        ...baseDeps.github,
        readRepositoryTextFiles: vi.fn().mockResolvedValue({
          ".github/workflows/deploy-azure-app-service.yml": workflow,
        }),
      },
    });

    await preflightPublishingSetup("req_123", deps);

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "READY",
        publishingSetupErrorSummary: null,
      }),
    });
  });

  it.each([
    [
      "commented trigger",
      "name: Deploy\non:\n  push:\n    branches: [main]\n# workflow_dispatch:\n",
    ],
    [
      "nested job env",
      "name: Deploy\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    env:\n      EVENT_NAME: workflow_dispatch:\n",
    ],
    [
      "nested under push",
      "name: Deploy\non:\n  push:\n    branches: [main]\n    workflow_dispatch:\n",
    ],
  ])("does not accept %s as workflow dispatch proof", async (_label, workflow) => {
    const baseDeps = createDeps();
    const deps = createDeps({
      github: {
        ...baseDeps.github,
        readRepositoryTextFiles: vi.fn().mockResolvedValue({
          ".github/workflows/deploy-azure-app-service.yml": workflow,
        }),
      },
    });

    await preflightPublishingSetup("req_123", deps);

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary:
          "Workflow dispatch readiness could not be verified.",
      }),
    });
    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          checkKey: "github_workflow_dispatch",
          status: "UNKNOWN",
        }),
      }),
    );
  });

  it("repairs setup without dispatching a deployment workflow", async () => {
    const deps = createDeps();

    await repairPublishingSetup("req_123", deps);

    expect(deps.github.deleteActionsSecret).toHaveBeenCalledTimes(4);
    expect(deps.github.setActionsSecret).toHaveBeenCalledTimes(4);
    for (const secretName of [
      "AZURE_CLIENT_ID",
      "AZURE_TENANT_ID",
      "AZURE_SUBSCRIPTION_ID",
      "AZURE_WEBAPP_NAME",
    ]) {
      expect(deps.github.deleteActionsSecret).toHaveBeenCalledWith(
        expect.objectContaining({ secretName }),
      );
      expect(deps.github.setActionsSecret).toHaveBeenCalledWith(
        expect.objectContaining({ secretName }),
      );
    }
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

  it("preserves custom primary publish URL and merges app settings during repair", async () => {
    const deps = createDeps();
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(
      {
        ...appRequest,
        primaryPublishUrl: "https://campus-dashboard.cedarville.edu",
      } as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>,
    );

    await repairPublishingSetup("req_123", deps);

    expect(deps.arm.putAppSettings).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-req123",
      settings: expect.objectContaining({
        EXISTING_CUSTOM_SETTING: "keep-me",
        AUTH_URL: "https://campus-dashboard.cedarville.edu",
        NEXTAUTH_URL: "https://campus-dashboard.cedarville.edu",
      }),
    });
    expect(deps.graph.ensureRedirectUri).toHaveBeenCalledWith({
      applicationObjectId: "entra-object-id",
      redirectUri:
        "https://campus-dashboard.cedarville.edu/api/auth/callback/microsoft-entra-id",
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        primaryPublishUrl: "https://campus-dashboard.cedarville.edu",
      }),
    });
  });
});
