import {
  PUBLISHING_BUNDLE_PATHS,
  type CompatibilityFinding,
  scanRepositoryCompatibility,
} from "./compatibility";
import { planPublishingBundle } from "./publishing-bundle";

type PreparationMode = "DIRECT_COMMIT" | "PULL_REQUEST";

type GitHubPreparationClient = {
  getBranchHead(input: {
    owner: string;
    name: string;
    branch: string;
  }): Promise<{ sha: string }>;
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
    expectedHeadSha?: string;
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
    expectedHeadSha?: string;
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

function formatCompatibilityError(
  leadingMessage: string,
  findings: CompatibilityFinding[],
) {
  const details = findings
    .filter((finding) => finding.severity === "error")
    .map((finding) =>
      finding.path
        ? `${finding.path}: ${finding.message}`
        : finding.message,
    );

  return [leadingMessage, ...details].join(" ");
}

function sanitizeBranchSegment(value: string) {
  const sanitized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return sanitized || "repository";
}

export async function prepareImportedRepository({
  appName,
  owner,
  name,
  defaultBranch,
  mode,
  github,
}: PrepareImportedRepositoryInput) {
  const head = await github.getBranchHead({
    owner,
    name,
    branch: defaultBranch,
  });
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: head.sha,
    paths: READ_PATHS,
  });
  const compatibility = scanRepositoryCompatibility(files);

  if (compatibility.status === "CONFLICTED") {
    throw new Error(
      formatCompatibilityError(
        "Repository has publishing file conflicts.",
        compatibility.findings,
      ),
    );
  }

  if (compatibility.status === "UNSUPPORTED") {
    throw new Error(
      formatCompatibilityError(
        "Repository is not compatible with v1 Azure publishing.",
        compatibility.findings,
      ),
    );
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
      expectedHeadSha: head.sha,
      files: plan.filesToWrite,
    });

    return {
      status: "COMMITTED" as const,
      commitSha: commit.commitSha,
      pullRequestUrl: null,
    };
  }

  const branch = `portal/add-azure-publishing-${sanitizeBranchSegment(name)}`;
  const pullRequest = await github.createPullRequestWithFiles({
    owner,
    name,
    baseBranch: defaultBranch,
    branch,
    title: "Add Azure publishing support",
    body: buildPullRequestBody(appName),
    message: "Add Azure publishing support",
    expectedHeadSha: head.sha,
    files: plan.filesToWrite,
  });

  return {
    status: "PULL_REQUEST_OPENED" as const,
    commitSha: pullRequest.commitSha,
    pullRequestUrl: pullRequest.pullRequestUrl,
  };
}
