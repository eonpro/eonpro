-- Sales Rep Disposition System
-- Structured workflow for reps to qualify/disposition patient interactions.
-- When outcome = SALE_COMPLETED and approved, auto-creates PatientSalesRepAssignment.

-- Enums
DO $$ BEGIN
  CREATE TYPE "DispositionLeadSource" AS ENUM (
    'REF_LINK', 'COLD_CALL', 'WALK_IN', 'SOCIAL_MEDIA', 'TEXT_MESSAGE',
    'EMAIL_CAMPAIGN', 'WORD_OF_MOUTH', 'EXISTING_PATIENT', 'EVENT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DispositionContactMethod" AS ENUM (
    'PHONE', 'TEXT', 'EMAIL', 'IN_PERSON', 'VIDEO_CALL', 'SOCIAL_DM', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DispositionOutcome" AS ENUM (
    'SALE_COMPLETED', 'INTERESTED', 'CALLBACK_REQUESTED', 'NOT_INTERESTED',
    'NO_ANSWER', 'WRONG_NUMBER', 'ALREADY_PATIENT', 'DO_NOT_CONTACT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DispositionStatus" AS ENUM (
    'PENDING_REVIEW', 'APPROVED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Table
CREATE TABLE IF NOT EXISTS "SalesRepDisposition" (
    "id"              SERIAL        NOT NULL,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)  NOT NULL,
    "clinicId"        INTEGER       NOT NULL,
    "salesRepId"      INTEGER       NOT NULL,
    "patientId"       INTEGER       NOT NULL,
    "leadSource"      "DispositionLeadSource"    NOT NULL,
    "contactMethod"   "DispositionContactMethod" NOT NULL,
    "outcome"         "DispositionOutcome"       NOT NULL,
    "productInterest" TEXT,
    "notes"           TEXT,
    "followUpDate"    TIMESTAMP(3),
    "followUpNotes"   TEXT,
    "tags"            JSONB,
    "status"          "DispositionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedAt"      TIMESTAMP(3),
    "reviewedBy"      INTEGER,
    "reviewNote"      TEXT,
    "autoAssigned"    BOOLEAN       NOT NULL DEFAULT false,
    "assignmentId"    INTEGER,

    CONSTRAINT "SalesRepDisposition_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "SalesRepDisposition"
    ADD CONSTRAINT "SalesRepDisposition_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesRepDisposition"
    ADD CONSTRAINT "SalesRepDisposition_salesRepId_fkey"
    FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesRepDisposition"
    ADD CONSTRAINT "SalesRepDisposition_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesRepDisposition"
    ADD CONSTRAINT "SalesRepDisposition_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_clinicId_idx" ON "SalesRepDisposition"("clinicId");
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_salesRepId_idx" ON "SalesRepDisposition"("salesRepId");
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_patientId_idx" ON "SalesRepDisposition"("patientId");
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_outcome_idx" ON "SalesRepDisposition"("outcome");
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_status_idx" ON "SalesRepDisposition"("status");
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_salesRepId_outcome_idx" ON "SalesRepDisposition"("salesRepId", "outcome");
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_clinicId_createdAt_idx" ON "SalesRepDisposition"("clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesRepDisposition_clinicId_status_idx" ON "SalesRepDisposition"("clinicId", "status");
