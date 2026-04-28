CREATE TYPE "SourceOfTruth" AS ENUM ('PORTAL_MANAGED_REPO');

CREATE TYPE "RepositoryProvider" AS ENUM ('GITHUB');

CREATE TYPE "RepositoryStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TYPE "PublishStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'PROVISIONING', 'DEPLOYING', 'SUCCEEDED', 'FAILED');

CREATE TYPE "PublishAttemptStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TYPE "PublishAttemptStage" AS ENUM ('QUEUED', 'PROVISIONING', 'DEPLOYING', 'VERIFYING', 'COMPLETED', 'FAILED');

ALTER TABLE "AppRequest"
ADD COLUMN "sourceOfTruth" "SourceOfTruth" NOT NULL DEFAULT 'PORTAL_MANAGED_REPO',
ADD COLUMN "repositoryProvider" "RepositoryProvider",
ADD COLUMN "repositoryOwner" TEXT,
ADD COLUMN "repositoryName" TEXT,
ADD COLUMN "repositoryUrl" TEXT,
ADD COLUMN "repositoryDefaultBranch" TEXT,
ADD COLUMN "repositoryVisibility" TEXT,
ADD COLUMN "repositoryStatus" "RepositoryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "publishStatus" "PublishStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "publishUrl" TEXT,
ADD COLUMN "publishErrorSummary" TEXT,
ADD COLUMN "lastPublishedAt" TIMESTAMP(3);

CREATE TABLE "PublishAttempt" (
    "id" TEXT NOT NULL,
    "appRequestId" TEXT NOT NULL,
    "status" "PublishAttemptStatus" NOT NULL,
    "stage" "PublishAttemptStage" NOT NULL,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
