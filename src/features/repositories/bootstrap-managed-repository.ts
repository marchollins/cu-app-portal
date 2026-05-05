import type { CreateAppRequestInput } from "@/features/app-requests/types";
import {
  buildDeploymentManifest,
  type DeploymentManifestInput,
} from "@/features/generation/deployment-manifest";
import type { GitHubAppConfig } from "./config";
import { loadGitHubAppConfig } from "./config";
import { createGitHubAppClient } from "./github-app";

type BootstrapManagedRepositoryInput = {
  appRequestId: string;
  input: CreateAppRequestInput;
  files: Record<string, string>;
  reuseExistingRepository?: boolean;
  config?: GitHubAppConfig;
};

export type BootstrapManagedRepositoryResult = {
  provider: "GITHUB";
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  visibility: "private" | "internal" | "public";
};

function resolveInstallationId(config: GitHubAppConfig, owner: string) {
  const installationId = config.installationIdsByOrg[owner];

  if (!installationId) {
    throw new Error(`No GitHub App installation is configured for org "${owner}".`);
  }

  return installationId;
}

export async function bootstrapManagedRepository({
  input,
  files,
  reuseExistingRepository = false,
  config = loadGitHubAppConfig(),
}: BootstrapManagedRepositoryInput): Promise<BootstrapManagedRepositoryResult> {
  const owner = config.defaultOrg;

  if (!config.allowedOrgs.includes(owner)) {
    throw new Error(`Configured GitHub org "${owner}" is not allowed.`);
  }

  if (input.hostingTarget !== "Azure App Service") {
    throw new Error(
      `Managed repository bootstrap currently supports Azure App Service only, received "${input.hostingTarget}".`,
    );
  }

  const manifest = buildDeploymentManifest(input as DeploymentManifestInput);
  const client = createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: resolveInstallationId(config, owner),
  });

  const repository = await client.createRepository({
    owner,
    name: manifest.defaults.githubRepository,
    visibility: config.defaultRepoVisibility,
    files,
    defaultBranch: "main",
    ...(reuseExistingRepository ? { reuseIfAlreadyExists: true } : {}),
  });

  return {
    provider: "GITHUB",
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    defaultBranch: repository.defaultBranch,
    visibility: config.defaultRepoVisibility,
  };
}
