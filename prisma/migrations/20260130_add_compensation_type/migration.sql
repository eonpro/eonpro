-- Add CompensationType enum
CREATE TYPE "CompensationType" AS ENUM ('FLAT_RATE', 'PERCENTAGE', 'HYBRID');

-- Add new fields to ProviderCompensationPlan
ALTER TABLE "ProviderCompensationPlan" ADD COLUMN "compensationType" "CompensationType" NOT NULL DEFAULT 'FLAT_RATE';
ALTER TABLE "ProviderCompensationPlan" ADD COLUMN "percentBps" INTEGER NOT NULL DEFAULT 0;

-- Add new fields to ProviderCompensationEvent
ALTER TABLE "ProviderCompensationEvent" ADD COLUMN "orderTotalCents" INTEGER;
ALTER TABLE "ProviderCompensationEvent" ADD COLUMN "calculationDetails" JSONB;
