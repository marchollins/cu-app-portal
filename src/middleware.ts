import NextAuth from "next-auth";
import { authConfig } from "@/auth/config";

export const { auth: middleware } = NextAuth(async () => authConfig());

export const config = {
  matcher: ["/create/:path*", "/download/:path*", "/apps/:path*"],
};
