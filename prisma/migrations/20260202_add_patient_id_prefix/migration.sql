-- Add patientIdPrefix column to Clinic table (idempotent)
-- This column stores the prefix for patient IDs (e.g., "EON", "WEL", "OT")

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Clinic' AND column_name = 'patientIdPrefix') THEN
        ALTER TABLE "Clinic" ADD COLUMN "patientIdPrefix" TEXT;
    END IF;
END
$$;

-- Set default prefixes based on subdomain for existing clinics
UPDATE "Clinic" SET "patientIdPrefix" = 'OT' WHERE subdomain = 'ot' AND "patientIdPrefix" IS NULL;
UPDATE "Clinic" SET "patientIdPrefix" = 'WEL' WHERE subdomain = 'wellmedr' AND "patientIdPrefix" IS NULL;
UPDATE "Clinic" SET "patientIdPrefix" = 'EON' WHERE subdomain = 'eonmeds' AND "patientIdPrefix" IS NULL;

-- For any other clinics, set a prefix based on first 3 chars of subdomain (uppercase)
UPDATE "Clinic" 
SET "patientIdPrefix" = UPPER(SUBSTRING(subdomain FROM 1 FOR 3))
WHERE "patientIdPrefix" IS NULL AND subdomain IS NOT NULL;
