import { getServerSession } from "@/auth/session";
import { loadArtifact } from "@/features/generation/storage";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createDownloadHeaders } from "../headers";

async function resolveDownloadUserId() {
  const session = await getServerSession();

  if (typeof session?.user?.id === "string") {
    return session.user.id;
  }

  if (process.env.E2E_AUTH_BYPASS === "true") {
    const fallbackUser = await prisma.user.upsert({
      where: { entraOid: "e2e-bypass-user" },
      update: {
        email: "e2e-bypass@cedarville.edu",
        displayName: "E2E Bypass User",
      },
      create: {
        entraOid: "e2e-bypass-user",
        email: "e2e-bypass@cedarville.edu",
        displayName: "E2E Bypass User",
      },
    });

    return fallbackUser.id;
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const userId = await resolveDownloadUserId();

  if (typeof userId !== "string") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { requestId } = await params;
  const appRequest = await prisma.appRequest.findFirst({
    where: {
      id: requestId,
      userId,
    },
    select: {
      id: true,
      supportReference: true,
      artifact: {
        select: {
          storagePath: true,
          filename: true,
          contentType: true,
        },
      },
    },
  });

  if (!appRequest?.artifact) {
    return new Response("Not Found", { status: 404 });
  }

  const buffer = await loadArtifact(appRequest.artifact.storagePath);
  const headers = createDownloadHeaders(appRequest.artifact.filename);
  headers.set("content-type", appRequest.artifact.contentType);

  await recordAuditEvent("ARTIFACT_DOWNLOADED", {
    requestId: appRequest.id,
    supportReference: appRequest.supportReference,
  });

  return new Response(buffer, { status: 200, headers });
}
