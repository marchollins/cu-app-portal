import { describe, expect, it } from "vitest";
import { loadAzurePublishConfig } from "./config";

function buildAzurePublishConfigSource(
  overrides: Record<string, string | undefined> = {},
) {
  return {
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
    ...overrides,
  };
}

describe("loadAzurePublishConfig", () => {
  it("loads the approved shared azure publish target", () => {
    expect(
      loadAzurePublishConfig(buildAzurePublishConfigSource()),
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
      loadAzurePublishConfig(
        buildAzurePublishConfigSource({
          AZURE_PUBLISH_RUNTIME_STACK: "NODE|20-lts",
        }),
      ),
    ).toThrow(/NODE\|24-lts/);
  });

  it("rejects whitespace-only config values", () => {
    expect(() =>
      loadAzurePublishConfig(
        buildAzurePublishConfigSource({
          AZURE_PUBLISH_RESOURCE_GROUP: "   ",
        }),
      ),
    ).toThrow(/AZURE_PUBLISH_RESOURCE_GROUP|non-whitespace/);
  });

  it("preserves secret values exactly", () => {
    const postgresAdminPassword = " secret with edge spaces ";
    const authSecret = " auth secret with edge spaces ";
    const entraClientSecret = " entra secret with edge spaces ";

    expect(
      loadAzurePublishConfig(
        buildAzurePublishConfigSource({
          AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD: postgresAdminPassword,
          AZURE_PUBLISH_AUTH_SECRET: authSecret,
          AZURE_PUBLISH_ENTRA_CLIENT_SECRET: entraClientSecret,
        }),
      ),
    ).toMatchObject({
      postgresAdminPassword,
      authSecret,
      entraClientSecret,
    });
  });
});
