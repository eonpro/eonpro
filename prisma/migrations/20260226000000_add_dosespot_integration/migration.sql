-- DoseSpot E-Prescribing Integration
-- Additive-only migration: all new columns are nullable or have safe defaults.
-- No existing columns modified. No data migration needed.

-- Clinic: DoseSpot per-clinic credentials (encrypted at rest)
ALTER TABLE "Clinic" ADD COLUMN "doseSpotEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN "doseSpotBaseUrl" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doseSpotTokenUrl" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doseSpotSsoUrl" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doseSpotClinicId" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doseSpotClinicKey" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doseSpotAdminId" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doseSpotSubscriptionKey" TEXT;

-- Patient: DoseSpot patient ID (set on first external Rx sync)
ALTER TABLE "Patient" ADD COLUMN "doseSpotPatientId" INTEGER;

-- Provider: DoseSpot clinician ID (set on first provider sync)
ALTER TABLE "Provider" ADD COLUMN "doseSpotClinicianId" INTEGER;

-- Order: Dual fulfillment pathway support
ALTER TABLE "Order" ADD COLUMN "fulfillmentChannel" TEXT NOT NULL DEFAULT 'lifefile';
ALTER TABLE "Order" ADD COLUMN "doseSpotPrescriptionId" INTEGER;
ALTER TABLE "Order" ADD COLUMN "doseSpotPatientId" INTEGER;
ALTER TABLE "Order" ADD COLUMN "externalPharmacyName" TEXT;
ALTER TABLE "Order" ADD COLUMN "externalPharmacyId" INTEGER;
