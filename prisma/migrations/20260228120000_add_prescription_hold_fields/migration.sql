-- AlterTable: Add prescription hold fields to Invoice
ALTER TABLE "Invoice" ADD COLUMN "prescriptionHoldReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "prescriptionHeldAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "prescriptionHeldBy" INTEGER;

-- CreateIndex
CREATE INDEX "Invoice_prescriptionHoldReason_idx" ON "Invoice"("prescriptionHoldReason");

-- AlterTable: Add provider hold reason to RefillQueue
ALTER TABLE "RefillQueue" ADD COLUMN "providerHoldReason" TEXT;
