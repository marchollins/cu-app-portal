import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { recordAuditEvent } from "@/lib/audit";
import { z } from "zod";

const authEnvSchema = z.object({
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: z.string().url(),
});

function isE2EAuthBypassEnabled() {
  return process.env.E2E_AUTH_BYPASS === "true";
}

export async function authConfig() {
  if (isE2EAuthBypassEnabled()) {
    return {
      session: { strategy: "jwt" },
      providers: [],
      callbacks: {
        async signIn() {
          return true;
        },
        async authorized() {
          return true;
        },
        async jwt({ token }) {
          return token;
        },
        async session({ session }) {
          return session;
        },
      },
    } satisfies NextAuthConfig;
  }

  const authEnv = authEnvSchema.parse(process.env);

  return {
    session: { strategy: "jwt" },
    providers: [
      MicrosoftEntraID({
        clientId: authEnv.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: authEnv.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: authEnv.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      }),
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
        if (
          typeof profile?.oid !== "string" ||
          typeof user.email !== "string" ||
          typeof user.name !== "string"
        ) {
          return false;
        }

        try {
          const { prisma } = await import("@/lib/db");
          const syncedUser = await prisma.user.upsert({
            where: { entraOid: profile.oid },
            update: {
              email: user.email,
              displayName: user.name,
            },
            create: {
              entraOid: profile.oid,
              email: user.email,
              displayName: user.name,
            },
          });

          user.id = syncedUser.id;

          await recordAuditEvent("SIGN_IN", {
            provider: account?.provider ?? "microsoft-entra-id",
            entraOid: profile.oid,
          });
        } catch {
          // Audit is best-effort; auth should still succeed.
        }
        return true;
      },
      async authorized({ auth }) {
        return isE2EAuthBypassEnabled() || !!auth?.user;
      },
      async jwt({ token, profile, user }) {
        if (typeof profile?.oid === "string") {
          token.entraOid = profile.oid;
        }

        if (typeof user?.id === "string") {
          token.userId = user.id;
          token.sub = user.id;
        }

        return token;
      },
      async session({ session, token }) {
        if (session.user && token.entraOid) {
          if (typeof token.userId === "string") {
            session.user.id = token.userId;
          }

          session.user.entraOid = token.entraOid;
        }
        return session;
      },
    },
  } satisfies NextAuthConfig;
}
