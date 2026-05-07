import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function gitLsFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

describe("secret hygiene", () => {
  it("does not track plaintext local env files", () => {
    const trackedFiles = gitLsFiles();
    const trackedEnvFiles = trackedFiles.filter(
      (file) =>
        /(^|\/)\.env(?:\.|$)/.test(file) &&
        !file.endsWith(".env.example") &&
        !file.endsWith(".env.example.template"),
    );

    expect(trackedEnvFiles).toEqual([]);
  });

  it("keeps secret-like example values blank", () => {
    const example = readFileSync(".env.example", "utf8");
    const assignedSecretValues = example
      .split(/\r?\n/)
      .filter((line) =>
        /^(?:[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY))=.+/.test(line),
      );

    expect(assignedSecretValues).toEqual([]);
  });

  it("does not publish obvious credential material in tracked text files", () => {
    const trackedFiles = gitLsFiles();
    const credentialPatterns = [
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
      /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
      /\bAZURE_CLIENT_SECRET\s*=/,
    ];

    const findings = trackedFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      return credentialPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(findings).toEqual([]);
  });
});
