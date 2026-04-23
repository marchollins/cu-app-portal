import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "@/auth/config";

export const config = {
  matcher: ["/create/:path*", "/download/:path*"],
};

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { default: NextAuth } = await import("next-auth");
  const { auth } = NextAuth(async () => authConfig());
  return (auth as any)(request, event);
}
