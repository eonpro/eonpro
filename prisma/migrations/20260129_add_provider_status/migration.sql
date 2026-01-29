-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'SUSPENDED');

-- AlterTable: Add status and archive tracking fields to Provider
ALTER TABLE "Provider" ADD COLUMN "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Provider" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Provider" ADD COLUMN "archivedBy" INTEGER;

-- CreateIndex: Index on status for efficient filtering
CREATE INDEX "Provider_status_idx" ON "Provider"("status");
