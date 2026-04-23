import { z } from "zod";

export const createAppSchema = z.object({
  appName: z.string().trim().min(1, "Enter an app name."),
  description: z.string().trim().min(1, "Enter a short description."),
  hostingTarget: z.string().trim().min(1, "Choose a hosting target."),
});

export type CreateAppInput = z.infer<typeof createAppSchema>;
