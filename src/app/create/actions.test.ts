import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppAction, extractCreateAppInput } from "./actions";

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("extractCreateAppInput", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
  });

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

  it("rejects unknown templates", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "missing-template");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Vercel");

    await expect(extractCreateAppInput(formData)).rejects.toThrow(
      "Invalid template selection.",
    );
  });
});

describe("createAppAction", () => {
  it("redirects to the pending download page for the validated template", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Vercel");

    await createAppAction(formData);

    expect(mockRedirect).toHaveBeenCalledWith(
      "/download/pending?template=web-app",
    );
  });
});
