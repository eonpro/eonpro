-- Create ProfileStatus enum for tracking patient profile completion
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'PENDING_COMPLETION', 'MERGED', 'ARCHIVED');

-- Add profileStatus column to Patient table with default ACTIVE
ALTER TABLE "Patient" ADD COLUMN "profileStatus" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE';

-- Add index for efficient querying of pending profiles
CREATE INDEX "Patient_profileStatus_idx" ON "Patient"("profileStatus");

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
