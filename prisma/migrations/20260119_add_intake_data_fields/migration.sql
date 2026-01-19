-- Add new fields to PatientDocument for improved intake data storage
-- These fields separate PDF binary data from structured intake JSON

-- Add intakeData column for structured JSON intake form answers
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "intakeData" JSONB;

-- Add pdfGeneratedAt to track when PDFs were generated
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "pdfGeneratedAt" TIMESTAMP(3);

-- Add intakeVersion to track form version
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "intakeVersion" TEXT;

-- Add comment to clarify column purposes
COMMENT ON COLUMN "PatientDocument"."data" IS 'PDF binary data (Bytes)';
COMMENT ON COLUMN "PatientDocument"."intakeData" IS 'Structured intake form answers (JSON)';
COMMENT ON COLUMN "PatientDocument"."pdfGeneratedAt" IS 'Timestamp when PDF was generated';
COMMENT ON COLUMN "PatientDocument"."intakeVersion" IS 'Version identifier for the intake form';
