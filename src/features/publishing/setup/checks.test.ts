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
            nested: {
              privateKey: "private-key",
              safe: "kept",
              items: [
                {
                  connectionString:
                    "postgresql://portaladmin:secret@example.test/db",
                  databaseUrl: "postgresql://example.test/db",
                  status: "missing",
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
            nested: {
              safe: "kept",
              items: [
                {
                  status: "missing",
                },
              ],
            },
          },
        }),
        update: expect.objectContaining({
          metadata: {
            repairable: true,
            secretNames: ["AZURE_CLIENT_ID"],
            nested: {
              safe: "kept",
              items: [
                {
                  status: "missing",
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
            nested: {
              refreshToken: "refresh-token",
              signingKey: "signing-key",
              privateKeyId: "private-key-id",
              databaseUrlValue: "postgresql://example.test/db",
              connectionStringValue: "connection-string",
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
            nested: {
              credentialName: "nested-credential-name",
              secretNames: ["AZURE_TENANT_ID"],
              status: "missing",
            },
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
