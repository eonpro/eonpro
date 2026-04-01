-- AlterTable: Add deterministic HMAC hash columns for patient deduplication
-- These enable O(1) duplicate detection on intake by email + DOB within a clinic,
-- working around the random-IV AES-GCM encryption on the PHI columns.

ALTER TABLE "Patient" ADD COLUMN "emailHash" TEXT;
ALTER TABLE "Patient" ADD COLUMN "dobHash" TEXT;

-- Composite index for fast dedup lookups: clinic + email + dob
CREATE INDEX "Patient_clinicId_emailHash_dobHash_idx"
  ON "Patient"("clinicId", "emailHash", "dobHash");
