type PublishTargetNameInput = {
  requestId: string;
  appName: string;
};

type PublishTargetNames = {
  shortRequestId: string;
  baseName: string;
  webAppName: string;
  databaseName: string;
  federatedCredentialName: string;
  azureDefaultHostName: string;
  primaryPublishUrl: string;
};

type PublishResourceTagInput = {
  requestId: string;
  appName: string;
  templateSlug: string;
  repositoryOwner: string;
  repositoryName: string;
  ownerUserId: string;
  supportReference: string;
};

type PublishResourceTags = {
  managedBy: "cu-app-portal";
  appRequestId: string;
  appName: string;
  templateSlug: string;
  repository: string;
  environment: "published";
  ownerUserId: string;
  supportReference: string;
  createdBy: "portal-publish-worker";
};

const AZURE_TAG_VALUE_MAX_LENGTH = 256;

function toSlug(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app"
  );
}

function buildNameWithSuffix({
  prefix,
  slug,
  suffix,
  maxLength,
}: {
  prefix: string;
  slug: string;
  suffix: string;
  maxLength: number;
}) {
  const fixedLength = prefix.length + 1 + suffix.length;
  const maxSlugLength = Math.max(1, maxLength - fixedLength);
  const truncatedSlug =
    slug.slice(0, maxSlugLength).replace(/-+$/g, "") || "app";

  return `${prefix}${truncatedSlug}-${suffix}`;
}

function validateAzureTagValues(tags: PublishResourceTags) {
  for (const [key, value] of Object.entries(tags)) {
    if (value.length > AZURE_TAG_VALUE_MAX_LENGTH) {
      throw new Error(
        `Azure tag ${key} must be ${AZURE_TAG_VALUE_MAX_LENGTH} characters or fewer.`,
      );
    }
  }

  return tags;
}

export function buildPublishTargetNames({
  requestId,
  appName,
}: PublishTargetNameInput): PublishTargetNames {
  const slug = toSlug(appName);
  const shortRequestId = toSlug(requestId).replaceAll("-", "").slice(0, 8);
  const baseName = `${slug}-${shortRequestId}`;
  const webAppName = buildNameWithSuffix({
    prefix: "app-",
    slug,
    suffix: shortRequestId,
    maxLength: 60,
  });
  const databaseName = `db_${webAppName
    .replace(/^app-/, "")
    .replaceAll("-", "_")}`;
  const federatedCredentialName = buildNameWithSuffix({
    prefix: "github-",
    slug,
    suffix: shortRequestId,
    maxLength: 120,
  });
  const azureDefaultHostName = `${webAppName}.azurewebsites.net`;

  return {
    shortRequestId,
    baseName,
    webAppName,
    databaseName,
    federatedCredentialName,
    azureDefaultHostName,
    primaryPublishUrl: `https://${azureDefaultHostName}`,
  };
}

export function buildPublishResourceTags({
  requestId,
  appName,
  templateSlug,
  repositoryOwner,
  repositoryName,
  ownerUserId,
  supportReference,
}: PublishResourceTagInput): PublishResourceTags {
  return validateAzureTagValues({
    managedBy: "cu-app-portal",
    appRequestId: requestId,
    appName,
    templateSlug,
    repository: `${repositoryOwner}/${repositoryName}`,
    environment: "published",
    ownerUserId,
    supportReference,
    createdBy: "portal-publish-worker",
  });
}

export function assertPortalOwnership(
  tags: Record<string, string | undefined> | null | undefined,
  requestId: string,
  resourceName: string,
) {
  if (tags?.managedBy === "cu-app-portal" && tags.appRequestId === requestId) {
    return;
  }

  throw new Error(
    `Azure resource ${resourceName} exists but is not tagged for this app request.`,
  );
}
