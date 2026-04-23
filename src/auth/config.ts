import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export async function authConfig() {
  const { env } = await import("@/lib/env");

  return {
    session: { strategy: "jwt" },
    providers: [
      MicrosoftEntraID({
        clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      }),
    ],
    callbacks: {
      async jwt({ token, profile }) {
        if (typeof profile?.oid === "string") {
          token.entraOid = profile.oid;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.entraOid) {
          if (typeof token.sub === "string") {
            session.user.id = token.sub;
          }

          session.user.entraOid = token.entraOid;
        }
        return session;
      },
    },
  } satisfies NextAuthConfig;
}
