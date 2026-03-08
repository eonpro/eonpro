-- Data Integrity Fixes Migration
-- Fixes multi-tenant unique constraints and adds missing indexes
--
-- IMPORTANT: Run during low-traffic window. Index creation is CONCURRENT-safe.
-- Rollback: DROP the new unique indexes and recreate the old ones.

-- 1. SystemSettings: Change unique constraint to include clinicId
--    Old: UNIQUE(category, key) — breaks multi-tenant (two clinics can't have same key)
--    New: UNIQUE(clinicId, category, key) — tenant-safe
DROP INDEX IF EXISTS "SystemSettings_category_key_key";
CREATE UNIQUE INDEX "SystemSettings_clinicId_category_key_key" ON "SystemSettings"("clinicId", "category", "key");

-- 2. Integration: Change from global name unique to per-clinic unique
--    Old: UNIQUE(name) — two clinics can't both have "stripe"
--    New: UNIQUE(clinicId, name) — tenant-safe
DROP INDEX IF EXISTS "Integration_name_key";
CREATE UNIQUE INDEX "Integration_clinicId_name_key" ON "Integration"("clinicId", "name");

-- 3. Invoice indexes for billing query performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_clinicId_idx" ON "Invoice"("clinicId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_patientId_idx" ON "Invoice"("patientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- 4. Payment indexes for billing query performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_clinicId_idx" ON "Payment"("clinicId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_patientId_idx" ON "Payment"("patientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");
