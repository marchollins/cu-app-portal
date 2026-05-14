import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { persistPublishingSetupChecks } from "./checks";

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn((operations) => Promise.all(operations)),
    publishSetupCheck: {
      upsert: vi.fn(),
    },
  },
}));

describe("persistPublishingSetupChecks", () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.$transaction).mockImplementation((operations) =>
      Promise.all(operations),
    );
    vi.mocked(prisma.publishSetupCheck.upsert).mockReset();
    vi.mocked(prisma.publishSetupCheck.upsert).mockResolvedValue(
      {} as Awaited<ReturnType<typeof prisma.publishSetupCheck.upsert>>,
    );
  });

  it("upserts setup checks by app request and check key", async () => {
    const checkedAt = new Date("2026-05-14T16:00:00.000Z");

    await persistPublishingSetupChecks({
      appRequestId: "request-123",
      checkedAt,
      checks: [
        {
          checkKey: "github_workflow_file",
          status: "PASS",
          message: "Deployment workflow exists.",
          metadata: {
            repairable: false,
            workflowPath: ".github/workflows/deploy.yml",
          },
        },
        {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
          metadata: { repairable: true, secretNames: ["AZURE_CLIENT_ID"] },
        },
      ],
    });

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.any(Promise),
      expect.any(Promise),
    ]);
    expect(prisma.publishSetupCheck.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        appRequestId_checkKey: {
          appRequestId: "request-123",
          checkKey: "github_workflow_file",
        },
      },
      create: {
        appRequestId: "request-123",
        checkKey: "github_workflow_file",
        status: "PASS",
        message: "Deployment workflow exists.",
        metadata: {
          repairable: false,
          workflowPath: ".github/workflows/deploy.yml",
        },
        checkedAt,
      },
      update: {
        status: "PASS",
        message: "Deployment workflow exists.",
        metadata: {
          repairable: false,
          workflowPath: ".github/workflows/deploy.yml",
        },
        checkedAt,
      },
    });
  });

  it("recursively removes secret-like metadata before persistence", async () => {
    await persistPublishingSetupChecks({
      appRequestId: "request-123",
      checkedAt: new Date("2026-05-14T16:05:00.000Z"),
      checks: [
        {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
          metadata: {
            repairable: true,
            secretNames: ["AZURE_CLIENT_ID"],
            token: "github-token",
            repository: {
              privateKey: "private-key",
              owner: "cedarville-it",
              name: "campus-dashboard",
              subject: [
                {
                  connectionString:
                    "postgresql://portaladmin:secret@example.test/db",
                  databaseUrl: "postgresql://example.test/db",
                  step: "configure-secrets",
                },
              ],
            },
            secretValue: "secret-value",
          },
        },
      ],
    });

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: {
            repairable: true,
            secretNames: ["AZURE_CLIENT_ID"],
            repository: {
              owner: "cedarville-it",
              name: "campus-dashboard",
              subject: [
                {
                  step: "configure-secrets",
                },
              ],
            },
          },
        }),
        update: expect.objectContaining({
          metadata: {
            repairable: true,
            secretNames: ["AZURE_CLIENT_ID"],
            repository: {
              owner: "cedarville-it",
              name: "campus-dashboard",
              subject: [
                {
                  step: "configure-secrets",
                },
              ],
            },
          },
        }),
      }),
    );
  });

  it("removes common sensitive key variants while preserving safe identifiers", async () => {
    await persistPublishingSetupChecks({
      appRequestId: "request-123",
      checkedAt: new Date("2026-05-14T16:07:00.000Z"),
      checks: [
        {
          checkKey: "github_federated_credential",
          status: "FAIL",
          message: "Federated credential is missing.",
          metadata: {
            repairable: true,
            secretNames: ["AZURE_CLIENT_ID"],
            credentialName: "portal-managed-main",
            credentialId: "credential-123",
            accessToken: "access-token",
            clientSecret: "client-secret",
            credentials: {
              clientId: "client-id",
              clientSecret: "nested-client-secret",
            },
            rawCredentials: "raw-secret-json",
            password: "database-password",
            apiKey: "api-key",
            connection_string: "postgresql://example.test/underscore",
            database_url: "postgresql://example.test/underscore-db",
            "connection-string": "postgresql://example.test/hyphen",
            "database-url": "postgresql://example.test/hyphen-db",
            repository: {
              refreshToken: "refresh-token",
              signingKey: "signing-key",
              privateKeyId: "private-key-id",
              databaseUrlValue: "postgresql://example.test/db",
              connectionStringValue: "connection-string",
              connection_string_value: "connection-string-underscore",
              database_url_value: "database-url-underscore",
              "connection-string-value": "connection-string-hyphen",
              "database-url-value": "database-url-hyphen",
              owner: "cedarville-it",
              name: "campus-dashboard",
              credentialName: "nested-credential-name",
              secretNames: ["AZURE_TENANT_ID"],
              status: "missing",
            },
          },
        },
      ],
    });

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: {
            repairable: true,
            secretNames: ["AZURE_CLIENT_ID"],
            credentialName: "portal-managed-main",
            credentialId: "credential-123",
            repository: {
              owner: "cedarville-it",
              name: "campus-dashboard",
              credentialName: "nested-credential-name",
              secretNames: ["AZURE_TENANT_ID"],
            },
          },
        }),
      }),
    );
  });

  it("persists only allowlisted diagnostic metadata fields", async () => {
    await persistPublishingSetupChecks({
      appRequestId: "request-123",
      checkedAt: new Date("2026-05-14T16:08:00.000Z"),
      checks: [
        {
          checkKey: "github_workflow_dispatch",
          status: "FAIL",
          message: "Workflow dispatch failed.",
          metadata: {
            repairable: true,
            redirectUri: "https://campus-dashboard.example.test/auth/callback",
            path: ".github/workflows/deploy.yml",
            resourceGroup: "rg-cu-apps-published",
            webAppName: "app-campus-dashboard",
            databaseName: "db_campus_dashboard",
            branch: "main",
            repository: {
              owner: "cedarville-it",
              name: "campus-dashboard",
              defaultBranch: "main",
              providerResponse: { token: "nested-token", statusCode: 403 },
            },
            subject: [
              {
                owner: "cedarville-it",
                name: "campus-dashboard",
                step: "dispatch",
                value: "secret-subject-value",
              },
            ],
            owner: "cedarville-it",
            name: "deploy.yml",
            statusCode: 403,
            requestId: "provider-request-123",
            errorCode: "ResourceNotFound",
            step: "workflow_dispatch",
            exists: false,
            defaultBranch: "main",
            workflowPath: ".github/workflows/deploy.yml",
            missingSecretNames: ["AZURE_CLIENT_ID"],
            providerResponse: { accessToken: "provider-token", statusCode: 403 },
            authorizationHeader: "Bearer provider-token",
            githubPat: "ghp_secret",
            value: "raw-provider-value",
            unknownSafeLooking: "drop me",
          },
        },
      ],
    });

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: {
            repairable: true,
            redirectUri: "https://campus-dashboard.example.test/auth/callback",
            path: ".github/workflows/deploy.yml",
            resourceGroup: "rg-cu-apps-published",
            webAppName: "app-campus-dashboard",
            databaseName: "db_campus_dashboard",
            branch: "main",
            repository: {
              owner: "cedarville-it",
              name: "campus-dashboard",
              defaultBranch: "main",
            },
            subject: [
              {
                owner: "cedarville-it",
                name: "campus-dashboard",
                step: "dispatch",
              },
            ],
            owner: "cedarville-it",
            name: "deploy.yml",
            statusCode: 403,
            requestId: "provider-request-123",
            errorCode: "ResourceNotFound",
            step: "workflow_dispatch",
            exists: false,
            defaultBranch: "main",
            workflowPath: ".github/workflows/deploy.yml",
            missingSecretNames: ["AZURE_CLIENT_ID"],
          },
        }),
      }),
    );
  });

  it("persists a non-null metadata object when metadata is not an object", async () => {
    await persistPublishingSetupChecks({
      appRequestId: "request-123",
      checkedAt: new Date("2026-05-14T16:10:00.000Z"),
      checks: [
        {
          checkKey: "azure_resource_access",
          status: "UNKNOWN",
          message: "Unable to inspect Azure resources.",
          metadata: null as unknown as Record<string, unknown>,
        },
      ],
    });

    expect(prisma.publishSetupCheck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ metadata: {} }),
        update: expect.objectContaining({ metadata: {} }),
      }),
    );
  });
});
