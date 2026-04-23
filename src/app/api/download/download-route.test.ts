import { describe, expect, it } from "vitest";
import { createDownloadHeaders } from "./headers";

describe("createDownloadHeaders", () => {
  it("sets a zip content type and attachment filename", () => {
    const headers = createDownloadHeaders("campus-dashboard.zip");

    expect(headers.get("content-type")).toBe("application/zip");
    expect(headers.get("content-disposition")).toContain("campus-dashboard.zip");
  });
});
