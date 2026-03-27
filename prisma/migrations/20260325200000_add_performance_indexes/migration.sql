-- Performance indexes: composite patient sort, DoseSpot ID lookups

-- Patient: faster "clinic patients sorted by newest" queries (dashboard, patient list)
CREATE INDEX IF NOT EXISTS "Patient_clinicId_createdAt_idx"
  ON "Patient" ("clinicId", "createdAt" DESC);

-- Patient: DoseSpot patient sync lookups
CREATE INDEX IF NOT EXISTS "Patient_doseSpotPatientId_idx"
  ON "Patient" ("doseSpotPatientId");

-- Provider: DoseSpot clinician sync lookups
CREATE INDEX IF NOT EXISTS "Provider_doseSpotClinicianId_idx"
  ON "Provider" ("doseSpotClinicianId");

-- Order: DoseSpot webhook findFirst by prescription ID
CREATE INDEX IF NOT EXISTS "Order_doseSpotPrescriptionId_idx"
  ON "Order" ("doseSpotPrescriptionId");
