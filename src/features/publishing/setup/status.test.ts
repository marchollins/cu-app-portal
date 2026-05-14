import { describe, expect, it } from "vitest";
import {
  classifyPublishingSetupError,
  summarizePublishingSetupChecks,
  type PublishingSetupCheckResult,
} from "./status";

describe("classifyPublishingSetupError", () => {
  it("classifies Graph Authorization_RequestDenied during stale credential repair as repairable", () => {
    const result = classifyPublishingSetupError({
      step: "github_federated_credential",
      error: new Error(
        'Microsoft Graph request failed: 403 {"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges to complete the operation."}}',
      ),
      repairWasReplacingPortalManagedCredential: true,
    });

    expect(result).toEqual({
      setupStatus: "NEEDS_REPAIR",
      summary: "Publishing credentials are out of date and need to be refreshed.",
      operatorDetail:
        "Update the portal's configured Azure and Entra credential values if needed, then run Repair Publishing Setup.",
      providerRequestId: null,
    });
  });

  it("classifies Graph Authorization_RequestDenied for app registration writes as blocked", () => {
    const result = classifyPublishingSetupError({
      step: "entra_redirect_uri",
      error: new Error(
        'Microsoft Graph request failed: 403 {"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges to complete the operation.","innerError":{"request-id":"graph-request-123"}}}',
      ),
    });

    expect(result).toEqual({
      setupStatus: "BLOCKED",
      summary: "Microsoft Graph permission is missing for Entra publishing setup.",
      operatorDetail:
        "Grant the portal runtime identity permission to update the shared app registration redirect URIs and the publisher application's federated identity credentials, then run Repair Publishing Setup.",
      providerRequestId: "graph-request-123",
    });
  });

  it("classifies non-Graph setup failures as repairable by default", () => {
    const result = classifyPublishingSetupError({
      step: "github_actions_secrets",
      error: new Error("GitHub API request failed: 404 Not Found"),
    });

    expect(result.setupStatus).toBe("NEEDS_REPAIR");
    expect(result.summary).toBe("Publishing setup needs to be repaired.");
  });
});

describe("summarizePublishingSetupChecks", () => {
  const baseChecks: PublishingSetupCheckResult[] = [
    {
      checkKey: "github_workflow_file",
      status: "PASS",
      message: "Deployment workflow exists.",
      metadata: {},
    },
  ];

  it("returns READY when all checks pass", () => {
    expect(summarizePublishingSetupChecks(baseChecks)).toEqual({
      setupStatus: "READY",
      errorSummary: null,
    });
  });

  it("returns NEEDS_REPAIR when any check fails repairably", () => {
    expect(
      summarizePublishingSetupChecks([
        ...baseChecks,
        {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
          metadata: { repairable: true },
        },
      ]),
    ).toEqual({
      setupStatus: "NEEDS_REPAIR",
      errorSummary: "Required GitHub Actions secrets are missing.",
    });
  });

  it("returns BLOCKED when any check fails non-repairably", () => {
    expect(
      summarizePublishingSetupChecks([
        ...baseChecks,
        {
          checkKey: "entra_redirect_uri",
          status: "FAIL",
          message: "Microsoft Graph permission is missing for Entra publishing setup.",
          metadata: { repairable: false },
        },
      ]),
    ).toEqual({
      setupStatus: "BLOCKED",
      errorSummary: "Microsoft Graph permission is missing for Entra publishing setup.",
    });
  });
});
