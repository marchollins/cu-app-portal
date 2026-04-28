import { createSign } from "node:crypto";
import type { GitHubRepoVisibility } from "./config";

type FetchLike = typeof fetch;

type GitHubAppClientOptions = {
  appId: string;
  privateKey: string;
  installationId: string;
  fetchImpl?: FetchLike;
};

type CreateRepositoryInput = {
  owner: string;
  name: string;
  visibility: GitHubRepoVisibility;
  files: Record<string, string>;
  defaultBranch: string;
};

type GitHubBlobResponse = {
  sha: string;
};

type GitHubCommitResponse = {
  sha: string;
};

type GitHubTreeResponse = {
  sha: string;
};

type GitHubRepositoryResponse = {
  html_url: string;
  default_branch: string;
  name: string;
  owner: {
    login: string;
  };
};

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createGitHubAppJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64UrlJson({
    alg: "RS256",
    typ: "JWT",
  });
  const encodedPayload = base64UrlJson({
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  });
  const signer = createSign("RSA-SHA256");
  const body = `${encodedHeader}.${encodedPayload}`;
  signer.update(body);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");

  return `${body}.${signature}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export function createGitHubAppClient({
  appId,
  privateKey,
  installationId,
  fetchImpl = fetch,
}: GitHubAppClientOptions) {
  async function createInstallationToken() {
    const response = await fetchImpl(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${createGitHubAppJwt(appId, privateKey)}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    const data = await readJson<{ token: string }>(response);

    return data.token;
  }

  async function withInstallationHeaders() {
    const token = await createInstallationToken();

    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  return {
    async createRepository({
      owner,
      name,
      visibility,
      files,
      defaultBranch,
    }: CreateRepositoryInput) {
      const headers = await withInstallationHeaders();
      const createRepoResponse = await fetchImpl(
        `https://api.github.com/orgs/${owner}/repos`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            name,
            visibility,
            auto_init: false,
          }),
        },
      );
      const repository = await readJson<GitHubRepositoryResponse>(
        createRepoResponse,
      );

      const tree = [];

      for (const [filePath, content] of Object.entries(files)) {
        const blobResponse = await fetchImpl(
          `https://api.github.com/repos/${owner}/${name}/git/blobs`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              content,
              encoding: "utf-8",
            }),
          },
        );
        const blob = await readJson<GitHubBlobResponse>(blobResponse);

        tree.push({
          path: filePath,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }

      const treeResponse = await fetchImpl(
        `https://api.github.com/repos/${owner}/${name}/git/trees`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ tree }),
        },
      );
      const createdTree = await readJson<GitHubTreeResponse>(treeResponse);

      const commitResponse = await fetchImpl(
        `https://api.github.com/repos/${owner}/${name}/git/commits`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: "Initial portal app source",
            tree: createdTree.sha,
            parents: [],
          }),
        },
      );
      const commit = await readJson<GitHubCommitResponse>(commitResponse);

      const refResponse = await fetchImpl(
        `https://api.github.com/repos/${owner}/${name}/git/refs`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ref: `refs/heads/${defaultBranch}`,
            sha: commit.sha,
          }),
        },
      );
      await readJson<{ ref: string }>(refResponse);

      const updateRepoResponse = await fetchImpl(
        `https://api.github.com/repos/${owner}/${name}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            default_branch: defaultBranch,
          }),
        },
      );
      const updatedRepository = await readJson<GitHubRepositoryResponse>(
        updateRepoResponse,
      );

      return {
        owner: updatedRepository.owner.login,
        name: updatedRepository.name,
        url: updatedRepository.html_url,
        defaultBranch: updatedRepository.default_branch,
      };
    },
  };
}
