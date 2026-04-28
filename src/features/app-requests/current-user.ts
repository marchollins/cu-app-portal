import { getServerSession } from "@/auth/session";
import { prisma } from "@/lib/db";

export async function getCurrentUserIdOrNull() {
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

export async function resolveCurrentUserId() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    throw new Error("Authenticated user not found.");
  }

  return userId;
}
