import { z } from "zod";

const nonBlankString = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  "Must contain non-whitespace characters.",
);

const nonBlankUrlString = nonBlankString.pipe(z.string().url());

const azurePublishConfigSchema = z.object({
  AZURE_PUBLISH_RESOURCE_GROUP: nonBlankString,
  AZURE_PUBLISH_APP_SERVICE_PLAN: nonBlankString,
  AZURE_PUBLISH_POSTGRES_SERVER: nonBlankString,
  AZURE_PUBLISH_POSTGRES_ADMIN_USER: nonBlankString,
  AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD: nonBlankString,
  AZURE_PUBLISH_LOCATION: nonBlankString,
  AZURE_PUBLISH_RUNTIME_STACK: z.literal("NODE|24-lts"),
  AZURE_PUBLISH_CLIENT_ID: nonBlankString,
  AZURE_PUBLISH_TENANT_ID: nonBlankString,
  AZURE_PUBLISH_SUBSCRIPTION_ID: nonBlankString,
  AZURE_PUBLISH_AUTH_SECRET: nonBlankString,
  AZURE_PUBLISH_ENTRA_CLIENT_ID: nonBlankString,
  AZURE_PUBLISH_ENTRA_CLIENT_SECRET: nonBlankString,
  AZURE_PUBLISH_ENTRA_ISSUER: nonBlankUrlString,
  AZURE_PUBLISH_ENTRA_APP_OBJECT_ID: nonBlankString,
});

export type AzurePublishConfig = {
  resourceGroup: string;
  appServicePlan: string;
  postgresServer: string;
  postgresAdminUser: string;
  postgresAdminPassword: string;
  location: string;
  runtimeStack: "NODE|24-lts";
  azureClientId: string;
  azureTenantId: string;
  azureSubscriptionId: string;
  authSecret: string;
  entraClientId: string;
  entraClientSecret: string;
  entraIssuer: string;
  entraAppObjectId: string;
};

export function loadAzurePublishConfig(
  source: Record<string, string | undefined> = process.env,
): AzurePublishConfig {
  const parsed = azurePublishConfigSchema.parse(source);

  return {
    resourceGroup: parsed.AZURE_PUBLISH_RESOURCE_GROUP,
    appServicePlan: parsed.AZURE_PUBLISH_APP_SERVICE_PLAN,
    postgresServer: parsed.AZURE_PUBLISH_POSTGRES_SERVER,
    postgresAdminUser: parsed.AZURE_PUBLISH_POSTGRES_ADMIN_USER,
    postgresAdminPassword: parsed.AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD,
    location: parsed.AZURE_PUBLISH_LOCATION,
    runtimeStack: parsed.AZURE_PUBLISH_RUNTIME_STACK,
    azureClientId: parsed.AZURE_PUBLISH_CLIENT_ID,
    azureTenantId: parsed.AZURE_PUBLISH_TENANT_ID,
    azureSubscriptionId: parsed.AZURE_PUBLISH_SUBSCRIPTION_ID,
    authSecret: parsed.AZURE_PUBLISH_AUTH_SECRET,
    entraClientId: parsed.AZURE_PUBLISH_ENTRA_CLIENT_ID,
    entraClientSecret: parsed.AZURE_PUBLISH_ENTRA_CLIENT_SECRET,
    entraIssuer: parsed.AZURE_PUBLISH_ENTRA_ISSUER,
    entraAppObjectId: parsed.AZURE_PUBLISH_ENTRA_APP_OBJECT_ID,
  };
}
