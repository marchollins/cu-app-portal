// @vitest-environment node

import { generateKeyPairSync } from "node:crypto";
import sodium from "libsodium-wrappers";
import { describe, expect, it, vi } from "vitest";
import { createGitHubAppClient } from "./github-app";

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("createGitHubAppClient", () => {
  it("sets an actions secret using the repository public key", async () => {
    await sodium.ready;
    const { publicKey } = sodium.crypto_box_keypair();
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          key_id: "key-id-123",
          key: sodium.to_base64(publicKey, sodium.base64_variants.ORIGINAL),
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await client.setActionsSecret({
      owner: "cedarville-it",
      name: "campus-dashboard",
      secretName: "AZURE_CLIENT_ID",
      secretValue: "client-id",
    });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/cedarville-it/campus-dashboard/actions/secrets/AZURE_CLIENT_ID",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls.at(-1)?.[1]?.body))).toEqual({
      key_id: "key-id-123",
      encrypted_value: expect.any(String),
    });
  });

  it("encodes actions secret path segments", async () => {
    await sodium.ready;
    const { publicKey } = sodium.crypto_box_keypair();
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          key_id: "key-id-123",
          key: sodium.to_base64(publicKey, sodium.base64_variants.ORIGINAL),
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await client.setActionsSecret({
      owner: "cedarville it",
      name: "campus/dashboard",
      secretName: "AZURE CLIENT/ID",
      secretValue: "client-id",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/cedarville%20it/campus%2Fdashboard/actions/secrets/public-key",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/cedarville%20it/campus%2Fdashboard/actions/secrets/AZURE%20CLIENT%2FID",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("dispatches a workflow and finds the newest run", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          workflow_runs: [
            {
              id: 123456789,
              html_url:
                "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
              status: "queued",
              conclusion: null,
            },
          ],
        }),
      );

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await client.dispatchWorkflow({
      owner: "cedarville-it",
      name: "campus-dashboard",
      workflowFileName: "deploy-azure-app-service.yml",
      ref: "main",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/cedarville-it/campus-dashboard/actions/workflows/deploy-azure-app-service.yml/dispatches",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ref: "main" }),
      }),
    );

    const run = await client.getLatestWorkflowRun({
      owner: "cedarville-it",
      name: "campus-dashboard",
      workflowFileName: "deploy-azure-app-service.yml",
      branch: "main",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://api.github.com/repos/cedarville-it/campus-dashboard/actions/workflows/deploy-azure-app-service.yml/runs?branch=main&per_page=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(run).toEqual({
      id: "123456789",
      url: "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
      status: "queued",
      conclusion: null,
    });
  });

  it("encodes workflow path segments", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          workflow_runs: [
            {
              id: 123456789,
              html_url:
                "https://github.com/cedarville-it/campus-dashboard/actions/runs/123456789",
              status: "queued",
              conclusion: null,
            },
          ],
        }),
      );

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await client.dispatchWorkflow({
      owner: "cedarville it",
      name: "campus/dashboard",
      workflowFileName: "deploy azure/app service.yml",
      ref: "main",
    });

    await client.getLatestWorkflowRun({
      owner: "cedarville it",
      name: "campus/dashboard",
      workflowFileName: "deploy azure/app service.yml",
      branch: "feature/deploy",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/cedarville%20it/campus%2Fdashboard/actions/workflows/deploy%20azure%2Fapp%20service.yml/dispatches",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://api.github.com/repos/cedarville%20it/campus%2Fdashboard/actions/workflows/deploy%20azure%2Fapp%20service.yml/runs?branch=feature%2Fdeploy&per_page=1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects unexpected successful workflow dispatch statuses", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(createJsonResponse({ accepted: true }, { status: 202 }));

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await expect(
      client.dispatchWorkflow({
        owner: "cedarville-it",
        name: "campus-dashboard",
        workflowFileName: "deploy-azure-app-service.yml",
        ref: "main",
      }),
    ).rejects.toThrow("GitHub API request returned unexpected status: 202.");
  });

  it("retries git initialization when GitHub returns a transient 409 conflict", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          html_url: "https://github.com/cedarville-it/campus-dashboard",
          default_branch: "main",
          name: "campus-dashboard",
          owner: { login: "cedarville-it" },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          { message: "Git Repository is empty." },
          { status: 409, statusText: "Conflict" },
        ),
      )
      .mockResolvedValueOnce(createJsonResponse({ object: { sha: "seed-commit-sha" } }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "blob-sha-1" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "tree-sha-1" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "commit-sha-1" }))
      .mockResolvedValueOnce(createJsonResponse({ ref: "refs/heads/main" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          html_url: "https://github.com/cedarville-it/campus-dashboard",
          default_branch: "main",
          name: "campus-dashboard",
          owner: { login: "cedarville-it" },
        }),
      );

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
      sleepImpl,
    });

    const repository = await client.createRepository({
      owner: "cedarville-it",
      name: "campus-dashboard",
      visibility: "private",
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      defaultBranch: "main",
    });

    expect(repository.url).toBe(
      "https://github.com/cedarville-it/campus-dashboard",
    );
    expect(sleepImpl).toHaveBeenCalledWith(250);
    expect(fetchImpl).toHaveBeenCalledTimes(9);
  });
});
