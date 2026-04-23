import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => /^postgres(ql)?:\/\//i.test(value),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),
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
