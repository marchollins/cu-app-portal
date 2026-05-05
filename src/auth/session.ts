import NextAuth from "next-auth";
import { authConfig } from "./config";

const { auth, signOut } = NextAuth(authConfig);

export const getServerSession = auth;
export { signOut };
