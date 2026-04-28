import { generateKeyPairSync } from "node:crypto";
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
