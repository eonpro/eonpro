-- Add optional custom fee rules JSON to ClinicPlatformFeeConfig for per-clinic complicated billing logic.
-- When set, rules are evaluated in priority order; first match determines WAIVE or CHARGE (with optional min/max).
ALTER TABLE "ClinicPlatformFeeConfig" ADD COLUMN IF NOT EXISTS "customFeeRules" JSONB;
