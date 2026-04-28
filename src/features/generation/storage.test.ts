import { describe, expect, it } from "vitest";
import { resolveArtifactRoot } from "./storage";

describe("resolveArtifactRoot", () => {
  it("stores artifacts under the repo .artifacts directory by default", () => {
    expect(resolveArtifactRoot({}, "/workspace/cu-app-portal")).toBe(
      "/workspace/cu-app-portal/.artifacts",
    );
  });

  it("uses the configured storage root when ARTIFACT_STORAGE_ROOT is set", () => {
    expect(
      resolveArtifactRoot(
        { ARTIFACT_STORAGE_ROOT: "/tmp/cu-artifacts" },
        "/workspace/cu-app-portal",
      ),
    ).toBe("/tmp/cu-artifacts");
  });

  it("uses the writable Azure home directory when running on App Service", () => {
    expect(
      resolveArtifactRoot(
        { WEBSITE_SITE_NAME: "cu-app-portal", HOME: "/home" },
        "/workspace/cu-app-portal",
      ),
    ).toBe("/home/artifacts");
  });
});
