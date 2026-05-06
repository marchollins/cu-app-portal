import { PUBLISHING_BUNDLE_PATHS } from "./compatibility";

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

const READINESS_PATHS = ["package.json", ...PUBLISHING_BUNDLE_PATHS];

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
  const missingPaths = READINESS_PATHS.filter(
    (path) => !Object.prototype.hasOwnProperty.call(files, path),
  );

  return {
    ready: missingPaths.length === 0,
    missingPaths,
  };
}
