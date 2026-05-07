import {
  PUBLISHING_BUNDLE_PATHS,
  scanRepositoryCompatibility,
  type RepositoryFileMap,
} from "./compatibility";

type GitHubReadinessClient = {
  readRepositoryTextFiles(input: {
    owner: string;
    name: string;
    ref: string;
    paths: string[];
  }): Promise<Record<string, string>>;
};

type VerifyImportedPublishReadinessInput = {
  owner: string;
  name: string;
  defaultBranch: string;
  github: GitHubReadinessClient;
};

const READINESS_PATHS = [
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
const REQUIRED_READINESS_PATHS = ["package.json", ...PUBLISHING_BUNDLE_PATHS];

function removePublishingBundlePaths(files: RepositoryFileMap) {
  const compatibilityFiles = { ...files };

  for (const path of PUBLISHING_BUNDLE_PATHS) {
    delete compatibilityFiles[path];
  }

  return compatibilityFiles;
}

function formatFinding({
  path,
  message,
}: {
  path?: string;
  message: string;
}) {
  return path ? `${path}: ${message}` : message;
}

export async function verifyImportedPublishReadiness({
  owner,
  name,
  defaultBranch,
  github,
}: VerifyImportedPublishReadinessInput) {
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: defaultBranch,
    paths: READINESS_PATHS,
  });
  const missingPaths = REQUIRED_READINESS_PATHS.filter(
    (path) => !Object.prototype.hasOwnProperty.call(files, path),
  );
  const compatibility = scanRepositoryCompatibility(
    removePublishingBundlePaths(files),
  );
  const packageIssues = compatibility.findings
    .filter((finding) => finding.code !== "FILE_CONFLICT")
    .map(formatFinding);

  return {
    ready: missingPaths.length === 0 && packageIssues.length === 0,
    missingPaths,
    packageIssues,
  };
}
