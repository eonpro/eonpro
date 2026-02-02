-- Backfill existing patient IDs with clinic prefixes
-- This migration should run AFTER 20260202_add_patient_id_prefix

-- Update existing patients to have prefixed IDs
-- Format: {PREFIX}-{NUMBER} where NUMBER is the numeric part without leading zeros
-- Example: "000034" becomes "EON-34", "000244" becomes "OT-244"

UPDATE "Patient" p
SET "patientId" = c."patientIdPrefix" || '-' || 
    CASE 
        -- If patientId is all digits, strip leading zeros
        WHEN p."patientId" ~ '^\d+$' THEN LTRIM(p."patientId", '0')
        -- If it's empty after stripping zeros, keep it as "0"
        WHEN LTRIM(p."patientId", '0') = '' THEN '0'
        -- Otherwise keep as-is
        ELSE p."patientId"
    END
FROM "Clinic" c
WHERE p."clinicId" = c."id" 
  AND c."patientIdPrefix" IS NOT NULL
  AND p."patientId" IS NOT NULL
  AND p."patientId" != ''
  -- Only update if doesn't already have a prefix (letters followed by dash)
  AND p."patientId" !~ '^[A-Za-z]+-';

-- Handle edge case: patients with only zeros
UPDATE "Patient" p
SET "patientId" = c."patientIdPrefix" || '-1'
FROM "Clinic" c
WHERE p."clinicId" = c."id" 
  AND c."patientIdPrefix" IS NOT NULL
  AND (p."patientId" = '0' OR p."patientId" = '000000' OR p."patientId" LIKE c."patientIdPrefix" || '-');

-- Sync the PatientCounter to the highest patient number for each clinic
-- This ensures new patients get the next sequential number
UPDATE "PatientCounter" pc
SET "current" = COALESCE(
    (
        SELECT MAX(
            CASE 
                WHEN "patientId" ~ '^[A-Za-z]+-\d+$' 
                THEN CAST(SUBSTRING("patientId" FROM '\d+$') AS INTEGER)
                WHEN "patientId" ~ '^\d+$'
                THEN CAST(LTRIM("patientId", '0') AS INTEGER)
                ELSE 0
            END
        )
        FROM "Patient" 
        WHERE "clinicId" = pc."clinicId"
    ),
    pc."current"
);
