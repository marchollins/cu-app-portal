CREATE TYPE "DeploymentTriggerMode" AS ENUM ('PORTAL_DISPATCH', 'PUSH_TO_DEPLOY');

ALTER TABLE "AppRequest"
ADD COLUMN "deploymentTriggerMode" "DeploymentTriggerMode" NOT NULL DEFAULT 'PORTAL_DISPATCH';
