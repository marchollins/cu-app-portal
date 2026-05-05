import {
  PUBLISHING_BUNDLE_PATHS,
  scanRepositoryCompatibility,
} from "./compatibility";
import { planPublishingBundle } from "./publishing-bundle";

type PreparationMode = "DIRECT_COMMIT" | "PULL_REQUEST";

type GitHubPreparationClient = {
  readRepositoryTextFiles(input: {
    owner: string;
    name: string;
    ref: string;
    paths: string[];
  }): Promise<Record<string, string>>;
  commitFiles(input: {
    owner: string;
    name: string;
    branch: string;
    message: string;
    files: Record<string, string>;
  }): Promise<{ commitSha: string }>;
  createPullRequestWithFiles(input: {
    owner: string;
    name: string;
    baseBranch: string;
    branch: string;
    title: string;
    body: string;
    message: string;
    files: Record<string, string>;
  }): Promise<{ commitSha: string; pullRequestUrl: string }>;
};

type PrepareImportedRepositoryInput = {
  appName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  mode: PreparationMode;
  github: GitHubPreparationClient;
};

const READ_PATHS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "pnpm-workspace.yaml",
  "turbo.json",
  "lerna.json",
  "nx.json",
  ...PUBLISHING_BUNDLE_PATHS,
];

function buildPullRequestBody(appName: string) {
  return [
    `This PR prepares ${appName} for Cedarville App Portal-managed Azure publishing.`,
    "",
    "Changes:",
    "- Adds the Azure App Service deployment workflow.",
    "- Adds the App Portal deployment manifest.",
    "- Adds publishing docs and fallback Codex skill.",
    "- Adds narrow package.json runtime defaults when missing.",
  ].join("\n");
}

export async function prepareImportedRepository({
  appName,
  owner,
  name,
  defaultBranch,
  mode,
  github,
}: PrepareImportedRepositoryInput) {
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: defaultBranch,
    paths: READ_PATHS,
  });
  const compatibility = scanRepositoryCompatibility(files);

  if (compatibility.status === "CONFLICTED") {
    throw new Error("Repository has publishing file conflicts.");
  }

  if (compatibility.status === "UNSUPPORTED") {
    throw new Error("Repository is not compatible with v1 Azure publishing.");
  }

  const plan = planPublishingBundle({
    appName,
    repositoryOwner: owner,
    repositoryName: name,
    files,
  });

  if (mode === "DIRECT_COMMIT") {
    const commit = await github.commitFiles({
      owner,
      name,
      branch: defaultBranch,
      message: "Add Azure publishing support",
      files: plan.filesToWrite,
    });

    return {
      status: "COMMITTED" as const,
      commitSha: commit.commitSha,
      pullRequestUrl: null,
    };
  }

  const branch = "portal/add-azure-publishing";
  const pullRequest = await github.createPullRequestWithFiles({
    owner,
    name,
    baseBranch: defaultBranch,
    branch,
    title: "Add Azure publishing support",
    body: buildPullRequestBody(appName),
    message: "Add Azure publishing support",
    files: plan.filesToWrite,
  });

  return {
    status: "PULL_REQUEST_OPENED" as const,
    commitSha: pullRequest.commitSha,
    pullRequestUrl: pullRequest.pullRequestUrl,
  };
}
