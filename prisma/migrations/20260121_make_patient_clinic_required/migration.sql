-- PREREQUISITE: Run scripts/fix-orphaned-patients.ts BEFORE this migration
-- This ensures all patients have a clinicId assigned

-- Step 1: Verify no orphaned patients exist
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "Patient" WHERE "clinicId" IS NULL;
  
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot run migration: % patients have NULL clinicId. Run scripts/fix-orphaned-patients.ts first.', orphan_count;
  END IF;
END $$;

-- Step 2: Make clinicId NOT NULL
ALTER TABLE "Patient" ALTER COLUMN "clinicId" SET NOT NULL;

-- Step 3: Add foreign key constraint if not exists
-- (Prisma should handle this, but being explicit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Patient_clinicId_fkey'
  ) THEN
    ALTER TABLE "Patient" 
    ADD CONSTRAINT "Patient_clinicId_fkey" 
    FOREIGN KEY ("clinicId") 
    REFERENCES "Clinic"("id") 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN "Patient"."clinicId" IS 'Required: Clinic this patient belongs to for multi-tenant data isolation';
