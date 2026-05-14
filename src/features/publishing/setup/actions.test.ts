import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";
import { repairPublishingSetupAction } from "./actions";
import { repairPublishingSetup } from "./service";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("./service", () => ({
  repairPublishingSetup: vi.fn(),
}));

describe("publishing setup actions", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(repairPublishingSetup).mockReset();
  });

  it("repairs publishing setup for an owned app request", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(repairPublishingSetup).mockResolvedValue(undefined);

    await repairPublishingSetupAction("request-123");

    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        userId: "user-123",
      },
    });
    expect(repairPublishingSetup).toHaveBeenCalledWith("request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
  });

  it("rejects missing or unauthorized app requests without repairing setup", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      "App request not found.",
    );

    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        userId: "user-123",
      },
    });
    expect(repairPublishingSetup).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates app views when repair fails for an owned app request", async () => {
    const repairError = new Error("repair failed");
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(repairPublishingSetup).mockRejectedValue(repairError);

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      repairError,
    );

    expect(repairPublishingSetup).toHaveBeenCalledWith("request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
  });
});
