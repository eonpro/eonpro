-- Add backgroundColor field to Clinic table
-- Used for page/card background customization

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "backgroundColor" TEXT NOT NULL DEFAULT '#F9FAFB';

COMMENT ON COLUMN "Clinic"."backgroundColor" IS 'Page background color for clinic branding';
