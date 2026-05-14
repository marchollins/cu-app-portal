import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PublishingSetupCheckResult } from "./status";

const SAFE_METADATA_KEYS = new Set([
  "branch",
  "credentialid",
  "credentialname",
  "databasename",
  "defaultbranch",
  "errorcode",
  "exists",
  "missingsecretnames",
  "name",
  "owner",
  "path",
  "redirecturi",
  "repairable",
  "repository",
  "requestid",
  "resourcegroup",
  "secretname",
  "secretnames",
  "statuscode",
  "step",
  "subject",
  "webappname",
  "workflowpath",
]);

type PersistPublishingSetupChecksInput = {
  appRequestId: string;
  checks: PublishingSetupCheckResult[];
  checkedAt: Date;
};

function normalizeMetadataKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeJsonValue(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }

  if (typeof value === "object") {
    const sanitized: Record<string, Prisma.InputJsonValue> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (!SAFE_METADATA_KEYS.has(normalizeMetadataKey(key))) {
        continue;
      }

      const sanitizedValue = sanitizeJsonValue(nestedValue);

      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }

    return sanitized;
  }

  return undefined;
}

function sanitizeMetadata(metadata: unknown): Prisma.InputJsonObject {
  const sanitized = sanitizeJsonValue(metadata);

  if (
    typeof sanitized === "object" &&
    sanitized !== null &&
    !Array.isArray(sanitized)
  ) {
    return sanitized as Prisma.InputJsonObject;
  }

  return {};
}

export async function persistPublishingSetupChecks({
  appRequestId,
  checks,
  checkedAt,
}: PersistPublishingSetupChecksInput) {
  await prisma.$transaction(
    checks.map((check) => {
      const metadata = sanitizeMetadata(check.metadata);

      return prisma.publishSetupCheck.upsert({
        where: {
          appRequestId_checkKey: {
            appRequestId,
            checkKey: check.checkKey,
          },
        },
        create: {
          appRequestId,
          checkKey: check.checkKey,
          status: check.status,
          message: check.message,
          metadata,
          checkedAt,
        },
        update: {
          status: check.status,
          message: check.message,
          metadata,
          checkedAt,
        },
      });
    }),
  );
}
