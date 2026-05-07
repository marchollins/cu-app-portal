function slugifyRepositoryName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 90);

  return slug || "app";
}

export function isRepositoryInOrg(owner: string, org: string) {
  return owner.toLowerCase() === org.toLowerCase();
}

export function buildSharedOrgTargetName({
  sourceName,
  existingNames,
}: {
  sourceName: string;
  existingNames: string[];
}) {
  const existing = new Set(existingNames.map((name) => name.toLowerCase()));
  const baseName = slugifyRepositoryName(sourceName);

  if (!existing.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const candidate = `${baseName}-${suffix}`;

    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  throw new Error(`Could not choose an available target repository name for "${sourceName}".`);
}
