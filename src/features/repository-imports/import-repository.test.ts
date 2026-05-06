// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    writeFile: vi.fn(),
  };
});

describe("importRepositoryWithHistory", () => {
  beforeEach(() => {
    vi.mocked(mkdtemp).mockReset();
    vi.mocked(rm).mockReset();
    vi.mocked(writeFile).mockReset();
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
      "-c",
      `credential.helper=store --file=${join(tempRoot, "target-credentials")}`,
      "push",
      "--mirror",
      "https://github.com/cedarville-it/campus-dashboard.git",
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
      "-c",
      `credential.helper=store --file=${join(tempRoot, "source-credentials")}`,
      "clone",
      "--mirror",
      "https://github.com/external-org/Private-Dashboard.git",
      join(tempRoot, "source.git"),
    ], {
      cwd: tempRoot,
      stdio: "ignore",
    });
    expect(exec).toHaveBeenNthCalledWith(2, "git", [
      "-c",
      `credential.helper=store --file=${join(tempRoot, "target-credentials")}`,
      "push",
      "--mirror",
      "https://github.com/cedarville-it/campus-dashboard.git",
    ], {
      cwd: join(tempRoot, "source.git"),
      stdio: "ignore",
    });
    expect(exec.mock.calls.flatMap(([, args]) => args).join(" ")).not.toContain(
      "source-token",
    );
    expect(exec.mock.calls.flatMap(([, args]) => args).join(" ")).not.toContain(
      "target-token",
    );
  });

  it("reports source clone failures with sanitized git details", async () => {
    const tempRoot = join(tmpdir(), "portal-import-failure");
    const exec = vi.fn().mockRejectedValue(
      Object.assign(
        new Error(
          "git failed for https://x-access-token:installation-token@github.com/external-org/Campus-Dashboard.git",
        ),
        {
          stderr:
            "fatal: repository 'https://x-access-token:installation-token@github.com/external-org/Campus-Dashboard.git/' not found\n",
        },
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
      message:
        "Repository import failed while cloning source repository: fatal: repository 'https://github.com/external-org/Campus-Dashboard.git/' not found",
      stage: "clone",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
    expect(String(failure.stack)).not.toContain("installation-token");
    expect(failure.message).not.toContain("installation-token");
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("reports target push failures with sanitized git details", async () => {
    const tempRoot = join(tmpdir(), "portal-import-push-failure");
    const exec = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        Object.assign(new Error("git push failed"), {
          stderr:
            "remote: Permission to cedarville-it/campus-dashboard.git denied to x-access-token.\nfatal: unable to access 'https://x-access-token:target-token@github.com/cedarville-it/campus-dashboard.git/': The requested URL returned error: 403\n",
        }),
      );
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
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
      message:
        "Repository import failed while pushing history to target repository: remote: Permission to cedarville-it/campus-dashboard.git denied to x-access-token. fatal: unable to access 'https://github.com/cedarville-it/campus-dashboard.git/': The requested URL returned error: 403",
      stage: "push",
    });
    expect(failure.message).not.toContain("target-token");
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("preserves created target metadata when target token acquisition fails", async () => {
    const tempRoot = join(tmpdir(), "portal-import-target-token-failure");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockRejectedValue(
        new Error("token service unavailable for target-token-secret"),
      ),
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
        defaultBranch: "main",
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
      message: "Repository import failed while preparing git authentication.",
      stage: "target-token",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
    expect(String(failure.stack)).not.toContain("target-token-secret");
    expect(exec).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("preserves created target metadata when source token acquisition fails", async () => {
    const tempRoot = join(tmpdir(), "portal-import-source-token-failure");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    const sourceGithub = {
      createInstallationTokenForGit: vi.fn().mockRejectedValue(
        new Error("token service unavailable for source-token-secret"),
      ),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const failure = await importRepositoryWithHistory({
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
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RepositoryImportError);
    expect(failure).toMatchObject({
      message: "Repository import failed while preparing git authentication.",
      stage: "source-token",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
    expect(String(failure.stack)).not.toContain("source-token-secret");
    expect(exec).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("does not classify non-name GitHub 422 target creation failures as collisions", async () => {
    const tempRoot = join(tmpdir(), "portal-import-policy-failure");
    const policyError = Object.assign(
      new Error("GitHub API request failed: 422 Unprocessable Entity - visibility policy blocked"),
      {
        status: 422,
        errors: [
          {
            resource: "Repository",
            field: "visibility",
            code: "custom",
            message: "private repositories are disabled",
          },
        ],
      },
    );
    const github = {
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi.fn().mockRejectedValue(policyError),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    await expect(
      importRepositoryWithHistory({
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec: vi.fn(),
      }),
    ).rejects.toMatchObject({
      name: "RepositoryImportError",
      message: "Repository import failed while creating the target repository.",
      stage: "create-target",
      code: undefined,
    });
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
