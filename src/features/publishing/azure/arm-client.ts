type FetchLike = typeof fetch;

type AzureArmClientOptions = {
  subscriptionId: string;
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Azure ARM request failed: ${response.status} ${text}`);
  }

  const body = text ? (JSON.parse(text) as T) : null;

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
