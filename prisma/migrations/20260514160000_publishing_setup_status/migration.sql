-- CreateEnum
CREATE TYPE "PublishingSetupStatus" AS ENUM ('NOT_CHECKED', 'CHECKING', 'READY', 'NEEDS_REPAIR', 'REPAIRING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PublishSetupCheckStatus" AS ENUM ('PASS', 'WARN', 'FAIL', 'UNKNOWN');

-- AlterTable
ALTER TABLE "AppRequest"
ADD COLUMN "publishingSetupStatus" "PublishingSetupStatus" NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN "publishingSetupCheckedAt" TIMESTAMP(3),
ADD COLUMN "publishingSetupRepairedAt" TIMESTAMP(3),
ADD COLUMN "publishingSetupErrorSummary" TEXT;

-- CreateTable
CREATE TABLE "PublishSetupCheck" (
    "id" TEXT NOT NULL,
    "appRequestId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "status" "PublishSetupCheckStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishSetupCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishSetupCheck_appRequestId_idx" ON "PublishSetupCheck"("appRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishSetupCheck_appRequestId_checkKey_key" ON "PublishSetupCheck"("appRequestId", "checkKey");

-- AddForeignKey
ALTER TABLE "PublishSetupCheck" ADD CONSTRAINT "PublishSetupCheck_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
