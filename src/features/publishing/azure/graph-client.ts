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

  function federatedCredentialsUrl(applicationAppId: string) {
    return `https://graph.microsoft.com/v1.0/applications(appId='${applicationAppId}')/federatedIdentityCredentials`;
  }

  function federatedCredentialUrl(
    applicationAppId: string,
    credentialId: string,
  ) {
    return `${federatedCredentialsUrl(applicationAppId)}/${credentialId}`;
  }

  function federatedCredentialPayload({
    name,
    repository,
    branch,
  }: {
    name: string;
    repository: string;
    branch: string;
  }) {
    return {
      name,
      issuer: "https://token.actions.githubusercontent.com",
      subject: `repo:${repository}:ref:refs/heads/${branch}`,
      audiences: ["api://AzureADTokenExchange"],
    };
  }

  async function listFederatedCredentials({
    applicationAppId,
  }: {
    applicationAppId: string;
  }) {
    const data = await readJson<{
      value?: Array<{ id: string; name: string; subject?: string }>;
    }>(
      await fetchImpl(federatedCredentialsUrl(applicationAppId), {
        method: "GET",
        headers: await headers(),
      }),
    );

    return data.value ?? [];
  }

  async function deleteFederatedCredential({
    applicationAppId,
    credentialId,
  }: {
    applicationAppId: string;
    credentialId: string;
  }) {
    const response = await fetchImpl(
      federatedCredentialUrl(applicationAppId, credentialId),
      {
        method: "DELETE",
        headers: await headers(),
      },
    );

    if (response.status !== 204 && response.status !== 404) {
      const text = await response.text();
      throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
    }
  }

  async function replaceFederatedCredential({
    applicationAppId,
    name,
    repository,
    branch,
  }: {
    applicationAppId: string;
    name: string;
    repository: string;
    branch: string;
  }) {
    const credentials = await listFederatedCredentials({ applicationAppId });
    const existing = credentials.find((credential) => credential.name === name);

    if (existing) {
      await deleteFederatedCredential({
        applicationAppId,
        credentialId: existing.id,
      });
    }

    await readJson<unknown>(
      await fetchImpl(federatedCredentialsUrl(applicationAppId), {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(
          federatedCredentialPayload({ name, repository, branch }),
        ),
      }),
    );
  }

  async function hasRedirectUri({
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

    return { exists: Boolean(application.web?.redirectUris?.includes(redirectUri)) };
  }

  return {
    listFederatedCredentials,
    deleteFederatedCredential,
    replaceFederatedCredential,
    hasRedirectUri,
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
    async ensureFederatedCredential({
      applicationAppId,
      name,
      repository,
      branch,
    }: {
      applicationAppId: string;
      name: string;
      repository: string;
      branch: string;
    }) {
      const response = await fetchImpl(
        federatedCredentialsUrl(applicationAppId),
        {
          method: "POST",
          headers: await headers(),
          body: JSON.stringify(
            federatedCredentialPayload({ name, repository, branch }),
          ),
        },
      );

      if (response.status === 409) {
        return;
      }

      await readJson<unknown>(response);
    },
  };
}
