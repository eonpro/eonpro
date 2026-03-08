-- M-8: Add clinicId to PHI models that are missing it
-- M-9: Backfill NULL clinicId values on core models, then enforce NOT NULL
--
-- Step 1: Add clinicId columns (nullable first) to models that lack them
-- Step 2: Backfill from parent records
-- Step 3: Make NOT NULL after backfill
-- Step 4: Add FK constraints and indexes
--
-- This migration is idempotent (uses IF NOT EXISTS / IF EXISTS guards).

-- ============================================================================
-- M-8: Add clinicId to PHI models
-- ============================================================================

-- IntakeFormSubmission: derive from Patient
ALTER TABLE "IntakeFormSubmission" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;

UPDATE "IntakeFormSubmission" ifs
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE ifs."patientId" = p.id
  AND ifs."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- IntakeFormResponse: derive from IntakeFormSubmission
ALTER TABLE "IntakeFormResponse" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;

UPDATE "IntakeFormResponse" ifr
SET "clinicId" = ifs."clinicId"
FROM "IntakeFormSubmission" ifs
WHERE ifr."submissionId" = ifs.id
  AND ifr."clinicId" IS NULL
  AND ifs."clinicId" IS NOT NULL;

-- IntakeFormLink: derive from IntakeFormTemplate
ALTER TABLE "IntakeFormLink" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;

UPDATE "IntakeFormLink" ifl
SET "clinicId" = ift."clinicId"
FROM "IntakeFormTemplate" ift
WHERE ifl."templateId" = ift.id
  AND ifl."clinicId" IS NULL
  AND ift."clinicId" IS NOT NULL;

-- PatientWeightLog: derive from Patient
ALTER TABLE "PatientWeightLog" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;

UPDATE "PatientWeightLog" pwl
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE pwl."patientId" = p.id
  AND pwl."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- PatientMedicationReminder: derive from Patient
ALTER TABLE "PatientMedicationReminder" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;

UPDATE "PatientMedicationReminder" pmr
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE pmr."patientId" = p.id
  AND pmr."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Add FK constraints (only if column exists and constraint doesn't)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'IntakeFormSubmission_clinicId_fkey') THEN
    ALTER TABLE "IntakeFormSubmission" ADD CONSTRAINT "IntakeFormSubmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'IntakeFormResponse_clinicId_fkey') THEN
    ALTER TABLE "IntakeFormResponse" ADD CONSTRAINT "IntakeFormResponse_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'IntakeFormLink_clinicId_fkey') THEN
    ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PatientWeightLog_clinicId_fkey') THEN
    ALTER TABLE "PatientWeightLog" ADD CONSTRAINT "PatientWeightLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PatientMedicationReminder_clinicId_fkey') THEN
    ALTER TABLE "PatientMedicationReminder" ADD CONSTRAINT "PatientMedicationReminder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id);
  END IF;
END $$;

-- Indexes for clinic scoping
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IntakeFormSubmission_clinicId_idx" ON "IntakeFormSubmission" ("clinicId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IntakeFormResponse_clinicId_idx" ON "IntakeFormResponse" ("clinicId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IntakeFormLink_clinicId_idx" ON "IntakeFormLink" ("clinicId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientWeightLog_clinicId_idx" ON "PatientWeightLog" ("clinicId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientMedicationReminder_clinicId_idx" ON "PatientMedicationReminder" ("clinicId");


-- ============================================================================
-- M-9: Backfill NULL clinicId on core models, then enforce NOT NULL
-- ============================================================================
-- NOTE: The ALTER COLUMN SET NOT NULL statements are commented out.
-- They should be run ONLY after verifying zero NULLs remain via:
--   SELECT 'Order' as tbl, count(*) FROM "Order" WHERE "clinicId" IS NULL
--   UNION ALL SELECT 'Invoice', count(*) FROM "Invoice" WHERE "clinicId" IS NULL
--   UNION ALL SELECT 'Payment', count(*) FROM "Payment" WHERE "clinicId" IS NULL
--   ...
-- Uncomment and run in a follow-up migration after backfill is confirmed complete.

-- Backfill Order.clinicId from Patient
UPDATE "Order" o
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE o."patientId" = p.id
  AND o."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Backfill Invoice.clinicId from Patient
UPDATE "Invoice" i
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE i."patientId" = p.id
  AND i."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Backfill Payment.clinicId from Invoice
UPDATE "Payment" pay
SET "clinicId" = i."clinicId"
FROM "Invoice" i
WHERE pay."invoiceId" = i.id
  AND pay."clinicId" IS NULL
  AND i."clinicId" IS NOT NULL;

-- Backfill PaymentMethod.clinicId from Patient
UPDATE "PaymentMethod" pm
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE pm."patientId" = p.id
  AND pm."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Backfill Subscription.clinicId from Patient
UPDATE "Subscription" s
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE s."patientId" = p.id
  AND s."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Backfill PatientDocument.clinicId from Patient
UPDATE "PatientDocument" pd
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE pd."patientId" = p.id
  AND pd."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Backfill SOAPNote.clinicId from Patient
UPDATE "SOAPNote" sn
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE sn."patientId" = p.id
  AND sn."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Backfill Appointment.clinicId from Patient
UPDATE "Appointment" a
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE a."patientId" = p.id
  AND a."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- Backfill Ticket.clinicId — tickets may not have patientId, use userId
UPDATE "Ticket" t
SET "clinicId" = u."clinicId"
FROM "User" u
WHERE t."createdById" = u.id
  AND t."clinicId" IS NULL
  AND u."clinicId" IS NOT NULL;

-- ============================================================================
-- NOT NULL enforcement (run AFTER verifying zero NULLs remain)
-- Uncomment these lines in a follow-up migration:
-- ============================================================================
-- ALTER TABLE "Order" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "Invoice" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "Payment" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "PaymentMethod" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "Subscription" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "PatientDocument" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "SOAPNote" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "Appointment" ALTER COLUMN "clinicId" SET NOT NULL;
-- ALTER TABLE "Ticket" ALTER COLUMN "clinicId" SET NOT NULL;
