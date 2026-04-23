export type AuditEvent =
  | "SIGN_IN"
  | "APP_REQUEST_CREATED"
  | "APP_REQUEST_SUCCEEDED"
  | "APP_REQUEST_FAILED"
  | "ARTIFACT_DOWNLOADED";

export async function recordAuditEvent(
  event: AuditEvent,
  details: Record<string, unknown>,
) {
  console.info("[audit]", event, details);
}
