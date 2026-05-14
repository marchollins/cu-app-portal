import { describe, expect, it, vi } from "vitest";

import { createAzurePublishRuntime } from "./runtime";

const config = {
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
} as const;

const readyAppRequest = {
  id: "clx9abc123zzzzzzzzzz",
  appName: "Campus Dashboard",
  userId: "user-123",
  template: { slug: "web-app" },
  supportReference: "CU-123",
  repositoryOwner: "cedarville-it",
  repositoryName: "campus-dashboard",
  repositoryDefaultBranch: "main",
  repositoryStatus: "READY",
  primaryPublishUrl: null,
};

function emptyWorkflowRunsError() {
  return new Error(
    "No GitHub workflow runs found for cedarville-it/campus-dashboard deploy-azure-app-service.yml.",
  );
}

function createDeps({
  appRequest = readyAppRequest,
  getLatestWorkflowRun = vi.fn().mockRejectedValueOnce(
    emptyWorkflowRunsError(),
  ).mockResolvedValueOnce({
    id: "123",
    url: "https://github.com/org/repo/actions/runs/123",
    status: "queued",
    conclusion: null,
  }),
  getWorkflowRun = vi.fn().mockResolvedValue({
    id: "123",
    url: "https://github.com/org/repo/actions/runs/123",
    status: "completed",
    conclusion: "success",
  }),
} = {}) {
  const arm = {
    appServicePlanId: vi.fn().mockReturnValue("/plans/asp-cu-apps-published"),
    putWebApp: vi.fn().mockResolvedValue({
      properties: {
        defaultHostName: "app-campus-dashboard-clx9abc1.azurewebsites.net",
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
    getLatestWorkflowRun,
    getWorkflowRun,
  };
  const prisma = {
    appRequest: {
      findUnique: vi.fn().mockResolvedValue(appRequest),
    },
  };

  return {
    deps: { config, prisma, arm, graph, github },
    arm,
    graph,
    github,
    prisma,
  };
}

describe("createAzurePublishRuntime", () => {
  it("provisions shared-target app resources and configures github deployment", async () => {
    const { deps, arm, graph, github } = createDeps();

    const runtime = createAzurePublishRuntime(deps);

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
    expect(arm.putPostgresDatabase).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      serverName: "psql-cu-apps-published",
      databaseName: "db_campus_dashboard_clx9abc1",
    });
    expect(arm.putWebApp).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "app-campus-dashboard-clx9abc1",
        runtimeStack: "NODE|24-lts",
        startupCommand: "npm start",
        tags: expect.objectContaining({
          appRequestId: "clx9abc123zzzzzzzzzz",
          repository: "cedarville-it/campus-dashboard",
        }),
      }),
    );
    expect(arm.putAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          DATABASE_URL:
            "postgresql://portaladmin:secret@psql-cu-apps-published.postgres.database.azure.com:5432/db_campus_dashboard_clx9abc1?sslmode=require",
          AUTH_URL:
            "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
          NEXTAUTH_URL:
            "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
          AUTH_MICROSOFT_ENTRA_ID_ID: "entra-client-id",
          SCM_DO_BUILD_DURING_DEPLOYMENT: "false",
          ENABLE_ORYX_BUILD: "false",
          WEBSITE_RUN_FROM_PACKAGE: "1",
        }),
      }),
    );
    expect(graph.ensureRedirectUri).toHaveBeenCalledWith({
      applicationObjectId: "entra-object-id",
      redirectUri:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    });
    expect(graph.ensureFederatedCredential).toHaveBeenCalledWith({
      applicationAppId: "client-id",
      name: "github-campus-dashboard-clx9abc1",
      repository: "cedarville-it/campus-dashboard",
      branch: "main",
    });
    expect(github.setActionsSecret).toHaveBeenCalledTimes(4);
    expect(github.setActionsSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "AZURE_CLIENT_ID" }),
    );
    expect(github.setActionsSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "AZURE_TENANT_ID" }),
    );
    expect(github.setActionsSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "AZURE_SUBSCRIPTION_ID" }),
    );
    expect(github.setActionsSecret).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      secretName: "AZURE_WEBAPP_NAME",
      secretValue: "app-campus-dashboard-clx9abc1",
    });
    expect(github.dispatchWorkflow).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      workflowFileName: "deploy-azure-app-service.yml",
      ref: "main",
    });
    expect(run).toEqual({
      publishUrl: "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      githubWorkflowRunId: "123",
      githubWorkflowRunUrl: "https://github.com/org/repo/actions/runs/123",
    });
  });

  it("requires a ready repository status before provisioning or deploying", async () => {
    const { deps } = createDeps({
      appRequest: {
        ...readyAppRequest,
        repositoryStatus: "PENDING",
      },
    });
    const runtime = createAzurePublishRuntime(deps);

    await expect(
      runtime.provisionInfrastructure("clx9abc123zzzzzzzzzz"),
    ).rejects.toThrow("Managed repository is not ready for Azure publishing.");
    await expect(
      runtime.deployRepository("clx9abc123zzzzzzzzzz"),
    ).rejects.toThrow("Managed repository is not ready for Azure publishing.");
  });

  it("waits for a workflow run created after dispatch", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const getLatestWorkflowRun = vi
      .fn()
      .mockResolvedValueOnce({
        id: "old",
        url: "https://github.com/org/repo/actions/runs/old",
      })
      .mockResolvedValueOnce({
        id: "old",
        url: "https://github.com/org/repo/actions/runs/old",
      })
      .mockResolvedValueOnce({
        id: "new",
        url: "https://github.com/org/repo/actions/runs/new",
      });
    const { deps, github } = createDeps({ getLatestWorkflowRun });
    const runtime = createAzurePublishRuntime({
      ...deps,
      workflowRunPollIntervalMs: 0,
      sleep,
    });

    const run = await runtime.deployRepository("clx9abc123zzzzzzzzzz");

    expect(github.dispatchWorkflow).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      workflowFileName: "deploy-azure-app-service.yml",
      ref: "main",
    });
    expect(github.getLatestWorkflowRun).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(run).toEqual({
      publishUrl: "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      githubWorkflowRunId: "new",
      githubWorkflowRunUrl: "https://github.com/org/repo/actions/runs/new",
    });
  });

  it("invokes the workflow dispatched hook after dispatch succeeds", async () => {
    const onWorkflowDispatched = vi.fn();
    const getLatestWorkflowRun = vi
      .fn()
      .mockResolvedValueOnce({
        id: "old",
        url: "https://github.com/org/repo/actions/runs/old",
      })
      .mockResolvedValueOnce({
        id: "new",
        url: "https://github.com/org/repo/actions/runs/new",
      });
    const { deps, github } = createDeps({ getLatestWorkflowRun });
    const runtime = createAzurePublishRuntime(deps);

    await runtime.deployRepository("clx9abc123zzzzzzzzzz", {
      onWorkflowDispatched,
    });

    expect(onWorkflowDispatched).toHaveBeenCalledOnce();
    expect(github.dispatchWorkflow.mock.invocationCallOrder[0]).toBeLessThan(
      onWorkflowDispatched.mock.invocationCallOrder[0],
    );
    expect(onWorkflowDispatched.mock.invocationCallOrder[0]).toBeLessThan(
      getLatestWorkflowRun.mock.invocationCallOrder[1],
    );
  });

  it("reports setup-sensitive deploy steps before dispatch", async () => {
    const setupSteps: string[] = [];
    const onSetupStep = vi.fn((step: string) => setupSteps.push(step));
    const { deps, graph, github } = createDeps();
    const runtime = createAzurePublishRuntime(deps);

    await runtime.deployRepository("clx9abc123zzzzzzzzzz", {
      onSetupStep,
    });

    expect(setupSteps).toEqual([
      "github_federated_credential",
      "github_actions_secrets",
    ]);
    expect(onSetupStep.mock.invocationCallOrder[0]).toBeLessThan(
      graph.ensureFederatedCredential.mock.invocationCallOrder[0],
    );
    expect(onSetupStep.mock.invocationCallOrder[1]).toBeLessThan(
      github.setActionsSecret.mock.invocationCallOrder[0],
    );
    expect(onSetupStep.mock.invocationCallOrder[1]).toBeLessThan(
      github.dispatchWorkflow.mock.invocationCallOrder[0],
    );
  });

  it("does not invoke the workflow dispatched hook when pre-dispatch setup fails", async () => {
    const onWorkflowDispatched = vi.fn();
    const onSetupStep = vi.fn();
    const { deps, graph, github } = createDeps();
    graph.ensureFederatedCredential.mockRejectedValue(
      new Error("federated credential denied"),
    );
    const runtime = createAzurePublishRuntime(deps);

    await expect(
      runtime.deployRepository("clx9abc123zzzzzzzzzz", {
        onWorkflowDispatched,
        onSetupStep,
      }),
    ).rejects.toThrow("federated credential denied");

    expect(onSetupStep).toHaveBeenCalledWith("github_federated_credential");
    expect(onWorkflowDispatched).not.toHaveBeenCalled();
    expect(github.dispatchWorkflow).not.toHaveBeenCalled();
  });

  it("waits when a dispatched workflow run is not visible yet", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const getLatestWorkflowRun = vi
      .fn()
      .mockRejectedValueOnce(emptyWorkflowRunsError())
      .mockRejectedValueOnce(emptyWorkflowRunsError())
      .mockResolvedValueOnce({
        id: "new",
        url: "https://github.com/org/repo/actions/runs/new",
      });
    const { deps } = createDeps({ getLatestWorkflowRun });
    const runtime = createAzurePublishRuntime({
      ...deps,
      workflowRunPollIntervalMs: 0,
      sleep,
    });

    const run = await runtime.deployRepository("clx9abc123zzzzzzzzzz");

    expect(getLatestWorkflowRun).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(run).toEqual({
      publishUrl: "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      githubWorkflowRunId: "new",
      githubWorkflowRunUrl: "https://github.com/org/repo/actions/runs/new",
    });
  });

  it("waits for workflow completion before verifying the published URL", async () => {
    const verifiedAt = new Date("2026-04-30T12:00:00.000Z");
    const sleep = vi.fn().mockResolvedValue(undefined);
    const getWorkflowRun = vi
      .fn()
      .mockResolvedValueOnce({
        id: "123",
        url: "https://github.com/org/repo/actions/runs/123",
        status: "in_progress",
        conclusion: null,
      })
      .mockResolvedValueOnce({
        id: "123",
        url: "https://github.com/org/repo/actions/runs/123",
        status: "completed",
        conclusion: "success",
      });
    const verifyPublishedUrl = vi.fn().mockResolvedValue({ verifiedAt });
    const { deps, github } = createDeps({ getWorkflowRun });
    const runtime = createAzurePublishRuntime({
      ...deps,
      workflowCompletionPollIntervalMs: 0,
      sleep,
      verifyPublishedUrl,
    });

    await runtime.deployRepository("clx9abc123zzzzzzzzzz");
    const result = await runtime.verifyDeployment(
      "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    );

    expect(result).toEqual({ verifiedAt });
    expect(github.getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(github.getWorkflowRun).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      runId: "123",
    });
    expect(sleep).toHaveBeenCalledWith(0);
    expect(verifyPublishedUrl).toHaveBeenCalledWith(
      "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    );
    expect(
      github.getWorkflowRun.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(verifyPublishedUrl.mock.invocationCallOrder[0]);
  });

  it("does not verify the published URL when the workflow run fails", async () => {
    const getWorkflowRun = vi.fn().mockResolvedValue({
      id: "123",
      url: "https://github.com/org/repo/actions/runs/123",
      status: "completed",
      conclusion: "failure",
    });
    const verifyPublishedUrl = vi.fn().mockResolvedValue({
      verifiedAt: new Date("2026-04-30T12:00:00.000Z"),
    });
    const { deps } = createDeps({ getWorkflowRun });
    const runtime = createAzurePublishRuntime({
      ...deps,
      verifyPublishedUrl,
    });

    await runtime.deployRepository("clx9abc123zzzzzzzzzz");

    await expect(
      runtime.verifyDeployment(
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      ),
    ).rejects.toThrow(
      "Deployment workflow failed. See https://github.com/org/repo/actions/runs/123",
    );
    expect(verifyPublishedUrl).not.toHaveBeenCalled();
  });

  it("times out when the workflow run never completes", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const getWorkflowRun = vi.fn().mockResolvedValue({
      id: "123",
      url: "https://github.com/org/repo/actions/runs/123",
      status: "in_progress",
      conclusion: null,
    });
    const verifyPublishedUrl = vi.fn().mockResolvedValue({
      verifiedAt: new Date("2026-04-30T12:00:00.000Z"),
    });
    const { deps } = createDeps({ getWorkflowRun });
    const runtime = createAzurePublishRuntime({
      ...deps,
      workflowCompletionPollAttempts: 2,
      workflowCompletionPollIntervalMs: 0,
      sleep,
      verifyPublishedUrl,
    });

    await runtime.deployRepository("clx9abc123zzzzzzzzzz");

    await expect(
      runtime.verifyDeployment(
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      ),
    ).rejects.toThrow("Deployment workflow did not complete in time. Run id: 123");
    expect(getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(verifyPublishedUrl).not.toHaveBeenCalled();
  });

  it("does not use workflow discovery poll overrides for completion polling", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const getWorkflowRun = vi
      .fn()
      .mockResolvedValueOnce({
        id: "123",
        url: "https://github.com/org/repo/actions/runs/123",
        status: "in_progress",
        conclusion: null,
      })
      .mockResolvedValueOnce({
        id: "123",
        url: "https://github.com/org/repo/actions/runs/123",
        status: "completed",
        conclusion: "success",
      });
    const verifyPublishedUrl = vi.fn().mockResolvedValue({
      verifiedAt: new Date("2026-04-30T12:00:00.000Z"),
    });
    const { deps } = createDeps({ getWorkflowRun });
    const runtime = createAzurePublishRuntime({
      ...deps,
      workflowRunPollAttempts: 1,
      workflowRunPollIntervalMs: 0,
      sleep,
      verifyPublishedUrl,
    });

    await runtime.deployRepository("clx9abc123zzzzzzzzzz");
    await runtime.verifyDeployment(
      "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    );

    expect(getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10_000);
  });
});
