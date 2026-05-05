import { describe, expect, it } from "vitest";
import { buildSharedOrgTargetName, isRepositoryInOrg } from "./target-name";

describe("isRepositoryInOrg", () => {
  it("compares org names case-insensitively", () => {
    expect(isRepositoryInOrg("Cedarville-IT", "cedarville-it")).toBe(true);
    expect(isRepositoryInOrg("student-org", "cedarville-it")).toBe(false);
  });
});

describe("buildSharedOrgTargetName", () => {
  it("uses the source repo name when available", () => {
    expect(
      buildSharedOrgTargetName({
        sourceName: "Campus Dashboard",
        existingNames: [],
      }),
    ).toBe("campus-dashboard");
  });

  it("adds a collision suffix", () => {
    expect(
      buildSharedOrgTargetName({
        sourceName: "campus-dashboard",
        existingNames: ["campus-dashboard", "campus-dashboard-2"],
      }),
    ).toBe("campus-dashboard-3");
  });

  it("uses app when the source name has no safe characters", () => {
    expect(
      buildSharedOrgTargetName({
        sourceName: "!!!",
        existingNames: [],
      }),
    ).toBe("app");
  });
});
