import { describe, expect, it, vi } from "vitest";
import { PUBLISHING_BUNDLE_PATHS } from "./compatibility";
import { verifyImportedPublishReadiness } from "./publish-readiness";

describe("verifyImportedPublishReadiness", () => {
  it("reads package.json and publishing bundle paths from the default branch", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": "{}",
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
    ).resolves.toEqual({ ready: true, missingPaths: [] });

    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      ref: "main",
      paths: ["package.json", ...PUBLISHING_BUNDLE_PATHS],
    });
  });

  it("reports missing publishing bundle paths", async () => {
    const [firstBundlePath, secondBundlePath, ...presentBundlePaths] =
      PUBLISHING_BUNDLE_PATHS;
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue(
        {
          "package.json": "{}",
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
    });
  });
});
