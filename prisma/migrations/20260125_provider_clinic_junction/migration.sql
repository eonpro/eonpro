-- ENTERPRISE: Provider Multi-Clinic Support
-- This migration adds the ProviderClinic junction table for providers working across multiple clinics
-- Mirrors the UserClinic pattern for consistent multi-tenant architecture

-- Step 1: Add new columns to Provider table
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "primaryClinicId" INTEGER;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "activeClinicId" INTEGER;

-- Step 2: Create ProviderClinic junction table
CREATE TABLE IF NOT EXISTS "ProviderClinic" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "titleLine" TEXT,
    "deaNumber" TEXT,
    "licenseNumber" TEXT,
    "licenseState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderClinic_pkey" PRIMARY KEY ("id")
);

-- Step 3: Add unique constraint (provider can only be assigned once per clinic)
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderClinic_providerId_clinicId_key" ON "ProviderClinic"("providerId", "clinicId");

-- Step 4: Add indexes for performance
CREATE INDEX IF NOT EXISTS "ProviderClinic_providerId_idx" ON "ProviderClinic"("providerId");
CREATE INDEX IF NOT EXISTS "ProviderClinic_clinicId_idx" ON "ProviderClinic"("clinicId");
CREATE INDEX IF NOT EXISTS "ProviderClinic_isActive_idx" ON "ProviderClinic"("isActive");

-- Step 5: Add foreign key constraints
ALTER TABLE "ProviderClinic" ADD CONSTRAINT "ProviderClinic_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderClinic" ADD CONSTRAINT "ProviderClinic_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Data Migration - Migrate existing provider-clinic relationships
-- Providers with a clinicId get a ProviderClinic entry (as primary)
INSERT INTO "ProviderClinic" ("providerId", "clinicId", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT
    p.id,
    p."clinicId",
    true,
    true,
    NOW(),
    NOW()
FROM "Provider" p
WHERE p."clinicId" IS NOT NULL
ON CONFLICT ("providerId", "clinicId") DO NOTHING;

-- Step 7: Data Migration - For shared providers (clinicId = null), create entries via their linked User's UserClinic
-- This ensures shared providers are properly assigned to all clinics their user has access to
INSERT INTO "ProviderClinic" ("providerId", "clinicId", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT
    p.id,
    uc."clinicId",
    uc."isPrimary",
    uc."isActive",
    NOW(),
    NOW()
FROM "Provider" p
JOIN "User" u ON u."providerId" = p.id
JOIN "UserClinic" uc ON uc."userId" = u.id
WHERE p."clinicId" IS NULL
  AND uc."isActive" = true
ON CONFLICT ("providerId", "clinicId") DO NOTHING;

-- Step 8: Set primaryClinicId from existing clinicId for providers that have one
UPDATE "Provider"
SET "primaryClinicId" = "clinicId"
WHERE "clinicId" IS NOT NULL AND "primaryClinicId" IS NULL;

-- Step 9: For shared providers, set primaryClinicId from their first ProviderClinic entry
UPDATE "Provider" p
SET "primaryClinicId" = (
    SELECT pc."clinicId"
    FROM "ProviderClinic" pc
    WHERE pc."providerId" = p.id AND pc."isPrimary" = true
    LIMIT 1
)
WHERE p."clinicId" IS NULL
  AND p."primaryClinicId" IS NULL
  AND EXISTS (SELECT 1 FROM "ProviderClinic" pc WHERE pc."providerId" = p.id);

-- Add comment for documentation
COMMENT ON TABLE "ProviderClinic" IS 'Junction table for providers belonging to multiple clinics. Mirrors UserClinic pattern for enterprise multi-tenant support.';
COMMENT ON COLUMN "ProviderClinic"."isPrimary" IS 'Indicates if this is the provider''s primary clinic';
COMMENT ON COLUMN "ProviderClinic"."titleLine" IS 'Clinic-specific title (e.g., different role per clinic)';
COMMENT ON COLUMN "ProviderClinic"."deaNumber" IS 'State/clinic-specific DEA number';
COMMENT ON COLUMN "ProviderClinic"."licenseNumber" IS 'State-specific license number for this clinic';
COMMENT ON COLUMN "ProviderClinic"."licenseState" IS 'State of license for this clinic assignment';
