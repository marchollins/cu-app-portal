export const AZURE_DEPLOY_WORKFLOW_PATH =
  ".github/workflows/deploy-azure-app-service.yml";

type WorkflowPatchResult = {
  content: string;
  changed: boolean;
};

function assertPortalManagedAzureWorkflow(workflow: string) {
  if (
    !workflow.includes("name: Deploy to Azure App Service") ||
    !workflow.includes("azure/webapps-deploy@v3") ||
    !workflow.includes("AZURE_WEBAPP_NAME: ${{ secrets.AZURE_WEBAPP_NAME }}")
  ) {
    throw new Error(
      "Deployment workflow is not a recognized portal-managed Azure workflow.",
    );
  }
}

export function enablePushTriggerForAzureWorkflow(
  workflow: string,
  defaultBranch: string,
): WorkflowPatchResult {
  assertPortalManagedAzureWorkflow(workflow);

  if (workflow.includes("push:\n    branches:")) {
    return {
      content: workflow,
      changed: false,
    };
  }

  const manualDispatchTrigger = "on:\n  workflow_dispatch:\n";

  if (!workflow.includes(manualDispatchTrigger)) {
    throw new Error(
      "Deployment workflow does not have the expected manual dispatch trigger.",
    );
  }

  return {
    changed: true,
    content: workflow.replace(
      manualDispatchTrigger,
      `on:\n  workflow_dispatch:\n  push:\n    branches:\n      - ${defaultBranch}\n`,
    ),
  };
}
