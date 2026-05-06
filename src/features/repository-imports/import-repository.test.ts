// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RepositoryImportError,
  importRepositoryWithHistory,
} from "./import-repository";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,
    mkdtemp: vi.fn(),
    rm: vi.fn(),
  };
});

describe("importRepositoryWithHistory", () => {
  beforeEach(() => {
    vi.mocked(mkdtemp).mockReset();
    vi.mocked(rm).mockReset();
  });

  it("creates an empty target repository and mirrors public source history into it", async () => {
    const tempRoot = join(tmpdir(), "portal-import-test");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      }),
      updateRepositoryDefaultBranch: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      }),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const repository = await importRepositoryWithHistory({
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github,
      exec,
    });

    expect(repository).toEqual({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "trunk",
    });
    expect(github.createRepository).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      visibility: "private",
      files: {},
      defaultBranch: "trunk",
      autoInit: false,
      reuseIfAlreadyExists: false,
    });
    expect(exec).toHaveBeenNthCalledWith(1, "git", [
      "clone",
      "--mirror",
      "https://github.com/external-org/Campus-Dashboard.git",
      join(tempRoot, "source.git"),
    ], {
      cwd: tempRoot,
      stdio: "ignore",
    });
    expect(exec).toHaveBeenNthCalledWith(2, "git", [
      "push",
      "--mirror",
      "https://x-access-token:target-token@github.com/cedarville-it/campus-dashboard.git",
    ], {
      cwd: join(tempRoot, "source.git"),
      stdio: "ignore",
    });
    expect(github.updateRepositoryDefaultBranch).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      defaultBranch: "trunk",
    });
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("uses a source installation token only for private source clone remotes", async () => {
    const tempRoot = join(tmpdir(), "portal-import-private-source");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
    };
    const sourceGithub = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("source-token"),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    await importRepositoryWithHistory({
      source: {
        owner: "external-org",
        name: "Private-Dashboard",
        url: "https://github.com/external-org/Private-Dashboard",
        defaultBranch: "main",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      sourceGithub,
      github,
      exec,
    });

    expect(exec).toHaveBeenNthCalledWith(1, "git", [
      "clone",
      "--mirror",
      "https://x-access-token:source-token@github.com/external-org/Private-Dashboard.git",
      join(tempRoot, "source.git"),
    ], {
      cwd: tempRoot,
      stdio: "ignore",
    });
    expect(exec).toHaveBeenNthCalledWith(2, "git", [
      "push",
      "--mirror",
      "https://x-access-token:target-token@github.com/cedarville-it/campus-dashboard.git",
    ], {
      cwd: join(tempRoot, "source.git"),
      stdio: "ignore",
    });
  });

  it("cleans up and preserves created target metadata when mirroring fails", async () => {
    const tempRoot = join(tmpdir(), "portal-import-failure");
    const exec = vi.fn().mockRejectedValue(
      new Error(
        "git failed for https://x-access-token:installation-token@github.com/external-org/Campus-Dashboard.git",
      ),
    );
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("installation-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const failure = await importRepositoryWithHistory({
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github,
      exec,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RepositoryImportError);
    expect(failure).toMatchObject({
      message: "Repository import failed while mirroring git history.",
      stage: "clone",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
    expect(String(failure.stack)).not.toContain("installation-token");
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("marks default-branch update failures with the target metadata and stage", async () => {
    const tempRoot = join(tmpdir(), "portal-import-default-branch-failure");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn().mockRejectedValue(new Error("no ref")),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    await expect(
      importRepositoryWithHistory({
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "trunk",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec,
      }),
    ).rejects.toMatchObject({
      name: "RepositoryImportError",
      stage: "set-default-branch",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
  });
});
