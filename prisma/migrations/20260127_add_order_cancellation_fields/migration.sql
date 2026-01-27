-- Add cancellation tracking fields to Order
ALTER TABLE "Order" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "cancelledBy" INTEGER;
ALTER TABLE "Order" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "cancellationNotes" TEXT;
ALTER TABLE "Order" ADD COLUMN "lifefileCancelResponse" TEXT;

-- Add modification tracking fields to Order
ALTER TABLE "Order" ADD COLUMN "lastModifiedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "lastModifiedBy" INTEGER;
ALTER TABLE "Order" ADD COLUMN "modificationHistory" JSONB;

-- Create index for cancelled orders lookup
CREATE INDEX "Order_cancelledAt_idx" ON "Order"("cancelledAt");
