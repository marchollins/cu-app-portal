// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importRepositoryWithHistory } from "./import-repository";

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

  it("creates a target repository and mirrors the full source history into it", async () => {
    const tempRoot = join(tmpdir(), "portal-import-test");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("installation-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
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
      defaultBranch: "main",
    });
    expect(github.createRepository).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      visibility: "private",
      files: {},
      defaultBranch: "main",
      reuseIfAlreadyExists: false,
    });
    expect(exec).toHaveBeenNthCalledWith(1, "git", [
      "clone",
      "--mirror",
      "https://x-access-token:installation-token@github.com/external-org/Campus-Dashboard.git",
      join(tempRoot, "source.git"),
    ], {
      cwd: tempRoot,
      stdio: "ignore",
    });
    expect(exec).toHaveBeenNthCalledWith(2, "git", [
      "push",
      "--mirror",
      "https://x-access-token:installation-token@github.com/cedarville-it/campus-dashboard.git",
    ], {
      cwd: join(tempRoot, "source.git"),
      stdio: "ignore",
    });
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("cleans up the temp directory when mirroring fails without leaking tokenized remotes", async () => {
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
    ).rejects.toThrow("Repository import failed while mirroring git history.");
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });
});
