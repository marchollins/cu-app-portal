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
      reuseIfAlreadyExists: false;
    }) => Promise<RepositoryMetadata>;
  };
  exec?: GitExec;
};

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

export async function importRepositoryWithHistory({
  source,
  target,
  github,
  exec = defaultExec,
}: ImportRepositoryWithHistoryInput) {
  const tempRoot = await mkdtemp(join(tmpdir(), "portal-repository-import-"));

  try {
    const repository = await github.createRepository({
      owner: target.owner,
      name: target.name,
      visibility: target.visibility,
      files: {},
      defaultBranch: "main",
      reuseIfAlreadyExists: false,
    });
    const token = await github.createInstallationTokenForGit();
    const mirrorDir = join(tempRoot, "source.git");

    await exec(
      "git",
      [
        "clone",
        "--mirror",
        createTokenRemote({ owner: source.owner, name: source.name, token }),
        mirrorDir,
      ],
      { cwd: tempRoot, stdio: "ignore" },
    );
    await exec(
      "git",
      [
        "push",
        "--mirror",
        createTokenRemote({
          owner: repository.owner,
          name: repository.name,
          token,
        }),
      ],
      { cwd: mirrorDir, stdio: "ignore" },
    );

    return repository;
  } catch {
    throw new Error("Repository import failed while mirroring git history.");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
