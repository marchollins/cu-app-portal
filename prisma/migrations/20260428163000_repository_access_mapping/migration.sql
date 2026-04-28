-- AlterTable
ALTER TABLE "User"
ADD COLUMN "githubUsername" TEXT;

-- CreateEnum
CREATE TYPE "RepositoryAccessStatus" AS ENUM ('NOT_REQUESTED', 'INVITED', 'GRANTED', 'FAILED');

-- AlterTable
ALTER TABLE "AppRequest"
ADD COLUMN "repositoryAccessStatus" "RepositoryAccessStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN "repositoryAccessNote" TEXT;
