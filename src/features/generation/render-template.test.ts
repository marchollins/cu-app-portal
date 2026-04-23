import { describe, expect, it } from "vitest";
import { buildTokenMap } from "./token-replacements";
import { renderTemplateString } from "./render-template";

describe("renderTemplateString", () => {
  it("replaces known template tokens", () => {
    const output = renderTemplateString("Name: {{APP_NAME}}", {
      APP_NAME: "Campus Dashboard",
    });

    expect(output).toBe("Name: Campus Dashboard");
  });
});

describe("buildTokenMap", () => {
  it("builds template token replacements from app input", () => {
    const tokens = buildTokenMap({
      templateSlug: "web-app",
      appName: "Campus <Beta>",
      description: 'Tracks {housing} and "retention".',
      hostingTarget: "Vercel",
    });

    expect(tokens).toEqual({
      APP_NAME: "Campus <Beta>",
      APP_NAME_JS: '"Campus <Beta>"',
      APP_DESCRIPTION: 'Tracks {housing} and "retention".',
      APP_DESCRIPTION_JS: '"Tracks {housing} and \\"retention\\"."',
      HOSTING_TARGET: "Vercel",
    });
  });
});
