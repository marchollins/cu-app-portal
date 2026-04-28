import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapManagedRepository } from "./bootstrap-managed-repository";
import { createGitHubAppClient } from "./github-app";

vi.mock("./github-app", () => ({
  createGitHubAppClient: vi.fn(),
}));

describe("bootstrapManagedRepository", () => {
  beforeEach(() => {
    vi.mocked(createGitHubAppClient).mockReset();
  });

  it("uses the configured default org and manifest-derived repo name", async () => {
    const createRepository = vi.fn().mockResolvedValue({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    });
    vi.mocked(createGitHubAppClient).mockReturnValue({
      createRepository,
    });

    const result = await bootstrapManagedRepository({
      appRequestId: "request-123",
      input: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service",
      },
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      config: {
        appId: "123",
        privateKey: "key",
        allowedOrgs: ["cedarville-it", "cedarville-apps"],
        defaultOrg: "cedarville-it",
        defaultRepoVisibility: "private",
        installationIdsByOrg: {
          "cedarville-it": "111",
        },
      },
    });

    expect(createRepository).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      visibility: "private",
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      defaultBranch: "main",
    });
    expect(result.owner).toBe("cedarville-it");
    expect(result.url).toContain("github.com/cedarville-it/campus-dashboard");
  });
});
