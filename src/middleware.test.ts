import { describe, expect, it } from "vitest";
import { config } from "./middleware";

describe("middleware config", () => {
  it("protects create and download routes", () => {
    expect(config.matcher).toContain("/create/:path*");
    expect(config.matcher).toContain("/download/:path*");
  });
});
