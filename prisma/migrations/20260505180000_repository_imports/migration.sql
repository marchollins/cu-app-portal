-- AlterEnum
ALTER TYPE "SourceOfTruth" ADD VALUE 'IMPORTED_REPOSITORY';

-- CreateEnum
CREATE TYPE "RepositoryImportStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RepositoryCompatibilityStatus" AS ENUM ('NOT_SCANNED', 'COMPATIBLE', 'NEEDS_ADDITIONS', 'UNSUPPORTED', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "RepositoryPreparationMode" AS ENUM ('DIRECT_COMMIT', 'PULL_REQUEST');

-- CreateEnum
CREATE TYPE "RepositoryPreparationStatus" AS ENUM ('NOT_STARTED', 'PENDING_USER_CHOICE', 'RUNNING', 'COMMITTED', 'PULL_REQUEST_OPENED', 'FAILED', 'BLOCKED');

-- CreateTable
CREATE TABLE "RepositoryImport" (
    "id" TEXT NOT NULL,
    "appRequestId" TEXT NOT NULL,
    "sourceRepositoryUrl" TEXT NOT NULL,
    "sourceRepositoryOwner" TEXT NOT NULL,
    "sourceRepositoryName" TEXT NOT NULL,
    "sourceRepositoryDefaultBranch" TEXT,
    "targetRepositoryOwner" TEXT NOT NULL,
    "targetRepositoryName" TEXT NOT NULL,
    "targetRepositoryUrl" TEXT,
    "targetRepositoryDefaultBranch" TEXT,
    "importStatus" "RepositoryImportStatus" NOT NULL,
    "importErrorSummary" TEXT,
    "compatibilityStatus" "RepositoryCompatibilityStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "compatibilityFindings" JSONB NOT NULL,
    "preparationMode" "RepositoryPreparationMode",
    "preparationStatus" "RepositoryPreparationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "preparationBranch" TEXT,
    "preparationPullRequestUrl" TEXT,
    "preparationErrorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryImport_appRequestId_key" ON "RepositoryImport"("appRequestId");

-- AddForeignKey
ALTER TABLE "RepositoryImport" ADD CONSTRAINT "RepositoryImport_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
