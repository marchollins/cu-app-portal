import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { z } from "zod";

const authEnvSchema = z.object({
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: z.string().url(),
});

export async function authConfig() {
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
