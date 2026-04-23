import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

type JwtTokenWithEntraOid = {
  sub?: string;
  entraOid?: string;
};

const authEntraIdId =
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "placeholder-client-id";
const authEntraIdSecret =
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "placeholder-client-secret";
const authEntraIdIssuer =
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ??
  "https://login.microsoftonline.com/placeholder/v2.0";

export const authConfig = {
  session: { strategy: "jwt" },
  providers: [
    MicrosoftEntraID({
      clientId: authEntraIdId,
      clientSecret: authEntraIdSecret,
      issuer: authEntraIdIssuer,
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
