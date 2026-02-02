-- ============================================================================
-- Migration: Add Patient ID Prefix to Clinic
-- Author: System
-- Description: Adds patientIdPrefix column for clinic-specific patient IDs
-- Idempotent: YES - Safe to run multiple times
-- ============================================================================

-- Add patientIdPrefix column to Clinic table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Clinic' AND column_name = 'patientIdPrefix'
    ) THEN
        ALTER TABLE "Clinic" ADD COLUMN "patientIdPrefix" TEXT;
        RAISE NOTICE 'Added patientIdPrefix column to Clinic table';
    ELSE
        RAISE NOTICE 'patientIdPrefix column already exists, skipping';
    END IF;
END
$$;

-- Set default prefixes for known clinics (only if not already set)
UPDATE "Clinic" 
SET "patientIdPrefix" = 'OT' 
WHERE subdomain = 'ot' AND ("patientIdPrefix" IS NULL OR "patientIdPrefix" = '');

UPDATE "Clinic" 
SET "patientIdPrefix" = 'WEL' 
WHERE subdomain = 'wellmedr' AND ("patientIdPrefix" IS NULL OR "patientIdPrefix" = '');

UPDATE "Clinic" 
SET "patientIdPrefix" = 'EON' 
WHERE subdomain = 'eonmeds' AND ("patientIdPrefix" IS NULL OR "patientIdPrefix" = '');

-- For any other clinics without a prefix, set based on subdomain
UPDATE "Clinic" 
SET "patientIdPrefix" = UPPER(SUBSTRING(subdomain FROM 1 FOR 3))
WHERE ("patientIdPrefix" IS NULL OR "patientIdPrefix" = '') 
  AND subdomain IS NOT NULL 
  AND subdomain != '';

-- ============================================================================
-- ROLLBACK SQL (for reference):
-- ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "patientIdPrefix";
-- ============================================================================
