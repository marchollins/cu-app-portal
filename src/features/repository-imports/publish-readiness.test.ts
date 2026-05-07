import { describe, expect, it, vi } from "vitest";
import { PUBLISHING_BUNDLE_PATHS } from "./compatibility";
import { verifyImportedPublishReadiness } from "./publish-readiness";

const readyPackageJson = JSON.stringify({
  scripts: {
    build: "next build",
    start: "next start",
  },
  dependencies: {
    next: "15.5.15",
  },
  engines: {
    node: ">=24",
  },
});

describe("verifyImportedPublishReadiness", () => {
  it("reads package.json and publishing bundle paths from the default branch", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": readyPackageJson,
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: true,
      missingPaths: [],
      packageIssues: [],
    });

    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      ref: "main",
      paths: [
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
      ],
    });
  });

  it("reports missing publishing bundle paths", async () => {
    const [firstBundlePath, secondBundlePath, ...presentBundlePaths] =
      PUBLISHING_BUNDLE_PATHS;
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue(
        {
          "package.json": readyPackageJson,
          ...Object.fromEntries(
            presentBundlePaths.map((path) => [path, "content"]),
          ),
        },
      ),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: [firstBundlePath, secondBundlePath],
      packageIssues: [],
    });
  });

  it("reports missing package.json even when publishing bundle paths exist", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: ["package.json"],
      packageIssues: [
        "package.json: A root package.json is required for v1 Azure publishing.",
      ],
    });
  });

  it("reports incomplete package.json additions as not ready", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": JSON.stringify({
          scripts: { build: "next build" },
          dependencies: { next: "15.5.15" },
        }),
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: [],
      packageIssues: [
        'package.json is missing a start script; the portal can add "next start".',
        'package.json is missing engines.node; the portal can add ">=24".',
      ],
    });
  });
});
