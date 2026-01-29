-- AddInitialRecurringCommissionRates
-- This migration adds support for separate commission rates on initial vs recurring payments
-- Example: 10% on first payment, 5% on recurring payments

-- Add fields for initial/first payment commission (optional, overrides default)
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "initialPercentBps" INTEGER;
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "initialFlatAmountCents" INTEGER;

-- Add fields for recurring payment commission (optional, overrides default)
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "recurringPercentBps" INTEGER;
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "recurringFlatAmountCents" INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN "AffiliateCommissionPlan"."initialPercentBps" IS 'Commission percentage for initial/first payment in basis points (1000 = 10%). Overrides default percentBps for first payment.';
COMMENT ON COLUMN "AffiliateCommissionPlan"."initialFlatAmountCents" IS 'Commission flat amount for initial/first payment in cents. Overrides default flatAmountCents for first payment.';
COMMENT ON COLUMN "AffiliateCommissionPlan"."recurringPercentBps" IS 'Commission percentage for recurring payments in basis points (500 = 5%). Overrides default percentBps for recurring payments.';
COMMENT ON COLUMN "AffiliateCommissionPlan"."recurringFlatAmountCents" IS 'Commission flat amount for recurring payments in cents. Overrides default flatAmountCents for recurring payments.';
