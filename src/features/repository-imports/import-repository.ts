import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  | "target-token"
  | "source-token"
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

class GitCommandError extends Error {
  readonly stderr: string;

  constructor({
    command,
    code,
    stderr,
  }: {
    command: string;
    code: number | null;
    stderr: string;
  }) {
    super(`${command} exited with code ${code ?? "unknown"}.`);
    this.name = "GitCommandError";
    this.stderr = stderr;
  }
}

function defaultExec(
  command: string,
  args: string[],
  options: { cwd: string; stdio: "ignore" },
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new GitCommandError({ command, code, stderr }));
    });
  });
}

function createRemote({ owner, name }: { owner: string; name: string }) {
  return `https://github.com/${owner}/${name}.git`;
}

async function writeCredentialStore(path: string, token: string) {
  await writeFile(
    path,
    `https://x-access-token:${encodeURIComponent(token)}@github.com\n`,
    { mode: 0o600 },
  );
}

function credentialHelperArgs(path: string) {
  return ["-c", `credential.helper=store --file=${path}`];
}

function isPossibleTargetCollision(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if (
    /name.*already exists|already exists.*name|already exists on this account/i.test(
      error.message,
    )
  ) {
    return true;
  }

  if (
    "errors" in error &&
    Array.isArray(error.errors) &&
    error.errors.some((detail) => {
      if (!detail || typeof detail !== "object") {
        return false;
      }

      const field = "field" in detail ? String(detail.field) : "";
      const message = "message" in detail ? String(detail.message) : "";
      const code = "code" in detail ? String(detail.code) : "";

      return (
        field.toLowerCase() === "name" &&
        /already exists|exists on this account|already_exists/i.test(
          `${message} ${code}`,
        )
      );
    })
  ) {
    return true;
  }

  return false;
}

function isTargetCreationValidationError(error: unknown) {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 422
  );
}

function summarizeImportError({
  error,
  stage,
}: {
  error: unknown;
  stage: RepositoryImportStage;
}) {
  if (stage === "clone") {
    return appendGitErrorDetail(
      "Repository import failed while cloning source repository",
      error,
    );
  }

  if (stage === "push") {
    return appendGitErrorDetail(
      "Repository import failed while pushing history to target repository",
      error,
    );
  }

  if (stage === "create-target" && isTargetCreationValidationError(error)) {
    return "Repository import failed while creating the target repository.";
  }

  if (stage === "target-token" || stage === "source-token") {
    return "Repository import failed while preparing git authentication.";
  }

  if (stage === "set-default-branch") {
    return "Repository import failed while setting the target default branch.";
  }

  return "Repository import failed while mirroring git history.";
}

function appendGitErrorDetail(message: string, error: unknown) {
  const detail = summarizeGitErrorDetail(error);

  return detail ? `${message}: ${detail}` : `${message}.`;
}

function summarizeGitErrorDetail(error: unknown) {
  const rawDetail = getGitErrorText(error);

  if (!rawDetail) {
    return null;
  }

  return sanitizeGitErrorDetail(rawDetail).slice(0, 600);
}

function getGitErrorText(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "stderr" in error &&
    typeof error.stderr === "string" &&
    error.stderr.trim()
  ) {
    return error.stderr;
  }

  return error instanceof Error && error.message.trim() ? error.message : null;
}

function sanitizeGitErrorDetail(value: string) {
  return value
    .replaceAll(
      /https:\/\/x-access-token:[^@\s'"]+@github\.com\/([^\s'"]+)/g,
      "https://github.com/$1",
    )
    .replaceAll(/x-access-token:[^@\s'"]+/g, "x-access-token:[redacted]")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replaceAll(/\.$/g, "");
}

function isHiddenRefPushFailure(error: unknown) {
  const detail = getGitErrorText(error);

  return detail ? /deny updating a hidden ref|hidden ref/i.test(detail) : false;
}

async function pushDefaultBranch({
  exec,
  mirrorDir,
  targetCredentialsPath,
  repository,
  defaultBranch,
}: {
  exec: GitExec;
  mirrorDir: string;
  targetCredentialsPath: string;
  repository: RepositoryMetadata;
  defaultBranch: string;
}) {
  await exec(
    "git",
    [
      ...credentialHelperArgs(targetCredentialsPath),
      "push",
      createRemote({
        owner: repository.owner,
        name: repository.name,
      }),
      `refs/heads/${defaultBranch}:refs/heads/${defaultBranch}`,
    ],
    { cwd: mirrorDir, stdio: "ignore" },
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
    message: summarizeImportError({ error, stage }),
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

    let targetToken: string;
    let sourceToken: string | null;
    const targetCredentialsPath = join(tempRoot, "target-credentials");

    try {
      targetToken = await github.createInstallationTokenForGit();
      await writeCredentialStore(targetCredentialsPath, targetToken);
    } catch (error) {
      throw toImportError({
        error,
        stage: "target-token",
        targetRepository: repository,
      });
    }

    try {
      sourceToken = sourceGithub
        ? await sourceGithub.createInstallationTokenForGit()
        : null;
      if (sourceToken) {
        await writeCredentialStore(
          join(tempRoot, "source-credentials"),
          sourceToken,
        );
      }
    } catch (error) {
      throw toImportError({
        error,
        stage: "source-token",
        targetRepository: repository,
      });
    }
    const mirrorDir = join(tempRoot, "source.git");

    try {
      await exec(
        "git",
        [
          ...(sourceToken
            ? credentialHelperArgs(join(tempRoot, "source-credentials"))
            : []),
          "clone",
          "--mirror",
          createRemote({ owner: source.owner, name: source.name }),
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
          ...credentialHelperArgs(targetCredentialsPath),
          "push",
          "--mirror",
          createRemote({
            owner: repository.owner,
            name: repository.name,
          }),
        ],
        { cwd: mirrorDir, stdio: "ignore" },
      );
    } catch (error) {
      if (!isHiddenRefPushFailure(error)) {
        throw toImportError({ error, stage: "push", targetRepository: repository });
      }

      try {
        await pushDefaultBranch({
          exec,
          mirrorDir,
          targetCredentialsPath,
          repository,
          defaultBranch: source.defaultBranch,
        });
      } catch (fallbackError) {
        throw toImportError({
          error: fallbackError,
          stage: "push",
          targetRepository: repository,
        });
      }
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
