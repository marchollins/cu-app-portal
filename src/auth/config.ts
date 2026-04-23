import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { env } from "@/lib/env";

type JwtTokenWithEntraOid = {
  sub?: string;
  entraOid?: string;
};

export const authConfig = {
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
      if (profile?.oid) {
        (token as JwtTokenWithEntraOid).entraOid = String(profile.oid);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && (token as JwtTokenWithEntraOid).entraOid) {
        const user = session.user as typeof session.user & {
          id: string;
          entraOid: string;
        };

        user.id = String(token.sub);
        user.entraOid = String((token as JwtTokenWithEntraOid).entraOid);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
