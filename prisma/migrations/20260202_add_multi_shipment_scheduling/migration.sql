-- Migration: Add Multi-Shipment Scheduling Fields
-- This migration adds support for multi-shipment scheduling based on medication
-- Beyond Use Date (BUD) constraints. Enables 6-month and 12-month packages to
-- be split into multiple shipments (e.g., every 90 days).

-- Add multi-shipment tracking fields to RefillQueue
ALTER TABLE "RefillQueue" ADD COLUMN IF NOT EXISTS "shipmentNumber" INTEGER;
ALTER TABLE "RefillQueue" ADD COLUMN IF NOT EXISTS "totalShipments" INTEGER;
ALTER TABLE "RefillQueue" ADD COLUMN IF NOT EXISTS "parentRefillId" INTEGER;
ALTER TABLE "RefillQueue" ADD COLUMN IF NOT EXISTS "budDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "RefillQueue" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "RefillQueue" ADD COLUMN IF NOT EXISTS "patientNotifiedAt" TIMESTAMP(3);

-- Add foreign key constraint for parentRefillId (self-referencing)
ALTER TABLE "RefillQueue" 
ADD CONSTRAINT "RefillQueue_parentRefillId_fkey" 
FOREIGN KEY ("parentRefillId") REFERENCES "RefillQueue"("id") 
ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for parentRefillId for efficient series queries
CREATE INDEX IF NOT EXISTS "RefillQueue_parentRefillId_idx" ON "RefillQueue"("parentRefillId");

-- Add defaultBudDays to Clinic model for per-clinic BUD configuration
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "defaultBudDays" INTEGER NOT NULL DEFAULT 90;

-- Add SHIPMENT category to NotificationCategory enum if not exists
-- Note: Prisma handles enum updates differently - this is for direct SQL migrations
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SHIPMENT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationCategory')) THEN
        ALTER TYPE "NotificationCategory" ADD VALUE 'SHIPMENT';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Update existing refills to have default shipment values
UPDATE "RefillQueue" 
SET "shipmentNumber" = 1, "totalShipments" = 1 
WHERE "shipmentNumber" IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN "RefillQueue"."shipmentNumber" IS 'Which shipment in the series (1, 2, 3, 4)';
COMMENT ON COLUMN "RefillQueue"."totalShipments" IS 'Total number of shipments for this package';
COMMENT ON COLUMN "RefillQueue"."parentRefillId" IS 'Links to the first refill in multi-shipment series';
COMMENT ON COLUMN "RefillQueue"."budDays" IS 'Beyond Use Date in days (default 90)';
COMMENT ON COLUMN "RefillQueue"."reminderSentAt" IS 'When advance reminder was sent to staff';
COMMENT ON COLUMN "RefillQueue"."patientNotifiedAt" IS 'When patient was notified about upcoming shipment';
COMMENT ON COLUMN "Clinic"."defaultBudDays" IS 'Default Beyond Use Date in days for multi-shipment scheduling';
