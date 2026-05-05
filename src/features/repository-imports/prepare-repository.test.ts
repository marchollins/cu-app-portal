import { describe, expect, it, vi } from "vitest";
import { prepareImportedRepository } from "./prepare-repository";

const files = {
  "package.json": JSON.stringify({
    scripts: { build: "next build" },
    dependencies: { next: "15.5.15" },
  }),
};

describe("prepareImportedRepository", () => {
  it("commits publishing additions directly", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn().mockResolvedValue({ commitSha: "commit-sha" }),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).resolves.toEqual({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
    });
    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        paths: expect.arrayContaining([
          "bun.lock",
          "pnpm-workspace.yaml",
          "turbo.json",
          "lerna.json",
          "nx.json",
        ]),
      }),
    );
    expect(github.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "main",
        message: "Add Azure publishing support",
      }),
    );
  });

  it("opens a PR when requested", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn().mockResolvedValue({
        commitSha: "commit-sha",
        pullRequestUrl:
          "https://github.com/cedarville-it/campus-dashboard/pull/1",
      }),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "PULL_REQUEST",
        github,
      }),
    ).resolves.toEqual({
      status: "PULL_REQUEST_OPENED",
      commitSha: "commit-sha",
      pullRequestUrl:
        "https://github.com/cedarville-it/campus-dashboard/pull/1",
    });
  });

  it("blocks direct commits when compatibility conflicts exist", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ...files,
        "app-portal/deployment-manifest.json": "{}",
      }),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).rejects.toThrow("Repository has publishing file conflicts.");
  });
});
