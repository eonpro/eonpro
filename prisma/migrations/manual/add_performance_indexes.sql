-- Performance indexes for platform speed optimization
-- Safe to run multiple times (IF NOT EXISTS prevents errors on re-run)

-- Provider: clinic-scoped lookups (patient detail DoseSpot prescriber resolution)
CREATE INDEX IF NOT EXISTS "Provider_clinicId_idx" ON "Provider"("clinicId");

-- ProviderAvailability: scheduling queries filter by provider + clinic
CREATE INDEX IF NOT EXISTS "ProviderAvailability_providerId_clinicId_idx" ON "ProviderAvailability"("providerId", "clinicId");

-- ProviderDateOverride: date-specific override queries need 3-column composite
-- Only run if the table exists (it may be pending creation from another migration)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ProviderDateOverride') THEN
    CREATE INDEX IF NOT EXISTS "ProviderDateOverride_providerId_clinicId_date_idx" ON "ProviderDateOverride"("providerId", "clinicId", "date");
  END IF;
END $$;

-- Appointment: calendar views filter by clinic + date range
CREATE INDEX IF NOT EXISTS "Appointment_clinicId_startTime_idx" ON "Appointment"("clinicId", "startTime");

-- Order: patient detail page queries (WHERE patientId = X ORDER BY createdAt DESC)
CREATE INDEX IF NOT EXISTS "Order_patientId_createdAt_idx" ON "Order"("patientId", "createdAt");

-- Order: admin order lists filtered by clinic, sorted by date
CREATE INDEX IF NOT EXISTS "Order_clinicId_createdAt_idx" ON "Order"("clinicId", "createdAt");
