export type WorkflowTriggerPolicy = "portal_dispatch" | "push" | "external";

export type PublishingProviderCapabilities = {
  hostingTarget: string;
  supportsGeneratedTemplateOneStep: boolean;
  supportsPostSuccessPushToDeploy: boolean;
  triggerPolicy: WorkflowTriggerPolicy;
  workflowPath: string;
  workflowFileName: string;
  requiredSecrets: string[];
};

const AZURE_APP_SERVICE_CAPABILITIES: PublishingProviderCapabilities = {
  hostingTarget: "Azure App Service",
  supportsGeneratedTemplateOneStep: true,
  supportsPostSuccessPushToDeploy: true,
  triggerPolicy: "portal_dispatch",
  workflowPath: ".github/workflows/deploy-azure-app-service.yml",
  workflowFileName: "deploy-azure-app-service.yml",
  requiredSecrets: [
    "AZURE_CLIENT_ID",
    "AZURE_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_WEBAPP_NAME",
  ],
};

export function getPublishingProviderCapabilities(hostingTarget: string) {
  return hostingTarget === AZURE_APP_SERVICE_CAPABILITIES.hostingTarget
    ? AZURE_APP_SERVICE_CAPABILITIES
    : null;
}

export function supportsGeneratedTemplateOneStep(hostingTarget: string) {
  return (
    getPublishingProviderCapabilities(hostingTarget)
      ?.supportsGeneratedTemplateOneStep ?? false
  );
}

export function supportsPostSuccessPushToDeploy(hostingTarget: string) {
  return (
    getPublishingProviderCapabilities(hostingTarget)
      ?.supportsPostSuccessPushToDeploy ?? false
  );
}
