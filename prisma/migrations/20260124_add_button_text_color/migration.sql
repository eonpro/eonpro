-- Add button text color field to Clinic table
-- Options: 'auto', 'light', 'dark'
-- 'auto' calculates based on background color luminance
-- 'light' forces white text
-- 'dark' forces black text

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "buttonTextColor" TEXT NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN "Clinic"."buttonTextColor" IS 'Button text color mode: auto (calculate from bg), light (white), dark (black)';
