import { describe, expect, it, vi } from "vitest";
import { logoutAction } from "./logout";

const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock("@/auth/session", () => ({
  signOut: mockSignOut,
}));

describe("logoutAction", () => {
  it("signs out and returns users home", async () => {
    await logoutAction();

    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
