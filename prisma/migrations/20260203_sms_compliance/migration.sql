-- SMS Compliance Migration
-- Adds opt-out tracking, quiet hours configuration, and delivery status tracking

-- ============================================================================
-- 1. SMS OPT-OUT TABLE (TCPA Compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "SmsOptOut" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone" TEXT NOT NULL,
    "clinicId" INTEGER NOT NULL DEFAULT 0, -- 0 = global opt-out
    "patientId" INTEGER,
    "reason" TEXT NOT NULL DEFAULT 'STOP',
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optedInAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'sms',
    "lastMessageSid" TEXT,
    
    CONSTRAINT "SmsOptOut_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SmsOptOut_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsOptOut_phone_clinicId_key" ON "SmsOptOut"("phone", "clinicId");
CREATE INDEX IF NOT EXISTS "SmsOptOut_phone_idx" ON "SmsOptOut"("phone");
CREATE INDEX IF NOT EXISTS "SmsOptOut_clinicId_idx" ON "SmsOptOut"("clinicId");
CREATE INDEX IF NOT EXISTS "SmsOptOut_patientId_idx" ON "SmsOptOut"("patientId");

-- ============================================================================
-- 2. SMS QUIET HOURS CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS "SmsQuietHours" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Quiet Hours',
    "startHour" INTEGER NOT NULL DEFAULT 21,
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "endHour" INTEGER NOT NULL DEFAULT 8,
    "endMinute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
    
    CONSTRAINT "SmsQuietHours_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsQuietHours_clinicId_name_key" ON "SmsQuietHours"("clinicId", "name");
CREATE INDEX IF NOT EXISTS "SmsQuietHours_clinicId_isActive_idx" ON "SmsQuietHours"("clinicId", "isActive");

-- ============================================================================
-- 3. ENHANCE SMSLOG TABLE FOR DELIVERY TRACKING
-- ============================================================================

-- Add delivery tracking fields to SmsLog
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "price" DECIMAL(10, 4);
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "priceUnit" TEXT;
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "segments" INTEGER DEFAULT 1;
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "templateType" TEXT;
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "isOptOutResponse" BOOLEAN DEFAULT false;
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "queuedForRetry" BOOLEAN DEFAULT false;
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER DEFAULT 0;
ALTER TABLE "SmsLog" ADD COLUMN IF NOT EXISTS "statusUpdatedAt" TIMESTAMP(3);

-- Add index for delivery status tracking
CREATE INDEX IF NOT EXISTS "SmsLog_status_createdAt_idx" ON "SmsLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_messageSid_status_idx" ON "SmsLog"("messageSid", "status");

-- ============================================================================
-- 4. SMS RATE LIMITING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "SmsRateLimit" (
    "id" SERIAL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "clinicId" INTEGER NOT NULL DEFAULT 0, -- 0 = global rate limit
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailyCount" INTEGER NOT NULL DEFAULT 0,
    "dailyWindowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedUntil" TIMESTAMP(3),
    "blockReason" TEXT,
    
    CONSTRAINT "SmsRateLimit_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsRateLimit_phone_clinicId_key" ON "SmsRateLimit"("phone", "clinicId");
CREATE INDEX IF NOT EXISTS "SmsRateLimit_phone_idx" ON "SmsRateLimit"("phone");

-- ============================================================================
-- 5. ADD SMS CONSENT FIELD TO PATIENT TABLE
-- ============================================================================

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "smsConsent" BOOLEAN DEFAULT true;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "smsConsentAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "smsConsentSource" TEXT;

-- ============================================================================
-- 6. COMMENT: Future-proof fields for enhanced tracking
-- ============================================================================

COMMENT ON TABLE "SmsOptOut" IS 'TCPA compliance: tracks SMS opt-outs per phone number';
COMMENT ON TABLE "SmsQuietHours" IS 'Clinic-specific quiet hours to prevent late-night SMS';
COMMENT ON TABLE "SmsRateLimit" IS 'Rate limiting to prevent SMS abuse and manage costs';
COMMENT ON COLUMN "SmsLog"."isOptOutResponse" IS 'True if this was a STOP/opt-out message';
COMMENT ON COLUMN "Patient"."smsConsent" IS 'Whether patient consents to receive SMS notifications';
