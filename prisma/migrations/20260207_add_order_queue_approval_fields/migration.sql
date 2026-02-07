-- AlterTable: Admin queue → provider approval workflow (enterprise compliance)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "queuedForProviderAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "queuedByUserId" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "approvedByUserId" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

-- CreateIndex: efficient queue listing by clinic + status
CREATE INDEX IF NOT EXISTS "Order_clinicId_status_idx" ON "Order"("clinicId", "status");
