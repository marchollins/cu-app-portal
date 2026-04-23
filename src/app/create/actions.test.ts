import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildArchive } from "@/features/generation/build-archive";
import { saveArtifact } from "@/features/generation/storage";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createAppAction, extractCreateAppInput } from "./actions";

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/features/generation/build-archive", () => ({
  buildArchive: vi.fn(),
}));

vi.mock("@/features/generation/storage", () => ({
  saveArtifact: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      create: vi.fn(),
      update: vi.fn(),
    },
    generatedArtifact: {
      create: vi.fn(),
    },
  },
}));

describe("extractCreateAppInput", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    vi.mocked(buildArchive).mockReset();
    vi.mocked(saveArtifact).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(prisma.appRequest.create).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.generatedArtifact.create).mockReset();
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
  it("generates an archive, stores it, and redirects to the download page", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Vercel");

    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockResolvedValue({
      id: "artifact-123",
    } as Awaited<ReturnType<typeof prisma.generatedArtifact.create>>);

    await createAppAction(formData);

    expect(buildArchive).toHaveBeenCalledWith({
      templateSlug: "web-app",
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });
    expect(saveArtifact).toHaveBeenCalledWith(
      "campus-dashboard.zip",
      Buffer.from("zip"),
    );
    expect(prisma.appRequest.create).toHaveBeenCalled();
    expect(prisma.generatedArtifact.create).toHaveBeenCalled();
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: { generationStatus: "SUCCEEDED" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_REQUEST_SUCCEEDED",
      expect.objectContaining({ requestId: "request-123" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/download/request-123");
  });

  it("marks the request failed when archive generation throws", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Vercel");

    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-456",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockRejectedValue(new Error("zip failed"));

    await expect(createAppAction(formData)).rejects.toThrow("zip failed");

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-456" },
      data: { generationStatus: "FAILED" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_REQUEST_FAILED",
      expect.objectContaining({
        requestId: "request-456",
        error: "zip failed",
      }),
    );
  });
});
