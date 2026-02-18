-- Make patientId optional on PatientShippingUpdate to store unmatched webhook data
ALTER TABLE "PatientShippingUpdate" ALTER COLUMN "patientId" DROP NOT NULL;

-- Add matchedAt to track when an unmatched record was linked to a patient
ALTER TABLE "PatientShippingUpdate" ADD COLUMN "matchedAt" TIMESTAMP(3);

-- Set matchedAt for all existing records (they were already matched at creation time)
UPDATE "PatientShippingUpdate" SET "matchedAt" = "createdAt" WHERE "patientId" IS NOT NULL;

-- Index for finding unmatched records efficiently
CREATE INDEX "PatientShippingUpdate_clinicId_matchedAt_idx" ON "PatientShippingUpdate"("clinicId", "matchedAt");
