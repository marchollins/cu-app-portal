import { createSign } from "node:crypto";
import sodium from "libsodium-wrappers";
import type { GitHubRepoVisibility } from "./config";

type FetchLike = typeof fetch;

type GitHubAppClientOptions = {
  appId: string;
  privateKey: string;
  installationId: string;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
};

type CreateRepositoryInput = {
  owner: string;
  name: string;
  visibility: GitHubRepoVisibility;
  files: Record<string, string>;
  defaultBranch: string;
};

type AddRepositoryCollaboratorInput = {
  owner: string;
  name: string;
  username: string;
  permission: "pull" | "triage" | "push" | "maintain" | "admin";
};

type SetActionsSecretInput = {
  owner: string;
  name: string;
  secretName: string;
  secretValue: string;
};

type DispatchWorkflowInput = {
  owner: string;
  name: string;
  workflowFileName: string;
  ref: string;
};

type GetLatestWorkflowRunInput = {
  owner: string;
  name: string;
  workflowFileName: string;
  branch: string;
};

type GitHubBlobResponse = {
  sha: string;
};

type GitHubCommitResponse = {
  sha: string;
  tree?: {
    sha: string;
  };
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

type GitHubRefResponse = {
  object: {
    sha: string;
  };
};

type GitHubActionsPublicKeyResponse = {
  key_id: string;
  key: string;
};

type GitHubWorkflowRunsResponse = {
  workflow_runs: Array<{
    id: number;
    html_url: string;
    status: string;
    conclusion: string | null;
  }>;
};

type GitHubApiError = Error & {
  status?: number;
};

const GIT_REPO_INIT_RETRY_DELAYS_MS = [250, 500, 1000];

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
  const responseText = await response.text();
  const responseJson = responseText ? (JSON.parse(responseText) as T) : null;

  if (!response.ok) {
    const error = new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}${
        responseJson &&
        typeof responseJson === "object" &&
        responseJson !== null &&
        "message" in responseJson &&
        typeof responseJson.message === "string"
          ? ` - ${responseJson.message}`
          : ""
      }`,
    ) as GitHubApiError;
    error.status = response.status;

    throw error;
  }

  return responseJson as T;
}

async function requireGitHubStatus(response: Response, expectedStatuses: number[]) {
  if (expectedStatuses.includes(response.status)) {
    return;
  }

  if (!response.ok) {
    await readJson<unknown>(response);
    return;
  }

  const statusText = response.statusText ? ` ${response.statusText}` : "";

  throw new Error(
    `GitHub API request returned unexpected status: ${response.status}${statusText}.`,
  );
}

function githubPathSegment(value: string) {
  return encodeURIComponent(value);
}

function isRetriableGitHubConflict(error: unknown) {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 409
  );
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function encryptGitHubSecret(publicKey: string, secretValue: string) {
  await sodium.ready;
  const binaryKey = sodium.from_base64(
    publicKey,
    sodium.base64_variants.ORIGINAL,
  );
  const binarySecret = sodium.from_string(secretValue);
  const encrypted = sodium.crypto_box_seal(binarySecret, binaryKey);

  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

export function createGitHubAppClient({
  appId,
  privateKey,
  installationId,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
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
            auto_init: true,
          }),
        },
      );
      const repository = await readJson<GitHubRepositoryResponse>(
        createRepoResponse,
      );

      let updatedRepository: GitHubRepositoryResponse | null = null;

      for (let attempt = 0; attempt <= GIT_REPO_INIT_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const defaultBranchRef = await readJson<GitHubRefResponse>(
            await fetchImpl(
              `https://api.github.com/repos/${owner}/${name}/git/ref/heads/${repository.default_branch}`,
              {
                method: "GET",
                headers,
              },
            ),
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
                parents: [defaultBranchRef.object.sha],
              }),
            },
          );
          const commit = await readJson<GitHubCommitResponse>(commitResponse);

          const refResponse = await fetchImpl(
            `https://api.github.com/repos/${owner}/${name}/git/refs/heads/${repository.default_branch}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                sha: commit.sha,
                force: false,
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
          updatedRepository = await readJson<GitHubRepositoryResponse>(
            updateRepoResponse,
          );
          break;
        } catch (error) {
          if (
            !isRetriableGitHubConflict(error) ||
            attempt === GIT_REPO_INIT_RETRY_DELAYS_MS.length
          ) {
            throw error;
          }

          await sleepImpl(GIT_REPO_INIT_RETRY_DELAYS_MS[attempt]);
        }
      }

      if (!updatedRepository) {
        throw new Error("GitHub repository initialization did not complete.");
      }

      return {
        owner: updatedRepository.owner.login,
        name: updatedRepository.name,
        url: updatedRepository.html_url,
        defaultBranch: updatedRepository.default_branch,
      };
    },
    async addRepositoryCollaborator({
      owner,
      name,
      username,
      permission,
    }: AddRepositoryCollaboratorInput) {
      const headers = await withInstallationHeaders();
      const response = await fetchImpl(
        `https://api.github.com/repos/${owner}/${name}/collaborators/${username}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ permission }),
        },
      );

      if (response.status === 204) {
        return { status: "GRANTED" as const };
      }

      const invitation = await readJson<{ id?: number }>(response);

      return {
        status: "INVITED" as const,
        invitationId: invitation?.id ?? null,
      };
    },
    async setActionsSecret({
      owner,
      name,
      secretName,
      secretValue,
    }: SetActionsSecretInput) {
      const headers = await withInstallationHeaders();
      const encodedOwner = githubPathSegment(owner);
      const encodedName = githubPathSegment(name);
      const key = await readJson<GitHubActionsPublicKeyResponse>(
        await fetchImpl(
          `https://api.github.com/repos/${encodedOwner}/${encodedName}/actions/secrets/public-key`,
          {
            method: "GET",
            headers,
          },
        ),
      );

      const response = await fetchImpl(
        `https://api.github.com/repos/${encodedOwner}/${encodedName}/actions/secrets/${githubPathSegment(secretName)}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            encrypted_value: await encryptGitHubSecret(key.key, secretValue),
            key_id: key.key_id,
          }),
        },
      );

      await requireGitHubStatus(response, [201, 204]);
    },
    async dispatchWorkflow({
      owner,
      name,
      workflowFileName,
      ref,
    }: DispatchWorkflowInput) {
      const headers = await withInstallationHeaders();
      const response = await fetchImpl(
        `https://api.github.com/repos/${githubPathSegment(owner)}/${githubPathSegment(name)}/actions/workflows/${githubPathSegment(workflowFileName)}/dispatches`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ref }),
        },
      );

      await requireGitHubStatus(response, [204]);
    },
    async getLatestWorkflowRun({
      owner,
      name,
      workflowFileName,
      branch,
    }: GetLatestWorkflowRunInput) {
      const headers = await withInstallationHeaders();
      const data = await readJson<GitHubWorkflowRunsResponse>(
        await fetchImpl(
          `https://api.github.com/repos/${githubPathSegment(owner)}/${githubPathSegment(name)}/actions/workflows/${githubPathSegment(workflowFileName)}/runs?branch=${encodeURIComponent(branch)}&per_page=1`,
          {
            method: "GET",
            headers,
          },
        ),
      );
      const run = data.workflow_runs[0];

      if (!run) {
        throw new Error(
          `No GitHub workflow runs found for ${owner}/${name} ${workflowFileName}.`,
        );
      }

      return {
        id: String(run.id),
        url: run.html_url,
        status: run.status,
        conclusion: run.conclusion,
      };
    },
  };
}
