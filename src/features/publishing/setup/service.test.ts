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
        ".github/workflows/deploy-azure-app-service.yml": "name: Deploy",
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
    await preflightPublishingSetup("req_123", createDeps());

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledTimes(7);
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: expect.objectContaining({
        publishingSetupStatus: "READY",
        publishingSetupErrorSummary: null,
      }),
    });
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
