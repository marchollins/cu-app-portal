import { describe, expect, it } from "vitest";
import {
  assertPortalOwnership,
  buildPublishResourceTags,
  buildPublishTargetNames,
} from "./naming";

describe("buildPublishTargetNames", () => {
  it("creates stable azure-safe and postgres-safe names", () => {
    expect(
      buildPublishTargetNames({
        requestId: "clx9abc123zzzzzzzzzz",
        appName: "Campus Dashboard!",
      }),
    ).toEqual({
      shortRequestId: "clx9abc1",
      baseName: "campus-dashboard-clx9abc1",
      webAppName: "app-campus-dashboard-clx9abc1",
      databaseName: "db_campus_dashboard_clx9abc1",
      federatedCredentialName: "github-campus-dashboard-clx9abc1",
      azureDefaultHostName:
        "app-campus-dashboard-clx9abc1.azurewebsites.net",
      primaryPublishUrl:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
    });
  });

  it("keeps the request id suffix when truncating long names", () => {
    const names = buildPublishTargetNames({
      requestId: "clx9abc123zzzzzzzzzz",
      appName:
        "This App Name Is So Long That Azure Web App Names Need Truncation",
    });

    expect(names.webAppName.length).toBeLessThanOrEqual(60);
    expect(names.webAppName.endsWith("-clx9abc1")).toBe(true);
    expect(names.databaseName.endsWith("_clx9abc1")).toBe(true);
  });

  it("creates database names within the azure arm-safe subset", () => {
    const names = buildPublishTargetNames({
      requestId: "clx9abc123zzzzzzzzzz",
      appName:
        "This App Name Is So Long That Azure Database Names Need Truncation",
    });

    expect(names.databaseName.length).toBeLessThanOrEqual(63);
    expect(names.databaseName).toMatch(/^[a-z_][a-z0-9_-]{0,62}$/);
  });
});

describe("buildPublishResourceTags", () => {
  it("builds the required ownership tags", () => {
    expect(
      buildPublishResourceTags({
        requestId: "request-123",
        appName: "Campus Dashboard",
        templateSlug: "web-app",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        ownerUserId: "user-123",
        supportReference: "CU-123",
      }),
    ).toEqual({
      managedBy: "cu-app-portal",
      appRequestId: "request-123",
      appName: "Campus Dashboard",
      templateSlug: "web-app",
      repository: "cedarville-it/campus-dashboard",
      environment: "published",
      ownerUserId: "user-123",
      supportReference: "CU-123",
      createdBy: "portal-publish-worker",
    });
  });

  it("rejects tag values longer than 256 characters", () => {
    expect(() =>
      buildPublishResourceTags({
        requestId: "request-123",
        appName: "a".repeat(257),
        templateSlug: "web-app",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        ownerUserId: "user-123",
        supportReference: "CU-123",
      }),
    ).toThrow(/Azure tag appName must be 256 characters or fewer/);
  });
});

describe("assertPortalOwnership", () => {
  it("allows resources tagged for the portal app request", () => {
    expect(() =>
      assertPortalOwnership(
        {
          managedBy: "cu-app-portal",
          appRequestId: "request-123",
        },
        "request-123",
        "app-campus-dashboard",
      ),
    ).not.toThrow();
  });

  it("rejects resources not tagged for the portal app request", () => {
    expect(() =>
      assertPortalOwnership(
        {
          managedBy: "someone-else",
          appRequestId: "request-123",
        },
        "request-123",
        "app-campus-dashboard",
      ),
    ).toThrow(
      /Azure resource app-campus-dashboard exists but is not tagged for this app request/,
    );
  });
});
