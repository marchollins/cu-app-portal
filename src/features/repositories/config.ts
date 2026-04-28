import { z } from "zod";

const visibilitySchema = z.enum(["private", "internal", "public"]);

const githubAppConfigSchema = z
  .object({
    GITHUB_APP_ID: z.string().regex(/^\d+$/),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
    GITHUB_ALLOWED_ORGS: z.string().min(1),
    GITHUB_DEFAULT_ORG: z.string().min(1),
    GITHUB_DEFAULT_REPO_VISIBILITY: visibilitySchema.default("private"),
    GITHUB_APP_INSTALLATION_ID: z.string().regex(/^\d+$/).optional(),
    GITHUB_APP_INSTALLATIONS_JSON: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.GITHUB_APP_INSTALLATION_ID && !value.GITHUB_APP_INSTALLATIONS_JSON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide GITHUB_APP_INSTALLATION_ID or GITHUB_APP_INSTALLATIONS_JSON.",
      });
    }
  });

export type GitHubRepoVisibility = z.infer<typeof visibilitySchema>;

export type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  allowedOrgs: string[];
  defaultOrg: string;
  defaultRepoVisibility: GitHubRepoVisibility;
  installationIdsByOrg: Record<string, string>;
};

function parseInstallationIds(
  defaultOrg: string,
  defaultInstallationId: string | undefined,
  rawInstallations: string | undefined,
) {
  if (rawInstallations) {
    const parsed = z.record(z.string().regex(/^\d+$/)).parse(
      JSON.parse(rawInstallations) as unknown,
    );

    return parsed;
  }

  if (!defaultInstallationId) {
    throw new Error(
      "Provide GITHUB_APP_INSTALLATION_ID or GITHUB_APP_INSTALLATIONS_JSON.",
    );
  }

  return {
    [defaultOrg]: defaultInstallationId,
  };
}

export function loadGitHubAppConfig(
  source: Record<string, string | undefined> = process.env,
): GitHubAppConfig {
  const parsed = githubAppConfigSchema.parse(source);
  const allowedOrgs = parsed.GITHUB_ALLOWED_ORGS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowedOrgs.includes(parsed.GITHUB_DEFAULT_ORG)) {
    allowedOrgs.push(parsed.GITHUB_DEFAULT_ORG);
  }

  return {
    appId: parsed.GITHUB_APP_ID,
    privateKey: parsed.GITHUB_APP_PRIVATE_KEY,
    allowedOrgs,
    defaultOrg: parsed.GITHUB_DEFAULT_ORG,
    defaultRepoVisibility: parsed.GITHUB_DEFAULT_REPO_VISIBILITY,
    installationIdsByOrg: parseInstallationIds(
      parsed.GITHUB_DEFAULT_ORG,
      parsed.GITHUB_APP_INSTALLATION_ID,
      parsed.GITHUB_APP_INSTALLATIONS_JSON,
    ),
  };
}
