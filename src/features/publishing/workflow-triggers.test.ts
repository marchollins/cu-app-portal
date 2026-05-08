import { describe, expect, it } from "vitest";
import { enablePushTriggerForAzureWorkflow } from "./workflow-triggers";

const manualWorkflow = `name: Deploy to Azure App Service

on:
  workflow_dispatch:

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}
  DEPLOY_PACKAGE_PATH: release

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
`;

describe("enablePushTriggerForAzureWorkflow", () => {
  it("adds a default-branch push trigger while keeping manual dispatch", () => {
    const result = enablePushTriggerForAzureWorkflow(manualWorkflow, "main");

    expect(result.changed).toBe(true);
    expect(result.content).toContain("on:\n  workflow_dispatch:");
    expect(result.content).toContain("push:\n    branches:\n      - main");
  });

  it("returns unchanged content when a push trigger is already present", () => {
    const workflow = manualWorkflow.replace(
      "on:\n  workflow_dispatch:\n",
      "on:\n  workflow_dispatch:\n  push:\n    branches:\n      - main\n",
    );

    expect(enablePushTriggerForAzureWorkflow(workflow, "main")).toEqual({
      changed: false,
      content: workflow,
    });
  });

  it("refuses unrecognized workflow content", () => {
    expect(() =>
      enablePushTriggerForAzureWorkflow("name: Custom\n", "main"),
    ).toThrow(
      "Deployment workflow is not a recognized portal-managed Azure workflow.",
    );
  });
});
