import { z } from "zod";
import { createGitHubAppClient } from "./github-app";
import { loadGitHubAppConfig, type GitHubAppConfig } from "./config";

const githubUsernameSchema = z
  .string()
  .trim()
  .min(1, "Enter your GitHub username.")
  .max(39, "GitHub usernames are at most 39 characters.")
  .regex(
    /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i,
    "Enter a valid GitHub username.",
  );

function resolveInstallationId(config: GitHubAppConfig, owner: string) {
  const installationId = config.installationIdsByOrg[owner];

  if (!installationId) {
    throw new Error(`No GitHub App installation is configured for org "${owner}".`);
  }

  return installationId;
}

export function parseGitHubUsername(value: unknown) {
  return githubUsernameSchema.parse(value);
}

export async function grantManagedRepositoryAccess(
  {
    owner,
    repositoryName,
    githubUsername,
  }: {
    owner: string;
    repositoryName: string;
    githubUsername: string;
  },
  config: GitHubAppConfig = loadGitHubAppConfig(),
) {
  const client = createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: resolveInstallationId(config, owner),
  });

  return client.addRepositoryCollaborator({
    owner,
    name: repositoryName,
    username: parseGitHubUsername(githubUsername),
    permission: "push",
  });
}
