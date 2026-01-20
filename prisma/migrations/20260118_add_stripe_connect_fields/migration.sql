-- Add Stripe Connect fields to Clinic table
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripeAccountStatus" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripePlatformAccount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "stripeConnectedAt" TIMESTAMP(3);

-- Add unique constraint on stripeAccountId
CREATE UNIQUE INDEX IF NOT EXISTS "Clinic_stripeAccountId_key" ON "Clinic"("stripeAccountId");
