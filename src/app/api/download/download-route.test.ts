import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDownloadHeaders } from "./headers";
import { GET } from "./[requestId]/route";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const loadArtifactMock = vi.hoisted(() => vi.fn());
const recordAuditEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/session", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/features/generation/storage", () => ({
  loadArtifact: loadArtifactMock,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/db");

describe("createDownloadHeaders", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    loadArtifactMock.mockReset();
    recordAuditEventMock.mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
  });

  it("sets a zip content type and attachment filename", () => {
    const headers = createDownloadHeaders("campus-dashboard.zip");

    expect(headers.get("content-type")).toBe("application/zip");
    expect(headers.get("content-disposition")).toContain("campus-dashboard.zip");
  });

  it("returns 401 when no authenticated user is present", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/download/req_123"),
      { params: Promise.resolve({ requestId: "req_123" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the request does not belong to the current user", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-123" } });
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/download/req_123"),
      { params: Promise.resolve({ requestId: "req_123" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns the artifact for the owning user and records the download", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-123" } });
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      supportReference: "SUP-20260423-ABCD1234",
      artifact: {
        storagePath: "/tmp/.artifacts/campus-dashboard.zip",
        filename: "campus-dashboard.zip",
        contentType: "application/zip",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    loadArtifactMock.mockResolvedValue(Buffer.from("zip-data"));

    const response = await GET(
      new Request("http://localhost/api/download/req_123"),
      { params: Promise.resolve({ requestId: "req_123" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(
      "campus-dashboard.zip",
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(
      "zip-data",
    );
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "ARTIFACT_DOWNLOADED",
      expect.objectContaining({
        requestId: "req_123",
        supportReference: "SUP-20260423-ABCD1234",
      }),
    );
  });

  it("uses the fallback e2e user when bypass mode is enabled", async () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    getServerSessionMock.mockResolvedValue(null);
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: "e2e-user-123",
    } as Awaited<ReturnType<typeof prisma.user.upsert>>);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      supportReference: "SUP-20260423-ABCD1234",
      artifact: {
        storagePath: "/tmp/.artifacts/campus-dashboard.zip",
        filename: "campus-dashboard.zip",
        contentType: "application/zip",
      },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    loadArtifactMock.mockResolvedValue(Buffer.from("zip-data"));

    const response = await GET(
      new Request("http://localhost/api/download/req_123"),
      { params: Promise.resolve({ requestId: "req_123" }) },
    );

    expect(response.status).toBe(200);
    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "e2e-user-123",
        }),
      }),
    );
  });
});
