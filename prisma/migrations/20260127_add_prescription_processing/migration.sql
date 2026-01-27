-- Add prescription processing fields to Invoice table
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "prescriptionProcessed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "prescriptionProcessedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "prescriptionProcessedBy" INTEGER;

-- Create index for efficient querying of unprocessed prescriptions
CREATE INDEX IF NOT EXISTS "Invoice_prescriptionProcessed_idx" ON "Invoice"("prescriptionProcessed");
