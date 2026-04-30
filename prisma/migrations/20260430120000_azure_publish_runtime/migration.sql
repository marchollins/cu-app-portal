ALTER TABLE "AppRequest"
ADD COLUMN "azureResourceGroup" TEXT,
ADD COLUMN "azureAppServicePlan" TEXT,
ADD COLUMN "azureWebAppName" TEXT,
ADD COLUMN "azurePostgresServer" TEXT,
ADD COLUMN "azureDatabaseName" TEXT,
ADD COLUMN "azureDefaultHostName" TEXT,
ADD COLUMN "customDomain" TEXT,
ADD COLUMN "primaryPublishUrl" TEXT;

ALTER TABLE "PublishAttempt"
ADD COLUMN "githubWorkflowRunId" TEXT,
ADD COLUMN "githubWorkflowRunUrl" TEXT,
ADD COLUMN "deploymentStartedAt" TIMESTAMP(3),
ADD COLUMN "verifiedAt" TIMESTAMP(3);
