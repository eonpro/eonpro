-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientDocument_patientId_idx" ON "PatientDocument"("patientId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientDocument_clinicId_patientId_idx" ON "PatientDocument"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientDocument_patientId_category_idx" ON "PatientDocument"("patientId", "category");
