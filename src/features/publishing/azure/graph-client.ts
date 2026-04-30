type FetchLike = typeof fetch;

type MicrosoftGraphClientOptions = {
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
  }

  const body = text ? (JSON.parse(text) as T) : null;

  return body as T;
}

export function createMicrosoftGraphClient({
  tokenProvider,
  fetchImpl = fetch,
}: MicrosoftGraphClientOptions) {
  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  return {
    async ensureRedirectUri({
      applicationObjectId,
      redirectUri,
    }: {
      applicationObjectId: string;
      redirectUri: string;
    }) {
      const application = await readJson<{ web?: { redirectUris?: string[] } }>(
        await fetchImpl(
          `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
          { method: "GET", headers: await headers() },
        ),
      );
      const redirectUris = application.web?.redirectUris ?? [];

      if (redirectUris.includes(redirectUri)) {
        return;
      }

      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
        {
          method: "PATCH",
          headers: await headers(),
          body: JSON.stringify({
            web: { redirectUris: [...redirectUris, redirectUri] },
          }),
        },
      );

      if (response.status !== 204) {
        const text = await response.text();
        throw new Error(
          `Microsoft Graph request failed: ${response.status} ${text}`,
        );
      }
    },
  };
}
