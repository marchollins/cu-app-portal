import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PublishingSetupCheckResult } from "./status";

const SECRET_METADATA_KEYS = new Set([
  "secret",
  "secretvalue",
  "token",
  "privatekey",
  "connectionstring",
  "databaseurl",
]);

type PersistPublishingSetupChecksInput = {
  appRequestId: string;
  checks: PublishingSetupCheckResult[];
  checkedAt: Date;
};

function isSecretMetadataKey(key: string) {
  return SECRET_METADATA_KEYS.has(key.toLowerCase());
}

function sanitizeJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null) {
    return null;
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
    return value.map((item) => sanitizeJsonValue(item) ?? null);
  }

  if (typeof value === "object") {
    const sanitized: Prisma.InputJsonObject = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (isSecretMetadataKey(key)) {
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
    sanitized !== null &&
    typeof sanitized === "object" &&
    !Array.isArray(sanitized)
  ) {
    return sanitized;
  }

  return {};
}

export async function persistPublishingSetupChecks({
  appRequestId,
  checks,
  checkedAt,
}: PersistPublishingSetupChecksInput) {
  await Promise.all(
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
