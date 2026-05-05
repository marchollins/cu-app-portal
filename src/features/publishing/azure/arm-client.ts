type FetchLike = typeof fetch;

type AzureArmClientOptions = {
  subscriptionId: string;
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

type AzureWebAppResponse = {
  properties?: {
    defaultHostName?: string;
  };
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Azure ARM request failed: ${response.status} ${text}`);
  }

  const body = text ? (JSON.parse(text) as T) : null;

  return body as T;
}

async function requireAzureStatus(response: Response, expectedStatuses: number[]) {
  if (expectedStatuses.includes(response.status)) {
    return;
  }

  const text = await response.text();

  throw new Error(`Azure ARM request failed: ${response.status} ${text}`);
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
      return readJson<AzureWebAppResponse>(
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
    async putAppSettings(input: {
      resourceGroup: string;
      name: string;
      settings: Record<string, string>;
    }) {
      await readJson<unknown>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}/config/appsettings`,
            "2023-12-01",
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              properties: input.settings,
            }),
          },
        ),
      );
    },
    async deleteWebApp(input: {
      resourceGroup: string;
      name: string;
    }) {
      await requireAzureStatus(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}`,
            "2023-12-01",
          ),
          {
            method: "DELETE",
            headers: await headers(),
          },
        ),
        [200, 202, 204, 404],
      );
    },
    async putPostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }) {
      await readJson<unknown>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${input.serverName}/databases/${input.databaseName}`,
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
        ),
      );
    },
    async deletePostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }) {
      await requireAzureStatus(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${input.serverName}/databases/${input.databaseName}`,
            "2023-06-01-preview",
          ),
          {
            method: "DELETE",
            headers: await headers(),
          },
        ),
        [200, 202, 204, 404],
      );
    },
  };
}
