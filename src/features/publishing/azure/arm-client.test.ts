import { describe, expect, it, vi } from "vitest";

import { createAzureArmClient } from "./arm-client";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function text(body: string, init: ResponseInit) {
  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
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
      startupCommand: "npm start",
      tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(
        "/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1",
      ),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("api-version=2023-12-01"),
      expect.objectContaining({
        body: JSON.stringify({
          location: "eastus2",
          kind: "app,linux",
          tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
          properties: {
            serverFarmId:
              "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/serverfarms/asp-cu-apps-published",
            httpsOnly: true,
            siteConfig: {
              linuxFxVersion: "NODE|24-lts",
              appCommandLine: "npm start",
            },
          },
        }),
      }),
    );
  });

  it("creates or updates a PostgreSQL database on the shared server", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ id: "database-id" }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.putPostgresDatabase({
      resourceGroup: "rg-cu-apps-published",
      serverName: "psql-cu-apps-published",
      databaseName: "db_campus_dashboard_clx9abc1",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-cu-apps-published/databases/db_campus_dashboard_clx9abc1?api-version=2023-06-01-preview",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          properties: { charset: "UTF8", collation: "en_US.utf8" },
        }),
      }),
    );
  });

  it("creates or updates web app settings", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ properties: {} }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.putAppSettings({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      settings: {
        DATABASE_URL: "postgresql://example",
        NODE_ENV: "production",
      },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1/config/appsettings?api-version=2023-12-01",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          properties: {
            DATABASE_URL: "postgresql://example",
            NODE_ENV: "production",
          },
        }),
      }),
    );
  });

  it("throws the ARM response status and text for non-JSON error bodies", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("plain ARM failure", { status: 400 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.putWebApp({
        resourceGroup: "rg-cu-apps-published",
        name: "app-campus-dashboard-clx9abc1",
        location: "eastus2",
        appServicePlanId:
          "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/serverfarms/asp-cu-apps-published",
        runtimeStack: "NODE|24-lts",
        startupCommand: "npm start",
        tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
      }),
    ).rejects.toThrow("Azure ARM request failed: 400 plain ARM failure");
  });
});
