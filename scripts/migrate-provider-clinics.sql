-- Data migration for ProviderClinic junction table
-- Migrate existing provider-clinic relationships

-- Step 1: Providers with a clinicId get a ProviderClinic entry (as primary)
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

-- Step 2: For shared providers (clinicId = null), create entries via their linked User's UserClinic
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

-- Step 3: Set primaryClinicId from existing clinicId for providers that have one
UPDATE "Provider"
SET "primaryClinicId" = "clinicId"
WHERE "clinicId" IS NOT NULL AND "primaryClinicId" IS NULL;

-- Step 4: For shared providers, set primaryClinicId from their first ProviderClinic entry
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
