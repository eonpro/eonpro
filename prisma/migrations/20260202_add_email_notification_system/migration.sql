-- Email Notification System Enhancement Migration
-- Adds email logging, scheduled emails, and user notification preferences

-- ============================================================================
-- Add Email Notification Fields to User Table
-- ============================================================================

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailDigestFrequency" TEXT DEFAULT 'weekly';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastEmailDigestSentAt" TIMESTAMP(3);

-- ============================================================================
-- Create EmailLogStatus Enum
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "EmailLogStatus" AS ENUM (
        'PENDING',
        'QUEUED',
        'SENDING',
        'SENT',
        'DELIVERED',
        'OPENED',
        'CLICKED',
        'BOUNCED',
        'COMPLAINED',
        'FAILED',
        'SUPPRESSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Create EmailLog Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- Recipient
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" INTEGER,
    "clinicId" INTEGER,

    -- Email Details
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "templateData" JSONB,

    -- Delivery Status
    "status" "EmailLogStatus" NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),

    -- Error Tracking
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    -- Bounce/Complaint Details
    "bounceType" TEXT,
    "bounceSubType" TEXT,
    "complaintType" TEXT,

    -- Source Tracking
    "sourceType" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- EmailLog Indexes
CREATE INDEX IF NOT EXISTS "EmailLog_recipientEmail_idx" ON "EmailLog"("recipientEmail");
CREATE INDEX IF NOT EXISTS "EmailLog_recipientUserId_idx" ON "EmailLog"("recipientUserId");
CREATE INDEX IF NOT EXISTS "EmailLog_status_idx" ON "EmailLog"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailLog_messageId_key" ON "EmailLog"("messageId");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmailLog_clinicId_createdAt_idx" ON "EmailLog"("clinicId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmailLog_sourceType_sourceId_idx" ON "EmailLog"("sourceType", "sourceId");

-- EmailLog Foreign Keys
ALTER TABLE "EmailLog" DROP CONSTRAINT IF EXISTS "EmailLog_recipientUserId_fkey";
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_recipientUserId_fkey" 
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailLog" DROP CONSTRAINT IF EXISTS "EmailLog_clinicId_fkey";
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Create ScheduledEmailStatus Enum
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "ScheduledEmailStatus" AS ENUM (
        'PENDING',
        'PROCESSING',
        'SENT',
        'FAILED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Create ScheduledEmail Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ScheduledEmail" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- Recipient
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" INTEGER,
    "clinicId" INTEGER,

    -- Email Content
    "subject" TEXT,
    "template" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',

    -- Scheduling
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledEmailStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),

    -- Result
    "emailLogId" INTEGER,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,

    -- Source
    "automationTrigger" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

-- ScheduledEmail Indexes
CREATE INDEX IF NOT EXISTS "ScheduledEmail_status_scheduledFor_idx" ON "ScheduledEmail"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_recipientUserId_idx" ON "ScheduledEmail"("recipientUserId");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_clinicId_idx" ON "ScheduledEmail"("clinicId");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_createdAt_idx" ON "ScheduledEmail"("createdAt" DESC);

-- ScheduledEmail Foreign Keys
ALTER TABLE "ScheduledEmail" DROP CONSTRAINT IF EXISTS "ScheduledEmail_recipientUserId_fkey";
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_recipientUserId_fkey" 
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduledEmail" DROP CONSTRAINT IF EXISTS "ScheduledEmail_clinicId_fkey";
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Create UserNotificationPreference Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserNotificationPreference" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    "userId" INTEGER NOT NULL,

    -- Sound Settings
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundVolume" INTEGER NOT NULL DEFAULT 50,
    "soundForPriorities" JSONB NOT NULL DEFAULT '["HIGH", "URGENT"]',

    -- Toast Settings
    "toastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "toastDuration" INTEGER NOT NULL DEFAULT 5000,
    "toastPosition" TEXT NOT NULL DEFAULT 'top-right',

    -- Browser Notifications
    "browserNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,

    -- Do Not Disturb
    "dndEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndScheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndStartTime" TEXT NOT NULL DEFAULT '22:00',
    "dndEndTime" TEXT NOT NULL DEFAULT '08:00',
    "dndDays" JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]',

    -- Category Preferences
    "mutedCategories" JSONB NOT NULL DEFAULT '[]',

    -- Display Settings
    "groupSimilar" BOOLEAN NOT NULL DEFAULT true,
    "showDesktopBadge" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- UserNotificationPreference Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationPreference_userId_key" ON "UserNotificationPreference"("userId");
CREATE INDEX IF NOT EXISTS "UserNotificationPreference_userId_idx" ON "UserNotificationPreference"("userId");

-- UserNotificationPreference Foreign Keys
ALTER TABLE "UserNotificationPreference" DROP CONSTRAINT IF EXISTS "UserNotificationPreference_userId_fkey";
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
