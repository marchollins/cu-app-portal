import NextAuth from "next-auth";
import { authConfig } from "./config";

const { auth } = NextAuth(authConfig);

export const getServerSession = auth;
