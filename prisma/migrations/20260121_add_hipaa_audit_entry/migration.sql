-- CreateTable: HIPAAAuditEntry
-- HIPAA-Compliant Audit Entry for PHI access logging
-- Meets HIPAA §164.312(b) audit control requirements

CREATE TABLE "HIPAAAuditEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "clinicId" INTEGER,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "patientId" INTEGER,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "sessionId" TEXT,
    "requestId" TEXT NOT NULL,
    "requestMethod" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "hash" TEXT NOT NULL,
    "metadata" JSONB,
    "emergency" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HIPAAAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes for efficient querying (HIPAA requires searchable audit logs)
CREATE INDEX "HIPAAAuditEntry_userId_createdAt_idx" ON "HIPAAAuditEntry"("userId", "createdAt" DESC);
CREATE INDEX "HIPAAAuditEntry_eventType_createdAt_idx" ON "HIPAAAuditEntry"("eventType", "createdAt" DESC);
CREATE INDEX "HIPAAAuditEntry_patientId_createdAt_idx" ON "HIPAAAuditEntry"("patientId", "createdAt" DESC);
CREATE INDEX "HIPAAAuditEntry_clinicId_createdAt_idx" ON "HIPAAAuditEntry"("clinicId", "createdAt" DESC);
CREATE INDEX "HIPAAAuditEntry_resourceType_resourceId_idx" ON "HIPAAAuditEntry"("resourceType", "resourceId");
CREATE INDEX "HIPAAAuditEntry_createdAt_idx" ON "HIPAAAuditEntry"("createdAt" DESC);
CREATE INDEX "HIPAAAuditEntry_outcome_createdAt_idx" ON "HIPAAAuditEntry"("outcome", "createdAt" DESC);
CREATE INDEX "HIPAAAuditEntry_requestId_idx" ON "HIPAAAuditEntry"("requestId");

-- Add comment for documentation
COMMENT ON TABLE "HIPAAAuditEntry" IS 'HIPAA-compliant audit log for PHI access tracking. Retention: 6 years per §164.530(j).';
