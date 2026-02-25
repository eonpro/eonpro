-- Add multi-item bonus fields to SalesRepCommissionPlan
-- When a sale has multiple items, an extra commission (% or $) can be applied.

ALTER TABLE "SalesRepCommissionPlan" ADD COLUMN "multiItemBonusEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesRepCommissionPlan" ADD COLUMN "multiItemBonusType" TEXT;
ALTER TABLE "SalesRepCommissionPlan" ADD COLUMN "multiItemBonusPercentBps" INTEGER;
ALTER TABLE "SalesRepCommissionPlan" ADD COLUMN "multiItemBonusFlatCents" INTEGER;
ALTER TABLE "SalesRepCommissionPlan" ADD COLUMN "multiItemMinQuantity" INTEGER;
