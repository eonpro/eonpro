-- Create ProfileStatus enum for tracking patient profile completion (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProfileStatus') THEN
        CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'PENDING_COMPLETION', 'MERGED', 'ARCHIVED');
    END IF;
END
$$;

-- Add profileStatus column to Patient table with default ACTIVE (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Patient' AND column_name = 'profileStatus') THEN
        ALTER TABLE "Patient" ADD COLUMN "profileStatus" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE';
    END IF;
END
$$;

-- Add index for efficient querying of pending profiles (if not exists)
CREATE INDEX IF NOT EXISTS "Patient_profileStatus_idx" ON "Patient"("profileStatus");

-- Update existing auto-created patients from Stripe to PENDING_COMPLETION if they have placeholder data
UPDATE "Patient"
SET "profileStatus" = 'PENDING_COMPLETION'
WHERE 
  "source" = 'stripe'
  AND (
    "email" LIKE '%@placeholder.local'
    OR "firstName" = 'Unknown'
    OR "lastName" = 'Customer'
  );
