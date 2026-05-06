"use server";

import { signOut } from "@/auth/session";

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
