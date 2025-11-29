-- CreateEnum for Audit Event Types
CREATE TYPE "AuditEventType" AS ENUM (
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET',
  'MFA_CHALLENGE',
  'SESSION_TIMEOUT',
  'PHI_VIEW',
  'PHI_CREATE',
  'PHI_UPDATE',
  'PHI_DELETE',
  'PHI_EXPORT',
  'PHI_PRINT',
  'DOCUMENT_VIEW',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_DELETE',
  'DOCUMENT_DOWNLOAD',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'PERMISSION_CHANGE',
  'EMERGENCY_ACCESS',
  'BREAK_GLASS',
  'SYSTEM_ACCESS',
  'CONFIGURATION_CHANGE',
  'SECURITY_ALERT'
);

-- CreateEnum for Audit Outcome
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'PARTIAL');

-- CreateTable for HIPAA Audit Logs
CREATE TABLE "HIPAAAuditLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- User context
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "userRole" TEXT,
    "clinicId" INTEGER,
    
    -- Event details
    "eventType" "AuditEventType" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "patientId" INTEGER,
    "action" TEXT NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "reason" TEXT,
    
    -- Request context
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "requestId" TEXT NOT NULL,
    "requestMethod" TEXT,
    "requestPath" TEXT,
    
    -- Metadata
    "metadata" JSONB,
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    
    -- Integrity
    "hash" TEXT NOT NULL,
    "previousHash" TEXT,
    "integrity" TEXT NOT NULL DEFAULT 'SHA256',
    
    CONSTRAINT "HIPAAAuditLog_pkey" PRIMARY KEY ("id")
);

-- Create indexes for common queries
CREATE INDEX "HIPAAAuditLog_userId_idx" ON "HIPAAAuditLog"("userId");
CREATE INDEX "HIPAAAuditLog_userEmail_idx" ON "HIPAAAuditLog"("userEmail");
CREATE INDEX "HIPAAAuditLog_clinicId_idx" ON "HIPAAAuditLog"("clinicId");
CREATE INDEX "HIPAAAuditLog_eventType_idx" ON "HIPAAAuditLog"("eventType");
CREATE INDEX "HIPAAAuditLog_resourceType_idx" ON "HIPAAAuditLog"("resourceType");
CREATE INDEX "HIPAAAuditLog_resourceId_idx" ON "HIPAAAuditLog"("resourceId");
CREATE INDEX "HIPAAAuditLog_patientId_idx" ON "HIPAAAuditLog"("patientId");
CREATE INDEX "HIPAAAuditLog_timestamp_idx" ON "HIPAAAuditLog"("timestamp");
CREATE INDEX "HIPAAAuditLog_outcome_idx" ON "HIPAAAuditLog"("outcome");
CREATE INDEX "HIPAAAuditLog_emergency_idx" ON "HIPAAAuditLog"("emergency");
CREATE INDEX "HIPAAAuditLog_requestId_idx" ON "HIPAAAuditLog"("requestId");
CREATE INDEX "HIPAAAuditLog_hash_idx" ON "HIPAAAuditLog"("hash");

-- Create composite index for common queries
CREATE INDEX "HIPAAAuditLog_user_patient_idx" ON "HIPAAAuditLog"("userId", "patientId");
CREATE INDEX "HIPAAAuditLog_clinic_timestamp_idx" ON "HIPAAAuditLog"("clinicId", "timestamp");

-- Add foreign key constraints
ALTER TABLE "HIPAAAuditLog" ADD CONSTRAINT "HIPAAAuditLog_clinicId_fkey" 
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL;

ALTER TABLE "HIPAAAuditLog" ADD CONSTRAINT "HIPAAAuditLog_patientId_fkey" 
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL;

-- Create immutable trigger to prevent updates/deletes
CREATE OR REPLACE FUNCTION prevent_audit_modification() 
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "HIPAAAuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- Create function to verify hash integrity
CREATE OR REPLACE FUNCTION verify_audit_hash(log_id INTEGER) 
RETURNS BOOLEAN AS $$
DECLARE
  log_record RECORD;
  calculated_hash TEXT;
BEGIN
  SELECT * INTO log_record FROM "HIPAAAuditLog" WHERE id = log_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Recalculate hash (simplified - in production use same algorithm as application)
  calculated_hash := encode(
    digest(
      log_record.userId || log_record.eventType || 
      log_record.resourceType || log_record.timestamp::TEXT,
      'sha256'
    ),
    'hex'
  );
  
  RETURN log_record.hash = calculated_hash;
END;
$$ LANGUAGE plpgsql;

-- Create view for recent PHI access
CREATE VIEW "RecentPHIAccess" AS
SELECT 
  "userId",
  "userEmail",
  "userRole",
  "patientId",
  "eventType",
  "resourceType",
  "outcome",
  "timestamp",
  "ipAddress"
FROM "HIPAAAuditLog"
WHERE "eventType" IN ('PHI_VIEW', 'PHI_CREATE', 'PHI_UPDATE', 'PHI_DELETE', 'PHI_EXPORT')
  AND "timestamp" > NOW() - INTERVAL '24 hours'
ORDER BY "timestamp" DESC;

-- Create view for failed login attempts
CREATE VIEW "FailedLoginAttempts" AS
SELECT 
  "userEmail",
  "ipAddress",
  COUNT(*) as attempts,
  MAX("timestamp") as last_attempt
FROM "HIPAAAuditLog"
WHERE "eventType" = 'LOGIN_FAILED'
  AND "timestamp" > NOW() - INTERVAL '1 hour'
GROUP BY "userEmail", "ipAddress"
HAVING COUNT(*) >= 3;

-- Add comment for compliance
COMMENT ON TABLE "HIPAAAuditLog" IS 'HIPAA-compliant audit log for tracking all PHI access and system events. This table is immutable - records cannot be updated or deleted.';
COMMENT ON COLUMN "HIPAAAuditLog"."hash" IS 'SHA-256 hash of the log entry for integrity verification';
COMMENT ON COLUMN "HIPAAAuditLog"."emergency" IS 'Flag indicating if this was emergency/break-glass access';
