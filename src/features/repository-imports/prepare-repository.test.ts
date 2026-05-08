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
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
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
        ref: "head-sha",
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
        expectedHeadSha: "head-sha",
      }),
    );
  });

  it("opens a PR when requested", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
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
    expect(github.createPullRequestWithFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "portal/add-azure-publishing-campus-dashboard",
        expectedHeadSha: "head-sha",
      }),
    );
  });

  it("sanitizes repository names for PR branches", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn().mockResolvedValue({
        commitSha: "commit-sha",
        pullRequestUrl:
          "https://github.com/cedarville-it/campus-dashboard/pull/1",
      }),
    };

    await prepareImportedRepository({
      appName: "Campus Dashboard",
      owner: "cedarville-it",
      name: "Campus Dashboard!",
      defaultBranch: "main",
      mode: "PULL_REQUEST",
      github,
    });

    expect(github.createPullRequestWithFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "portal/add-azure-publishing-campus-dashboard",
      }),
    );
  });

  it("blocks direct commits when compatibility conflicts exist", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
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
    ).rejects.toThrow(
      "Repository has publishing file conflicts. app-portal/deployment-manifest.json: app-portal/deployment-manifest.json already exists and will not be overwritten.",
    );
  });

  it("opens a PR when publishing-file conflicts need review", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ...files,
        "app-portal/deployment-manifest.json": "{}",
      }),
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
    expect(github.createPullRequestWithFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "portal/add-azure-publishing-campus-dashboard",
        body: expect.stringContaining(
          "Existing publishing files were detected",
        ),
        files: expect.objectContaining({
          "app-portal/deployment-manifest.json": expect.stringContaining(
            '"templateSlug": "imported-web-app"',
          ),
        }),
      }),
    );
    expect(github.commitFiles).not.toHaveBeenCalled();
  });

  it("includes compatibility findings for unsupported repositories", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": JSON.stringify({
          scripts: { start: "next start" },
          dependencies: { react: "19.0.0" },
        }),
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
    ).rejects.toThrow(
      "Repository is not compatible with v1 Azure publishing. package.json: package.json must include a build script. V1 supports root Next.js apps only.",
    );
  });
});
