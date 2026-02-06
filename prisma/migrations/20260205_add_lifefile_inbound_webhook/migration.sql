-- Add LifeFile Inbound Webhook fields to Clinic table
-- This enables per-clinic configuration of inbound webhooks for receiving data from LifeFile

-- Add inbound webhook enable flag
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lifefileInboundEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Add unique webhook path for each clinic (e.g., "wellmedr" for /api/webhooks/lifefile/inbound/wellmedr)
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lifefileInboundPath" TEXT;

-- Add Basic Auth credentials (encrypted at rest)
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lifefileInboundUsername" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lifefileInboundPassword" TEXT;

-- Add HMAC signature secret for webhook verification (encrypted at rest)
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lifefileInboundSecret" TEXT;

-- Add optional IP allowlist (comma-separated)
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lifefileInboundAllowedIPs" TEXT;

-- Add allowed event types array
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lifefileInboundEvents" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create unique index on inbound path (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS "Clinic_lifefileInboundPath_key" ON "Clinic"("lifefileInboundPath") WHERE "lifefileInboundPath" IS NOT NULL;

-- Create index for quick lookup by path
CREATE INDEX IF NOT EXISTS "Clinic_lifefileInboundPath_idx" ON "Clinic"("lifefileInboundPath") WHERE "lifefileInboundEnabled" = true;

-- Add comment for documentation
COMMENT ON COLUMN "Clinic"."lifefileInboundEnabled" IS 'Enable receiving webhooks from LifeFile for this clinic';
COMMENT ON COLUMN "Clinic"."lifefileInboundPath" IS 'Unique webhook path slug, e.g., "wellmedr" creates endpoint /api/webhooks/lifefile/inbound/wellmedr';
COMMENT ON COLUMN "Clinic"."lifefileInboundUsername" IS 'Basic Auth username for incoming LifeFile webhooks (encrypted)';
COMMENT ON COLUMN "Clinic"."lifefileInboundPassword" IS 'Basic Auth password for incoming LifeFile webhooks (encrypted)';
COMMENT ON COLUMN "Clinic"."lifefileInboundSecret" IS 'HMAC-SHA256 secret for webhook signature verification (encrypted)';
COMMENT ON COLUMN "Clinic"."lifefileInboundAllowedIPs" IS 'Optional comma-separated list of allowed IP addresses';
COMMENT ON COLUMN "Clinic"."lifefileInboundEvents" IS 'Array of allowed event types: shipping, prescription, order, rx';
