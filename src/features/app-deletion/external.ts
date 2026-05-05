import { DefaultAzureCredential } from "@azure/identity";
import { createAzureArmClient } from "@/features/publishing/azure/arm-client";
import {
  loadAzurePublishConfig,
  type AzurePublishConfig,
} from "@/features/publishing/azure/config";
import {
  loadGitHubAppConfig,
  type GitHubAppConfig,
} from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";

type DeleteManagedGitHubRepositoryInput = {
  owner: string;
  name: string;
  config?: GitHubAppConfig;
};

export type DeleteAzureDeploymentInput = {
  resourceGroup: string | null;
  webAppName: string | null;
  postgresServer: string | null;
  databaseName: string | null;
  primaryPublishUrl?: string | null;
  repositoryOwner?: string | null;
  repositoryName?: string | null;
  repositoryDefaultBranch?: string | null;
};

type AzureDeletionDeps = {
  config: AzurePublishConfig;
  arm: {
    deleteWebApp(input: {
      resourceGroup: string;
      name: string;
    }): Promise<void>;
    deletePostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }): Promise<void>;
  };
};

function createAzureTokenProvider(scope: string) {
  const credential = new DefaultAzureCredential();

  return async () => {
    const token = await credential.getToken(scope);

    if (!token?.token) {
      throw new Error(`Azure token was not available for scope ${scope}.`);
    }

    return token.token;
  };
}

function createDefaultAzureDeletionDeps(): AzureDeletionDeps {
  const config = loadAzurePublishConfig();

  return {
    config,
    arm: createAzureArmClient({
      subscriptionId: config.azureSubscriptionId,
      tokenProvider: createAzureTokenProvider(
        "https://management.azure.com/.default",
      ),
    }),
  };
}

function resolveInstallationId(config: GitHubAppConfig, owner: string) {
  const installationId = config.installationIdsByOrg[owner];

  if (!installationId) {
    throw new Error(`No GitHub App installation is configured for org "${owner}".`);
  }

  return installationId;
}

export async function deleteManagedGitHubRepository({
  owner,
  name,
  config = loadGitHubAppConfig(),
}: DeleteManagedGitHubRepositoryInput) {
  if (!config.allowedOrgs.includes(owner)) {
    throw new Error(`GitHub org "${owner}" is not allowed for portal deletion.`);
  }

  const client = createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: resolveInstallationId(config, owner),
  });

  await client.deleteRepository({ owner, name });
}

export async function deleteAzureDeployment(
  input: DeleteAzureDeploymentInput,
  deps: AzureDeletionDeps = createDefaultAzureDeletionDeps(),
) {
  const resourceGroup = input.resourceGroup ?? deps.config.resourceGroup;
  const postgresServer = input.postgresServer ?? deps.config.postgresServer;

  if (input.webAppName) {
    await deps.arm.deleteWebApp({
      resourceGroup,
      name: input.webAppName,
    });
  }

  if (input.databaseName) {
    await deps.arm.deletePostgresDatabase({
      resourceGroup,
      serverName: postgresServer,
      databaseName: input.databaseName,
    });
  }
}
