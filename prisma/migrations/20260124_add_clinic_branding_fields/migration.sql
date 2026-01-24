-- Add new branding fields to Clinic table
-- iconUrl: App icon for PWA/mobile (192x192)
-- accentColor: Third brand color for highlights

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "iconUrl" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#d3f931';

-- Add comment for documentation
COMMENT ON COLUMN "Clinic"."iconUrl" IS 'App icon URL for PWA/mobile (192x192px)';
COMMENT ON COLUMN "Clinic"."accentColor" IS 'Accent color for badges and highlights';
