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

  it("normalizes escaped newlines in the GitHub App private key", () => {
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: "key-line-1\\nkey-line-2",
      GITHUB_ALLOWED_ORGS: "cedarville-it",
      GITHUB_DEFAULT_ORG: "cedarville-it",
      GITHUB_DEFAULT_REPO_VISIBILITY: "private",
      GITHUB_APP_INSTALLATION_ID: "111",
    });

    expect(config.privateKey).toContain("key-line-1\nkey-line-2");
    expect(config.privateKey).not.toContain("\\n");
  });

  it("fails with a clear error when installation mapping JSON is invalid", () => {
    expect(() =>
      loadGitHubAppConfig({
        GITHUB_APP_ID: "12345",
        GITHUB_APP_PRIVATE_KEY: "test-key",
        GITHUB_ALLOWED_ORGS: "cedarville-it",
        GITHUB_DEFAULT_ORG: "cedarville-it",
        GITHUB_DEFAULT_REPO_VISIBILITY: "private",
        GITHUB_APP_INSTALLATIONS_JSON: "{not-json}",
      }),
    ).toThrow(/GITHUB_APP_INSTALLATIONS_JSON must be valid JSON/i);
  });

  it("returns the configured installation id for an org", () => {
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_ALLOWED_ORGS: "cedarville-it",
      GITHUB_DEFAULT_ORG: "cedarville-it",
      GITHUB_APP_INSTALLATIONS_JSON: JSON.stringify({
        "cedarville-it": "111",
        "student-org": "222",
      }),
    });

    expect(config.installationIdsByOrg["student-org"]).toBe("222");
  });
});
