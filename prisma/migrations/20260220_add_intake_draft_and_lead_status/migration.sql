-- Migration: Add IntakeFormDraft table, DraftStatus enum, and LEAD to ProfileStatus
--
-- Supports the native intake form engine's save-and-resume functionality
-- and the dual patient portal (lead vs active).

-- 1. Add LEAD to ProfileStatus enum (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'LEAD'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProfileStatus')
    ) THEN
        ALTER TYPE "ProfileStatus" ADD VALUE 'LEAD' AFTER 'ACTIVE';
    END IF;
END
$$;

-- 2. Create DraftStatus enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DraftStatus') THEN
        CREATE TYPE "DraftStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'ABANDONED');
    END IF;
END
$$;

-- 3. Create IntakeFormDraft table
CREATE TABLE IF NOT EXISTS "IntakeFormDraft" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "clinicId"       INTEGER      NOT NULL,
    "templateId"     INTEGER      NOT NULL,
    "patientId"      INTEGER,
    "sessionId"      TEXT         NOT NULL,
    "currentStep"    TEXT         NOT NULL,
    "completedSteps" JSONB        NOT NULL DEFAULT '[]',
    "responses"      JSONB        NOT NULL DEFAULT '{}',
    "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSavedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "status"         "DraftStatus" NOT NULL DEFAULT 'IN_PROGRESS',

    CONSTRAINT "IntakeFormDraft_pkey" PRIMARY KEY ("id")
);

-- 4. Unique constraint on sessionId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IntakeFormDraft_sessionId_key'
    ) THEN
        ALTER TABLE "IntakeFormDraft" ADD CONSTRAINT "IntakeFormDraft_sessionId_key" UNIQUE ("sessionId");
    END IF;
END
$$;

-- 5. Foreign keys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IntakeFormDraft_clinicId_fkey'
    ) THEN
        ALTER TABLE "IntakeFormDraft"
            ADD CONSTRAINT "IntakeFormDraft_clinicId_fkey"
            FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IntakeFormDraft_templateId_fkey'
    ) THEN
        ALTER TABLE "IntakeFormDraft"
            ADD CONSTRAINT "IntakeFormDraft_templateId_fkey"
            FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IntakeFormDraft_patientId_fkey'
    ) THEN
        ALTER TABLE "IntakeFormDraft"
            ADD CONSTRAINT "IntakeFormDraft_patientId_fkey"
            FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

-- 6. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "IntakeFormDraft_patientId_status_idx"
    ON "IntakeFormDraft"("patientId", "status");

CREATE INDEX IF NOT EXISTS "IntakeFormDraft_sessionId_idx"
    ON "IntakeFormDraft"("sessionId");

CREATE INDEX IF NOT EXISTS "IntakeFormDraft_expiresAt_idx"
    ON "IntakeFormDraft"("expiresAt");
