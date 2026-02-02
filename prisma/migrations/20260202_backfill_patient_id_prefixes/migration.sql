-- ============================================================================
-- Migration: Backfill Patient ID Prefixes
-- Author: System
-- Description: Updates existing patient IDs to use clinic prefix format
-- Idempotent: YES - Safe to run multiple times (checks for existing prefix)
-- Dependencies: 20260202_add_patient_id_prefix must run first
-- ============================================================================

-- Update patient IDs to prefixed format (only if not already prefixed)
-- Format: {PREFIX}-{NUMBER} (e.g., "OT-123", "WEL-456")
-- Only updates patients where:
--   1. Clinic has a prefix defined
--   2. Patient has a patientId
--   3. Patient ID doesn't already have a letter prefix followed by dash

UPDATE "Patient" p
SET "patientId" = c."patientIdPrefix" || '-' || 
    CASE 
        -- If patientId is all digits, strip leading zeros (but keep at least one digit)
        WHEN p."patientId" ~ '^\d+$' THEN 
            CASE 
                WHEN LTRIM(p."patientId", '0') = '' THEN '0'
                ELSE LTRIM(p."patientId", '0')
            END
        -- Otherwise keep as-is (might be legacy format)
        ELSE p."patientId"
    END
FROM "Clinic" c
WHERE p."clinicId" = c."id" 
  AND c."patientIdPrefix" IS NOT NULL
  AND c."patientIdPrefix" != ''
  AND p."patientId" IS NOT NULL
  AND p."patientId" != ''
  -- Only update if NOT already prefixed (letters followed by dash)
  AND p."patientId" !~ '^[A-Za-z]+-';

-- Sync PatientCounter to highest patient number for each clinic
-- This ensures new patients get the next sequential number
UPDATE "PatientCounter" pc
SET "current" = COALESCE(
    (
        SELECT MAX(
            CASE 
                -- Extract number from prefixed format: "OT-123" -> 123
                WHEN "patientId" ~ '^[A-Za-z]+-\d+$' 
                THEN CAST(SUBSTRING("patientId" FROM '\d+$') AS INTEGER)
                -- Extract from pure numeric: "000123" -> 123
                WHEN "patientId" ~ '^\d+$'
                THEN CAST(
                    CASE 
                        WHEN LTRIM("patientId", '0') = '' THEN '0'
                        ELSE LTRIM("patientId", '0')
                    END AS INTEGER
                )
                ELSE 0
            END
        ) + 1
        FROM "Patient" 
        WHERE "clinicId" = pc."clinicId"
    ),
    pc."current"
)
WHERE EXISTS (SELECT 1 FROM "Patient" WHERE "clinicId" = pc."clinicId");

-- ============================================================================
-- ROLLBACK SQL (for reference - would need to store original values):
-- Note: This migration is not easily reversible as original IDs are transformed
-- ============================================================================
