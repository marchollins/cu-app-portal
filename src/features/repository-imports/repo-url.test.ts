import { describe, expect, it } from "vitest";
import { parseGitHubRepositoryUrl } from "./repo-url";

describe("parseGitHubRepositoryUrl", () => {
  it("normalizes github web urls", () => {
    expect(
      parseGitHubRepositoryUrl("https://github.com/Cedarville-IT/Campus-Dashboard.git"),
    ).toEqual({
      owner: "Cedarville-IT",
      name: "Campus-Dashboard",
      normalizedUrl: "https://github.com/Cedarville-IT/Campus-Dashboard",
      fullName: "Cedarville-IT/Campus-Dashboard",
    });
  });

  it("normalizes ssh urls", () => {
    expect(
      parseGitHubRepositoryUrl("git@github.com:cedarville-it/campus-dashboard.git"),
    ).toEqual({
      owner: "cedarville-it",
      name: "campus-dashboard",
      normalizedUrl: "https://github.com/cedarville-it/campus-dashboard",
      fullName: "cedarville-it/campus-dashboard",
    });
  });

  it("rejects nested ssh paths", () => {
    expect(() =>
      parseGitHubRepositoryUrl("git@github.com:owner/repo/path.git"),
    ).toThrow("Enter a GitHub repository URL.");
  });

  it("rejects ssh urls with spaced owner or repo values", () => {
    expect(() =>
      parseGitHubRepositoryUrl("git@github.com:cedarville it/campus-dashboard.git"),
    ).toThrow("Enter a GitHub repository URL.");

    expect(() =>
      parseGitHubRepositoryUrl("git@github.com:cedarville-it/campus dashboard.git"),
    ).toThrow("Enter a GitHub repository URL.");
  });

  it("rejects non-github urls", () => {
    expect(() =>
      parseGitHubRepositoryUrl("https://gitlab.com/cedarville/campus-dashboard"),
    ).toThrow("Enter a GitHub repository URL.");
  });

  it("rejects unsupported schemes", () => {
    expect(() =>
      parseGitHubRepositoryUrl("ftp://github.com/owner/repo"),
    ).toThrow("Enter a GitHub repository URL.");
  });

  it("rejects github urls that are not repository paths", () => {
    expect(() =>
      parseGitHubRepositoryUrl("https://github.com/orgs/Cedarville-IT/repositories"),
    ).toThrow(
      "Enter a GitHub repository URL in the form https://github.com/owner/repo.",
    );

    expect(() =>
      parseGitHubRepositoryUrl("https://github.com/owner/repo/issues/1"),
    ).toThrow(
      "Enter a GitHub repository URL in the form https://github.com/owner/repo.",
    );
  });

  it("rejects urls without owner and repo", () => {
    expect(() => parseGitHubRepositoryUrl("https://github.com/cedarville-it")).toThrow(
      "Enter a GitHub repository URL in the form https://github.com/owner/repo.",
    );
  });
});
