import { describe, expect, it } from "vitest";
import { buildCodexHandoffPrompt } from "./codex-handoff";

describe("buildCodexHandoffPrompt", () => {
  it("includes portal remote instructions for successfully imported repos", () => {
    const prompt = buildCodexHandoffPrompt(
      "https://github.com/cedarville-it/campus-dashboard",
      "Campus Dashboard",
      "req_123",
      {
        defaultBranch: "trunk",
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
      },
    );

    expect(prompt).toContain(
      "This app was imported from https://github.com/example/campus-dashboard.",
    );
    expect(prompt).toContain(
      "Keep the existing origin remote pointed at the source repository.",
    );
    expect(prompt).toContain(
      "git remote add portal https://github.com/cedarville-it/campus-dashboard",
    );
    expect(prompt).toContain("git fetch portal");
    expect(prompt).toContain("git pull portal trunk");
    expect(prompt).toContain("git push portal HEAD:trunk");
    expect(prompt).toContain(
      "Use the portal remote when preparing work for Cedarville App Portal publishing.",
    );
  });
});
