export type RepositoryFileMap = Record<string, string>;

export type CompatibilityFinding = {
  code:
    | "MISSING_PACKAGE_JSON"
    | "INVALID_PACKAGE_JSON"
    | "MISSING_BUILD_SCRIPT"
    | "MISSING_START_SCRIPT"
    | "MISSING_NODE_ENGINE"
    | "UNSUPPORTED_LOCKFILE"
    | "UNSUPPORTED_APP_SHAPE"
    | "UNSUPPORTED_WORKSPACE_ROOT"
    | "FILE_CONFLICT";
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
};

export type CompatibilityStatus =
  | "COMPATIBLE"
  | "NEEDS_ADDITIONS"
  | "UNSUPPORTED"
  | "CONFLICTED";

export type CompatibilityResult = {
  status: CompatibilityStatus;
  findings: CompatibilityFinding[];
  canDirectCommit: boolean;
};

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  workspaces?: unknown;
};

export const PUBLISHING_BUNDLE_PATHS = [
  ".github/workflows/deploy-azure-app-service.yml",
  ".codex/skills/publish-to-azure/SKILL.md",
  "docs/publishing/azure-app-service.md",
  "docs/publishing/lessons-learned.md",
  "app-portal/deployment-manifest.json",
] as const;

function parsePackageJson(files: RepositoryFileMap) {
  if (!hasFile(files, "package.json")) {
    return {
      packageJson: null,
      finding: {
        code: "MISSING_PACKAGE_JSON" as const,
        severity: "error" as const,
        message: "A root package.json is required for v1 Azure publishing.",
        path: "package.json",
      },
    };
  }

  const rawPackageJson = files["package.json"];

  try {
    const parsedPackageJson = JSON.parse(rawPackageJson) as unknown;

    if (!isJsonObject(parsedPackageJson)) {
      return {
        packageJson: null,
        finding: {
          code: "INVALID_PACKAGE_JSON" as const,
          severity: "error" as const,
          message: "package.json must be a JSON object.",
          path: "package.json",
        },
      };
    }

    return {
      packageJson: parsedPackageJson as PackageJson,
      finding: null,
    };
  } catch {
    return {
      packageJson: null,
      finding: {
        code: "INVALID_PACKAGE_JSON" as const,
        severity: "error" as const,
        message: "package.json must be valid JSON.",
        path: "package.json",
      },
    };
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNextDependency(packageJson: PackageJson) {
  return Boolean(packageJson.dependencies?.next ?? packageJson.devDependencies?.next);
}

function hasUnsupportedLockfile(files: RepositoryFileMap) {
  return (
    hasFile(files, "pnpm-lock.yaml") ||
    hasFile(files, "yarn.lock") ||
    hasFile(files, "bun.lock") ||
    hasFile(files, "bun.lockb")
  );
}

function hasFile(files: RepositoryFileMap, path: string) {
  return Object.prototype.hasOwnProperty.call(files, path);
}

function getWorkspaceRootPath(
  files: RepositoryFileMap,
  packageJson: PackageJson | null,
) {
  if (packageJson && Object.prototype.hasOwnProperty.call(packageJson, "workspaces")) {
    return "package.json";
  }

  for (const path of ["pnpm-workspace.yaml", "turbo.json", "lerna.json", "nx.json"]) {
    if (hasFile(files, path)) {
      return path;
    }
  }

  return null;
}

export function scanRepositoryCompatibility(
  files: RepositoryFileMap,
): CompatibilityResult {
  const findings: CompatibilityFinding[] = [];
  const { packageJson, finding } = parsePackageJson(files);

  if (finding) {
    findings.push(finding);
  }

  if (packageJson) {
    if (!packageJson.scripts?.build) {
      findings.push({
        code: "MISSING_BUILD_SCRIPT",
        severity: "error",
        message: "package.json must include a build script.",
        path: "package.json",
      });
    }

    if (!packageJson.scripts?.start) {
      findings.push({
        code: "MISSING_START_SCRIPT",
        severity: "warning",
        message:
          "package.json is missing a start script; the portal can add \"next start\".",
      });
    }

    if (!packageJson.engines?.node) {
      findings.push({
        code: "MISSING_NODE_ENGINE",
        severity: "warning",
        message:
          "package.json is missing engines.node; the portal can add \">=24\".",
      });
    }

    if (!hasNextDependency(packageJson)) {
      findings.push({
        code: "UNSUPPORTED_APP_SHAPE",
        severity: "error",
        message: "V1 supports root Next.js apps only.",
      });
    }
  }

  if (hasUnsupportedLockfile(files)) {
    findings.push({
      code: "UNSUPPORTED_LOCKFILE",
      severity: "error",
      message:
        "V1 supports npm package-lock.json or npm install fallback only.",
    });
  }

  const workspaceRootPath = getWorkspaceRootPath(files, packageJson);

  if (workspaceRootPath) {
    findings.push({
      code: "UNSUPPORTED_WORKSPACE_ROOT",
      severity: "error",
      message: "V1 supports single root Next.js apps, not workspace roots.",
      path: workspaceRootPath,
    });
  }

  for (const path of PUBLISHING_BUNDLE_PATHS) {
    if (hasFile(files, path)) {
      findings.push({
        code: "FILE_CONFLICT",
        severity: "error",
        message: `${path} already exists and will not be overwritten.`,
        path,
      });
    }
  }

  const hasConflicts = findings.some((item) => item.code === "FILE_CONFLICT");
  const hasErrors = findings.some((item) => item.severity === "error");
  const hasWarnings = findings.some((item) => item.severity === "warning");

  if (hasConflicts) {
    return { status: "CONFLICTED", findings, canDirectCommit: false };
  }

  if (hasErrors) {
    return { status: "UNSUPPORTED", findings, canDirectCommit: false };
  }

  if (hasWarnings) {
    return { status: "NEEDS_ADDITIONS", findings, canDirectCommit: true };
  }

  return { status: "COMPATIBLE", findings, canDirectCommit: true };
}
