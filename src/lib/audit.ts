export type AuditEvent =
  | "SIGN_IN"
  | "APP_REQUEST_CREATED"
  | "APP_REQUEST_SUCCEEDED"
  | "APP_REQUEST_FAILED"
  | "ARTIFACT_DOWNLOADED"
  | "REPOSITORY_BOOTSTRAP_REQUESTED"
  | "REPOSITORY_BOOTSTRAP_SUCCEEDED"
  | "REPOSITORY_BOOTSTRAP_FAILED"
  | "REPOSITORY_ACCESS_REQUESTED"
  | "REPOSITORY_ACCESS_SUCCEEDED"
  | "REPOSITORY_ACCESS_FAILED"
  | "PUBLISH_REQUESTED"
  | "PUBLISH_SUCCEEDED"
  | "PUBLISH_FAILED";

export async function recordAuditEvent(
  event: AuditEvent,
  details: Record<string, unknown>,
) {
  console.info("[audit]", event, details);
}
