-- Weekly revenue-based volume tiers (vs sale-count + flat $ per sale).
-- volumeTierBasis: SALE_COUNT (default) | WEEKLY_REVENUE_CENTS

ALTER TABLE "SalesRepCommissionPlan" ADD COLUMN IF NOT EXISTS "volumeTierBasis" TEXT NOT NULL DEFAULT 'SALE_COUNT';

ALTER TABLE "SalesRepVolumeCommissionTier" ADD COLUMN IF NOT EXISTS "minRevenueCents" INTEGER;
ALTER TABLE "SalesRepVolumeCommissionTier" ADD COLUMN IF NOT EXISTS "additionalPercentBps" INTEGER;
