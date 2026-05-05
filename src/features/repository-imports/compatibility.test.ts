import { describe, expect, it } from "vitest";
import { scanRepositoryCompatibility } from "./compatibility";

describe("scanRepositoryCompatibility", () => {
  it("accepts a root Next-style npm app that already has build and start scripts", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "package-lock.json": "{}",
      }),
    ).toEqual({
      status: "COMPATIBLE",
      findings: [],
      canDirectCommit: true,
    });
  });

  it("marks safe additions when start and engines are missing", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build" },
          dependencies: { next: "15.5.15" },
        }),
      }),
    ).toEqual({
      status: "NEEDS_ADDITIONS",
      findings: [
        {
          code: "MISSING_START_SCRIPT",
          severity: "warning",
          message: "package.json is missing a start script; the portal can add \"next start\".",
        },
        {
          code: "MISSING_NODE_ENGINE",
          severity: "warning",
          message: "package.json is missing engines.node; the portal can add \">=24\".",
        },
      ],
      canDirectCommit: true,
    });
  });

  it("rejects unsupported package manager lockfiles", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
        }),
        "pnpm-lock.yaml": "lockfileVersion: 9",
      }).status,
    ).toBe("UNSUPPORTED");
  });

  it("requires a root package.json", () => {
    expect(scanRepositoryCompatibility({})).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "MISSING_PACKAGE_JSON",
          severity: "error",
          message: "A root package.json is required for v1 Azure publishing.",
          path: "package.json",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("marks invalid package.json content separately from missing package.json", () => {
    expect(scanRepositoryCompatibility({ "package.json": "" })).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "INVALID_PACKAGE_JSON",
          severity: "error",
          message: "package.json must be valid JSON.",
          path: "package.json",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects null package.json root values as invalid JSON shape", () => {
    expect(scanRepositoryCompatibility({ "package.json": "null" })).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "INVALID_PACKAGE_JSON",
          severity: "error",
          message: "package.json must be a JSON object.",
          path: "package.json",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects array package.json root values as invalid JSON shape", () => {
    expect(scanRepositoryCompatibility({ "package.json": "[]" })).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "INVALID_PACKAGE_JSON",
          severity: "error",
          message: "package.json must be a JSON object.",
          path: "package.json",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects package.json files without a build script", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "MISSING_BUILD_SCRIPT",
          severity: "error",
          message: "package.json must include a build script.",
          path: "package.json",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects apps without a Next dependency", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "vite build", start: "vite preview" },
          dependencies: { vite: "7.0.0" },
          engines: { node: ">=24" },
        }),
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_APP_SHAPE",
          severity: "error",
          message: "V1 supports root Next.js apps only.",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects yarn.lock by path presence even when empty", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "yarn.lock": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_LOCKFILE",
          severity: "error",
          message:
            "V1 supports npm package-lock.json or npm install fallback only.",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects bun.lockb by path presence even when empty", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "bun.lockb": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_LOCKFILE",
          severity: "error",
          message:
            "V1 supports npm package-lock.json or npm install fallback only.",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects bun.lock by path presence even when empty", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "bun.lock": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_LOCKFILE",
          severity: "error",
          message:
            "V1 supports npm package-lock.json or npm install fallback only.",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("prioritizes conflicts over other compatibility errors", () => {
    const result = scanRepositoryCompatibility({
      "package.json": JSON.stringify({
        scripts: { start: "vite preview" },
        dependencies: { vite: "7.0.0" },
      }),
      "app-portal/deployment-manifest.json": "{}",
    });

    expect(result.status).toBe("CONFLICTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.findings).toContainEqual({
      code: "FILE_CONFLICT",
      severity: "error",
      message: "app-portal/deployment-manifest.json already exists and will not be overwritten.",
      path: "app-portal/deployment-manifest.json",
    });
    expect(result.findings).toContainEqual({
      code: "MISSING_BUILD_SCRIPT",
      severity: "error",
      message: "package.json must include a build script.",
      path: "package.json",
    });
    expect(result.findings).toContainEqual({
      code: "UNSUPPORTED_APP_SHAPE",
      severity: "error",
      message: "V1 supports root Next.js apps only.",
    });
  });

  it("rejects package.json workspaces as unsupported workspace roots", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
          workspaces: ["apps/*"],
        }),
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_WORKSPACE_ROOT",
          severity: "error",
          message: "V1 supports single root Next.js apps, not workspace roots.",
          path: "package.json",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects turbo.json as an unsupported workspace root marker", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "turbo.json": "{}",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_WORKSPACE_ROOT",
          severity: "error",
          message: "V1 supports single root Next.js apps, not workspace roots.",
          path: "turbo.json",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("rejects pnpm-workspace.yaml as an unsupported workspace root marker", () => {
    expect(
      scanRepositoryCompatibility({
        "package.json": JSON.stringify({
          scripts: { build: "next build", start: "next start" },
          dependencies: { next: "15.5.15" },
          engines: { node: ">=24" },
        }),
        "pnpm-workspace.yaml": "",
      }),
    ).toEqual({
      status: "UNSUPPORTED",
      findings: [
        {
          code: "UNSUPPORTED_WORKSPACE_ROOT",
          severity: "error",
          message: "V1 supports single root Next.js apps, not workspace roots.",
          path: "pnpm-workspace.yaml",
        },
      ],
      canDirectCommit: false,
    });
  });

  it("records file conflicts without overwriting existing publishing files", () => {
    const result = scanRepositoryCompatibility({
      "package.json": JSON.stringify({
        scripts: { build: "next build", start: "next start" },
        dependencies: { next: "15.5.15" },
      }),
      "app-portal/deployment-manifest.json": "{}",
    });

    expect(result.status).toBe("CONFLICTED");
    expect(result.canDirectCommit).toBe(false);
    expect(result.findings).toContainEqual({
      code: "FILE_CONFLICT",
      severity: "error",
      message: "app-portal/deployment-manifest.json already exists and will not be overwritten.",
      path: "app-portal/deployment-manifest.json",
    });
  });
});
