import { describe, expect, it, vi } from "vitest";

import { createMicrosoftGraphClient } from "./graph-client";

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

describe("createMicrosoftGraphClient", () => {
  it("adds a redirect uri only when it is missing", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ web: { redirectUris: ["https://old/cb"] } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.ensureRedirectUri({
      applicationObjectId: "app-object-id",
      redirectUri:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://graph.microsoft.com/v1.0/applications/app-object-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          web: {
            redirectUris: [
              "https://old/cb",
              "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
            ],
          },
        }),
      }),
    );
  });

  it("does not patch when the redirect uri already exists", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          web: {
            redirectUris: [
              "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
            ],
          },
        }),
      );
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.ensureRedirectUri({
      applicationObjectId: "app-object-id",
      redirectUri:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/applications/app-object-id",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a federated credential for a repository branch", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ id: "credential-id" }, { status: 201 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.ensureFederatedCredential({
      applicationAppId: "client-id",
      name: "github-campus-dashboard-clx9abc1",
      repository: "cedarville-it/campus-dashboard",
      branch: "main",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "github-campus-dashboard-clx9abc1",
          issuer: "https://token.actions.githubusercontent.com",
          subject: "repo:cedarville-it/campus-dashboard:ref:refs/heads/main",
          audiences: ["api://AzureADTokenExchange"],
        }),
      }),
    );
  });

  it("treats an existing federated credential as already configured", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(text("already exists", { status: 409 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.ensureFederatedCredential({
        applicationAppId: "client-id",
        name: "github-campus-dashboard-clx9abc1",
        repository: "cedarville-it/campus-dashboard",
        branch: "main",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws the Graph response status and text for non-JSON error bodies", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("plain Graph failure", { status: 500 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.ensureRedirectUri({
        applicationObjectId: "app-object-id",
        redirectUri:
          "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
      }),
    ).rejects.toThrow(
      "Microsoft Graph request failed: 500 plain Graph failure",
    );
  });

  it.each([200, 202])(
    "throws the Graph response status and text when PATCH returns %s",
    async (status) => {
      const fetchImpl = vi
        .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
        .mockResolvedValueOnce(json({ web: { redirectUris: [] } }))
        .mockResolvedValueOnce(text("unexpected patch status", { status }));
      const client = createMicrosoftGraphClient({
        tokenProvider: async () => "token",
        fetchImpl,
      });

      await expect(
        client.ensureRedirectUri({
          applicationObjectId: "app-object-id",
          redirectUri:
            "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
        }),
      ).rejects.toThrow(
        `Microsoft Graph request failed: ${status} unexpected patch status`,
      );
    },
  );
});
