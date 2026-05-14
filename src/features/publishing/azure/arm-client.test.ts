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

  it("reads existing web app settings without exposing a missing app as an exception", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          properties: {
            EXISTING_CUSTOM_SETTING: "keep-me",
            NODE_ENV: "production",
          },
        }),
      )
      .mockResolvedValueOnce(text("not found", { status: 404 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.getAppSettings({
        resourceGroup: "rg-cu-apps-published",
        name: "app-campus-dashboard-clx9abc1",
      }),
    ).resolves.toEqual({
      exists: true,
      settings: {
        EXISTING_CUSTOM_SETTING: "keep-me",
        NODE_ENV: "production",
      },
    });
    await expect(
      client.getAppSettings({
        resourceGroup: "rg-cu-apps-published",
        name: "missing-app",
      }),
    ).resolves.toEqual({ exists: false, settings: {} });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1/config/appsettings/list?api-version=2023-12-01",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws the ARM response status and text when app settings cannot be read", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("forbidden", { status: 403 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.getAppSettings({
        resourceGroup: "rg-cu-apps-published",
        name: "app-campus-dashboard-clx9abc1",
      }),
    ).rejects.toThrow("Azure ARM request failed: 403 forbidden");
  });

  it("deletes the app web app and only the selected PostgreSQL database", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.deleteWebApp({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
    });
    await client.deletePostgresDatabase({
      resourceGroup: "rg-cu-apps-published",
      serverName: "psql-cu-apps-published",
      databaseName: "db_campus_dashboard_clx9abc1",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1?api-version=2023-12-01",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-cu-apps-published/databases/db_campus_dashboard_clx9abc1?api-version=2023-06-01-preview",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchImpl).not.toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-cu-apps-published?api-version=2023-06-01-preview",
      expect.anything(),
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
