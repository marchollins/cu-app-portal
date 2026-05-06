import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitHubRepoVisibility } from "@/features/repositories/config";

type RepositoryMetadata = {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
};

type RepositoryImportStage =
  | "create-target"
  | "clone"
  | "push"
  | "set-default-branch";

type GitExec = (
  command: string,
  args: string[],
  options: { cwd: string; stdio: "ignore" },
) => Promise<void>;

type ImportRepositoryWithHistoryInput = {
  source: RepositoryMetadata;
  target: {
    owner: string;
    name: string;
    visibility: GitHubRepoVisibility;
  };
  github: {
    createInstallationTokenForGit: () => Promise<string>;
    createRepository: (input: {
      owner: string;
      name: string;
      visibility: GitHubRepoVisibility;
      files: Record<string, string>;
      defaultBranch: string;
      autoInit: false;
      reuseIfAlreadyExists: false;
    }) => Promise<RepositoryMetadata>;
    updateRepositoryDefaultBranch: (input: {
      owner: string;
      name: string;
      defaultBranch: string;
    }) => Promise<RepositoryMetadata>;
  };
  sourceGithub?: {
    createInstallationTokenForGit: () => Promise<string>;
  };
  exec?: GitExec;
};

export class RepositoryImportError extends Error {
  readonly stage: RepositoryImportStage;
  readonly targetRepository?: RepositoryMetadata;
  readonly code?: "TARGET_REPOSITORY_ALREADY_EXISTS";

  constructor({
    message,
    stage,
    targetRepository,
    code,
  }: {
    message: string;
    stage: RepositoryImportStage;
    targetRepository?: RepositoryMetadata;
    code?: "TARGET_REPOSITORY_ALREADY_EXISTS";
  }) {
    super(message);
    this.name = "RepositoryImportError";
    this.stage = stage;
    this.targetRepository = targetRepository;
    this.code = code;
  }
}

function defaultExec(
  command: string,
  args: string[],
  options: { cwd: string; stdio: "ignore" },
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, options);

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function createTokenRemote({
  owner,
  name,
  token,
}: {
  owner: string;
  name: string;
  token: string;
}) {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${name}.git`;
}

function createPublicRemote({ owner, name }: { owner: string; name: string }) {
  return `https://github.com/${owner}/${name}.git`;
}

function isPossibleTargetCollision(error: unknown) {
  return (
    error instanceof Error &&
    (("status" in error && error.status === 422) ||
      /already exists|name already exists/i.test(error.message))
  );
}

function toImportError({
  error,
  stage,
  targetRepository,
}: {
  error: unknown;
  stage: RepositoryImportStage;
  targetRepository?: RepositoryMetadata;
}) {
  if (stage === "create-target" && isPossibleTargetCollision(error)) {
    return new RepositoryImportError({
      message: "Target repository already exists.",
      stage,
      code: "TARGET_REPOSITORY_ALREADY_EXISTS",
    });
  }

  return new RepositoryImportError({
    message:
      stage === "set-default-branch"
        ? "Repository import failed while setting the target default branch."
        : "Repository import failed while mirroring git history.",
    stage,
    targetRepository,
  });
}

export async function importRepositoryWithHistory({
  source,
  target,
  github,
  sourceGithub,
  exec = defaultExec,
}: ImportRepositoryWithHistoryInput) {
  const tempRoot = await mkdtemp(join(tmpdir(), "portal-repository-import-"));
  let repository: RepositoryMetadata | undefined;

  try {
    try {
      repository = await github.createRepository({
        owner: target.owner,
        name: target.name,
        visibility: target.visibility,
        files: {},
        defaultBranch: source.defaultBranch,
        autoInit: false,
        reuseIfAlreadyExists: false,
      });
    } catch (error) {
      throw toImportError({ error, stage: "create-target" });
    }

    const targetToken = await github.createInstallationTokenForGit();
    const sourceToken = sourceGithub
      ? await sourceGithub.createInstallationTokenForGit()
      : null;
    const mirrorDir = join(tempRoot, "source.git");

    try {
      await exec(
        "git",
        [
          "clone",
          "--mirror",
          sourceToken
            ? createTokenRemote({
                owner: source.owner,
                name: source.name,
                token: sourceToken,
              })
            : createPublicRemote({ owner: source.owner, name: source.name }),
          mirrorDir,
        ],
        { cwd: tempRoot, stdio: "ignore" },
      );
    } catch (error) {
      throw toImportError({ error, stage: "clone", targetRepository: repository });
    }

    try {
      await exec(
        "git",
        [
          "push",
          "--mirror",
          createTokenRemote({
            owner: repository.owner,
            name: repository.name,
            token: targetToken,
          }),
        ],
        { cwd: mirrorDir, stdio: "ignore" },
      );
    } catch (error) {
      throw toImportError({ error, stage: "push", targetRepository: repository });
    }

    try {
      return await github.updateRepositoryDefaultBranch({
        owner: repository.owner,
        name: repository.name,
        defaultBranch: source.defaultBranch,
      });
    } catch (error) {
      throw toImportError({
        error,
        stage: "set-default-branch",
        targetRepository: repository,
      });
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
