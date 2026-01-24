-- Clinic-Specific Patient Counter Migration
-- Each clinic gets its own patient numbering sequence starting from 1

-- Step 1: Remove the global unique constraint on patientId
-- (Keep the compound unique constraint on clinicId + patientId)
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_patientId_key";

-- Step 2: Add clinicId column to PatientCounter
ALTER TABLE "PatientCounter" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;

-- Step 3: Add unique constraint on clinicId
ALTER TABLE "PatientCounter" ADD CONSTRAINT "PatientCounter_clinicId_key" UNIQUE ("clinicId");

-- Step 4: Add foreign key constraint
ALTER TABLE "PatientCounter" ADD CONSTRAINT "PatientCounter_clinicId_fkey" 
FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Migrate existing counter data
-- For each clinic, create a counter with the max patient number in that clinic
-- This ensures new patients get the next number after existing ones

-- First, get the max patient number per clinic and insert/update counters
INSERT INTO "PatientCounter" ("clinicId", "current")
SELECT 
  p."clinicId",
  COALESCE(MAX(CAST(p."patientId" AS INTEGER)), 0) as max_patient_id
FROM "Patient" p
WHERE p."clinicId" IS NOT NULL AND p."patientId" IS NOT NULL
GROUP BY p."clinicId"
ON CONFLICT ("clinicId") 
DO UPDATE SET "current" = EXCLUDED."current";

-- Step 6: For any clinics that don't have patients yet, ensure they get counters when needed
-- (handled by the application code with upsert)

-- Step 7: Delete the old global counter row (id=1) if it exists and has no clinicId
DELETE FROM "PatientCounter" WHERE "clinicId" IS NULL;

-- Step 8: Make clinicId required (NOT NULL) 
-- Note: Only run this after ensuring all existing rows have clinicId
-- ALTER TABLE "PatientCounter" ALTER COLUMN "clinicId" SET NOT NULL;
