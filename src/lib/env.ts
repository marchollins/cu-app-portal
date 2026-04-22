import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().min(1),
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: z.string().url(),
});

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
) {
  return envSchema.parse(source);
}

export const env = loadEnv();
