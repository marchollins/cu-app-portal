import { describe, expect, it } from "vitest";
import { getActiveTemplates, serializeTemplateForStorage } from "./catalog";

describe("getActiveTemplates", () => {
  it("returns at least one active template", () => {
    const templates = getActiveTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]?.slug).toBe("web-app");
  });

  it("keeps the current web-app template Azure-only in UI and stored metadata", () => {
    const template = getActiveTemplates()[0];

    expect(template).toBeTruthy();
    expect(
      template?.fields.find((field) => field.name === "hostingTarget"),
    ).toEqual({
      name: "hostingTarget",
      label: "Hosting Target",
      type: "select",
      required: true,
      options: ["Azure App Service"],
    });

    expect(serializeTemplateForStorage(template!)).toMatchObject({
      hostingOptions: ["Azure App Service"],
    });
  });
});
