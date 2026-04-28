import { describe, expect, it } from "vitest";
import { loadGitHubAppConfig } from "./config";

describe("loadGitHubAppConfig", () => {
  it("keeps org selection configurable and per-org installation aware", () => {
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: "test-key",
      GITHUB_ALLOWED_ORGS: "cedarville-it,cedarville-apps",
      GITHUB_DEFAULT_ORG: "cedarville-it",
      GITHUB_DEFAULT_REPO_VISIBILITY: "private",
      GITHUB_APP_INSTALLATIONS_JSON: JSON.stringify({
        "cedarville-it": "111",
        "cedarville-apps": "222",
      }),
    });

    expect(config.defaultOrg).toBe("cedarville-it");
    expect(config.allowedOrgs).toEqual(["cedarville-it", "cedarville-apps"]);
    expect(config.installationIdsByOrg["cedarville-apps"]).toBe("222");
  });
});
