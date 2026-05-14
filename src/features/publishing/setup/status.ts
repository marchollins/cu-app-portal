export type PublishingSetupStatus =
  | "NOT_CHECKED"
  | "CHECKING"
  | "READY"
  | "NEEDS_REPAIR"
  | "REPAIRING"
  | "BLOCKED";

export type PublishSetupCheckStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";

export type PublishingSetupCheckKey =
  | "azure_resource_access"
  | "azure_app_settings"
  | "entra_redirect_uri"
  | "github_federated_credential"
  | "github_actions_secrets"
  | "github_workflow_file"
  | "github_workflow_dispatch";

export type PublishingSetupCheckResult = {
  checkKey: PublishingSetupCheckKey;
  status: PublishSetupCheckStatus;
  message: string;
  metadata: Record<string, unknown>;
};

export type PublishingSetupErrorClassification = {
  setupStatus: Extract<PublishingSetupStatus, "NEEDS_REPAIR" | "BLOCKED">;
  summary: string;
  operatorDetail: string;
  providerRequestId: string | null;
};

type ClassificationInput = {
  step: PublishingSetupCheckKey;
  error: unknown;
  repairWasReplacingPortalManagedCredential?: boolean;
};

const STALE_CREDENTIAL_SUMMARY =
  "Publishing credentials are out of date and need to be refreshed.";
const STALE_CREDENTIAL_DETAIL =
  "Update the portal's configured Azure and Entra credential values if needed, then run Repair Publishing Setup.";
const GRAPH_PERMISSION_SUMMARY =
  "Microsoft Graph permission is missing for Entra publishing setup.";
const GRAPH_PERMISSION_DETAIL =
  "Grant the portal runtime identity permission to update the shared app registration redirect URIs and the publisher application's federated identity credentials, then run Repair Publishing Setup.";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseGraphErrorPayload(message: string) {
  const jsonStart = message.indexOf("{");

  if (jsonStart === -1) {
    return null;
  }

  try {
    return JSON.parse(message.slice(jsonStart)) as {
      error?: {
        code?: string;
        innerError?: {
          "request-id"?: string;
          requestId?: string;
        };
      };
    };
  } catch {
    return null;
  }
}

function getProviderRequestId(payload: ReturnType<typeof parseGraphErrorPayload>) {
  return (
    payload?.error?.innerError?.["request-id"] ??
    payload?.error?.innerError?.requestId ??
    null
  );
}

function isGraphAuthorizationDenied(message: string) {
  const payload = parseGraphErrorPayload(message);

  return (
    message.includes("Microsoft Graph request failed: 403") &&
    (message.includes("Authorization_RequestDenied") ||
      payload?.error?.code === "Authorization_RequestDenied")
  );
}

export function classifyPublishingSetupError({
  step,
  error,
  repairWasReplacingPortalManagedCredential = false,
}: ClassificationInput): PublishingSetupErrorClassification {
  const message = errorMessage(error);
  const graphPayload = parseGraphErrorPayload(message);

  if (isGraphAuthorizationDenied(message)) {
    if (
      repairWasReplacingPortalManagedCredential ||
      step === "github_federated_credential" ||
      step === "github_actions_secrets"
    ) {
      return {
        setupStatus: "NEEDS_REPAIR",
        summary: STALE_CREDENTIAL_SUMMARY,
        operatorDetail: STALE_CREDENTIAL_DETAIL,
        providerRequestId: getProviderRequestId(graphPayload),
      };
    }

    return {
      setupStatus: "BLOCKED",
      summary: GRAPH_PERMISSION_SUMMARY,
      operatorDetail: GRAPH_PERMISSION_DETAIL,
      providerRequestId: getProviderRequestId(graphPayload),
    };
  }

  return {
    setupStatus: "NEEDS_REPAIR",
    summary: "Publishing setup needs to be repaired.",
    operatorDetail:
      "Run Repair Publishing Setup to refresh Azure, Entra, and GitHub publishing prerequisites.",
    providerRequestId: null,
  };
}

export function summarizePublishingSetupChecks(
  checks: PublishingSetupCheckResult[],
): {
  setupStatus: Extract<
    PublishingSetupStatus,
    "READY" | "NEEDS_REPAIR" | "BLOCKED"
  >;
  errorSummary: string | null;
} {
  const failed = checks.filter((check) => check.status === "FAIL");
  const blocked = failed.find((check) => check.metadata.repairable === false);

  if (blocked) {
    return {
      setupStatus: "BLOCKED",
      errorSummary: blocked.message,
    };
  }

  if (failed.length > 0 || checks.some((check) => check.status === "UNKNOWN")) {
    return {
      setupStatus: "NEEDS_REPAIR",
      errorSummary:
        failed[0]?.message ??
        checks.find((check) => check.status === "UNKNOWN")?.message ??
        "Publishing setup needs to be repaired.",
    };
  }

  return {
    setupStatus: "READY",
    errorSummary: null,
  };
}
