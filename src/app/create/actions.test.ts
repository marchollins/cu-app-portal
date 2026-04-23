import { describe, expect, it } from "vitest";
import { extractCreateAppInput } from "./actions";

describe("extractCreateAppInput", () => {
  it("builds the validated payload from form data", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Vercel");

    const input = await extractCreateAppInput(formData);

    expect(input.appName).toBe("Campus Dashboard");
    expect(input.templateSlug).toBe("web-app");
  });
});
