import { z } from "zod";

export type HostingTargetOptions = [string, ...string[]];

function toAzureAppSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function createAppSchema(hostingTargets: HostingTargetOptions) {
  return z.object({
    appName: z
      .string()
      .trim()
      .min(1, "Enter an app name.")
      .superRefine((value, ctx) => {
        const slug = toAzureAppSlug(value);

        if (!slug) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Use letters or numbers in the app name.",
          });
        }

        if (slug.length > 60) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Use a shorter app name so the Azure app name stays within 60 characters.",
          });
        }
      }),
    description: z.string().trim().min(1, "Enter a short description."),
    hostingTarget: z.enum(hostingTargets, {
      errorMap: () => ({
        message: `Choose one of: ${hostingTargets.join(", ")}.`,
      }),
    }),
  });
}

export type CreateAppInput = z.infer<ReturnType<typeof createAppSchema>>;
