-- Enterprise Ticket System Migration
-- Description: Adds comprehensive enterprise-level ticket system with teams, SLA policies,
-- automation rules, macros, templates, watchers, activity tracking, and more.

-- =====================================================
-- PHASE 1: ADD NEW ENUM VALUES
-- =====================================================

-- Add new values to TicketPriority enum
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'P5_PLANNING';
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'P4_LOW';
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'P3_MEDIUM';
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'P2_HIGH';
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'P1_URGENT';
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'P0_CRITICAL';

-- Add new values to TicketStatus enum
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'PENDING_CUSTOMER';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'PENDING_INTERNAL';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'REOPENED';

-- Add new values to TicketCategory enum
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'PATIENT_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'PATIENT_COMPLAINT';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'PATIENT_REQUEST';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'ORDER_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'ORDER_MODIFICATION';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'SHIPPING_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'REFUND_REQUEST';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'PRESCRIPTION_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'PROVIDER_INQUIRY';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'CLINICAL_QUESTION';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'SYSTEM_BUG';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'FEATURE_REQUEST';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'ACCESS_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'INTEGRATION_ERROR';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'BILLING_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'COMPLIANCE_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'DATA_CORRECTION';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'ACCOUNT_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'SCHEDULING_ISSUE';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'GENERAL_INQUIRY';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'FEEDBACK';

-- Add new values to TicketAction enum
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'PRIORITY_CHANGED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'CATEGORY_CHANGED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'ATTACHMENT_ADDED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'WATCHER_ADDED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'WATCHER_REMOVED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'LINKED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'UNLINKED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'SLA_BREACH_WARNING';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'SLA_BREACHED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'AUTO_ASSIGNED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'AUTO_ESCALATED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'AUTO_CLOSED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'MENTIONED';
ALTER TYPE "TicketAction" ADD VALUE IF NOT EXISTS 'TIME_LOGGED';

-- =====================================================
-- PHASE 2: CREATE NEW ENUMS
-- =====================================================

CREATE TYPE "TicketSource" AS ENUM (
    'INTERNAL',
    'PATIENT_PORTAL',
    'PHONE',
    'EMAIL',
    'CHAT',
    'FORM',
    'SYSTEM',
    'API'
);

CREATE TYPE "TicketActivityType" AS ENUM (
    'CREATED',
    'UPDATED',
    'STATUS_CHANGED',
    'PRIORITY_CHANGED',
    'CATEGORY_CHANGED',
    'ASSIGNED',
    'UNASSIGNED',
    'REASSIGNED',
    'ESCALATED',
    'COMMENT_ADDED',
    'INTERNAL_NOTE_ADDED',
    'ATTACHMENT_ADDED',
    'RESOLVED',
    'REOPENED',
    'CLOSED',
    'LINKED',
    'UNLINKED',
    'MERGED',
    'SPLIT',
    'SLA_BREACH_WARNING',
    'SLA_BREACHED',
    'SLA_PAUSED',
    'SLA_RESUMED',
    'AUTO_ASSIGNED',
    'AUTO_ESCALATED',
    'AUTO_CLOSED',
    'AUTOMATION_TRIGGERED',
    'WATCHER_ADDED',
    'WATCHER_REMOVED',
    'MENTIONED',
    'VIEWED',
    'LOCKED',
    'UNLOCKED',
    'TIME_LOGGED'
);

CREATE TYPE "SlaMetricType" AS ENUM (
    'FIRST_RESPONSE',
    'RESOLUTION',
    'NEXT_RESPONSE'
);

CREATE TYPE "AutomationTrigger" AS ENUM (
    'ON_CREATE',
    'ON_UPDATE',
    'ON_STATUS_CHANGE',
    'ON_ASSIGNMENT',
    'ON_PRIORITY_CHANGE',
    'ON_CATEGORY_CHANGE',
    'ON_COMMENT_ADDED',
    'ON_SLA_WARNING',
    'ON_SLA_BREACH',
    'ON_NO_ACTIVITY',
    'ON_REOPEN',
    'SCHEDULED'
);

CREATE TYPE "AutomationActionType" AS ENUM (
    'SET_PRIORITY',
    'SET_STATUS',
    'SET_CATEGORY',
    'ADD_TAG',
    'REMOVE_TAG',
    'ASSIGN_TO_USER',
    'ASSIGN_TO_TEAM',
    'ADD_WATCHER',
    'SEND_NOTIFICATION',
    'SEND_EMAIL',
    'ADD_COMMENT',
    'ADD_INTERNAL_NOTE',
    'ESCALATE',
    'CLOSE_TICKET',
    'APPLY_MACRO'
);

-- =====================================================
-- PHASE 3: CREATE NEW TABLES
-- =====================================================

-- Business Hours Table
CREATE TABLE "TicketBusinessHours" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "schedule" JSONB NOT NULL,
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketBusinessHours_pkey" PRIMARY KEY ("id")
);

-- SLA Policy Config Table
CREATE TABLE "SlaPolicyConfig" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TicketPriority",
    "category" "TicketCategory",
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "nextResponseMinutes" INTEGER,
    "businessHoursId" INTEGER,
    "respectBusinessHours" BOOLEAN NOT NULL DEFAULT true,
    "escalateOnBreach" BOOLEAN NOT NULL DEFAULT true,
    "warningThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "escalateToTeamId" INTEGER,
    "escalateToUserId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicyConfig_pkey" PRIMARY KEY ("id")
);

-- Ticket Team Table
CREATE TABLE "TicketTeam" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "defaultPriority" "TicketPriority",
    "defaultSlaPolicyId" INTEGER,
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT false,
    "roundRobinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxTicketsPerMember" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTeam_pkey" PRIMARY KEY ("id")
);

-- Ticket Team Member Table
CREATE TABLE "TicketTeamMember" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "currentTicketCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTeamMember_pkey" PRIMARY KEY ("id")
);

-- Ticket Watcher Table
CREATE TABLE "TicketWatcher" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "notifyOnComment" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnStatus" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnAssign" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnResolve" BOOLEAN NOT NULL DEFAULT true,
    "addedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketWatcher_pkey" PRIMARY KEY ("id")
);

-- Ticket Relation Table
CREATE TABLE "TicketRelation" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL,
    "relatedId" INTEGER NOT NULL,
    "relatedDisplay" TEXT,
    "relationNote" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketRelation_pkey" PRIMARY KEY ("id")
);

-- Ticket Attachment Table
CREATE TABLE "TicketAttachment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "commentId" INTEGER,
    "uploadedById" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- Ticket Activity Table
CREATE TABLE "TicketActivity" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER,
    "activityType" "TicketActivityType" NOT NULL,
    "fieldChanged" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "details" JSONB,
    "automationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "TicketActivity_pkey" PRIMARY KEY ("id")
);

-- Ticket Merge Table
CREATE TABLE "TicketMerge" (
    "id" SERIAL NOT NULL,
    "sourceTicketId" INTEGER NOT NULL,
    "targetTicketId" INTEGER NOT NULL,
    "mergedById" INTEGER NOT NULL,
    "reason" TEXT,
    "commentsTransferred" INTEGER NOT NULL DEFAULT 0,
    "attachmentsTransferred" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMerge_pkey" PRIMARY KEY ("id")
);

-- Ticket Macro Table
CREATE TABLE "TicketMacro" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TicketCategory",
    "teamId" INTEGER,
    "responseTitle" TEXT,
    "responseContent" TEXT NOT NULL,
    "isHtmlContent" BOOLEAN NOT NULL DEFAULT false,
    "setStatus" "TicketStatus",
    "setPriority" "TicketPriority",
    "setCategory" "TicketCategory",
    "addTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketMacro_pkey" PRIMARY KEY ("id")
);

-- Ticket Template Table
CREATE TABLE "TicketTemplate" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TicketCategory" NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "descriptionTemplate" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "source" "TicketSource" NOT NULL DEFAULT 'INTERNAL',
    "defaultTeamId" INTEGER,
    "defaultAssigneeId" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFieldsSchema" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id")
);

-- Ticket Automation Rule Table
CREATE TABLE "TicketAutomationRule" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "AutomationTrigger" NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "stopOnMatch" BOOLEAN NOT NULL DEFAULT false,
    "scheduleExpression" TEXT,
    "lastScheduledRun" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketAutomationRule_pkey" PRIMARY KEY ("id")
);

-- Ticket Saved View Table
CREATE TABLE "TicketSavedView" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "filters" JSONB NOT NULL,
    "sortField" TEXT NOT NULL DEFAULT 'createdAt',
    "sortOrder" TEXT NOT NULL DEFAULT 'desc',
    "columns" TEXT[] DEFAULT ARRAY['ticketNumber', 'title', 'status', 'priority', 'assignedTo', 'createdAt']::TEXT[],
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketSavedView_pkey" PRIMARY KEY ("id")
);

-- Ticket CSAT Table
CREATE TABLE "TicketCsat" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "surveyToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketCsat_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- PHASE 4: ALTER EXISTING TICKET TABLE
-- =====================================================

-- Add new columns to Ticket table
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "source" "TicketSource" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "reporterEmail" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "reporterName" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "reporterPhone" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "teamId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "rootCause" VARCHAR(500);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "reopenCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastReopenedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastReopenedById" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "internalNote" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "parentTicketId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "currentViewers" JSONB;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lockedById" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "closedById" INTEGER;

-- Convert tags from Json to TEXT array if needed
-- Note: This requires data migration if there's existing data
-- ALTER TABLE "Ticket" ALTER COLUMN "tags" TYPE TEXT[] USING COALESCE(tags::text::text[], ARRAY[]::TEXT[]);
-- For safety, we'll add a new column and handle migration separately
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "tagsArray" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Alter TicketSLA table
ALTER TABLE "TicketSLA" ADD COLUMN IF NOT EXISTS "slaPolicyId" INTEGER;
ALTER TABLE "TicketSLA" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "TicketSLA" ADD COLUMN IF NOT EXISTS "totalPausedTime" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TicketSLA" ADD COLUMN IF NOT EXISTS "warningNotified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketSLA" ALTER COLUMN "resolutionDue" DROP NOT NULL;

-- =====================================================
-- PHASE 5: CREATE INDEXES
-- =====================================================

-- TicketBusinessHours indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketBusinessHours_clinicId_name_key" ON "TicketBusinessHours"("clinicId", "name");

-- SlaPolicyConfig indexes
CREATE UNIQUE INDEX IF NOT EXISTS "SlaPolicyConfig_clinicId_name_key" ON "SlaPolicyConfig"("clinicId", "name");
CREATE INDEX IF NOT EXISTS "SlaPolicyConfig_clinicId_isActive_idx" ON "SlaPolicyConfig"("clinicId", "isActive");
CREATE INDEX IF NOT EXISTS "SlaPolicyConfig_clinicId_priority_idx" ON "SlaPolicyConfig"("clinicId", "priority");
CREATE INDEX IF NOT EXISTS "SlaPolicyConfig_clinicId_category_idx" ON "SlaPolicyConfig"("clinicId", "category");

-- TicketTeam indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketTeam_clinicId_name_key" ON "TicketTeam"("clinicId", "name");
CREATE INDEX IF NOT EXISTS "TicketTeam_clinicId_isActive_idx" ON "TicketTeam"("clinicId", "isActive");

-- TicketTeamMember indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketTeamMember_teamId_userId_key" ON "TicketTeamMember"("teamId", "userId");
CREATE INDEX IF NOT EXISTS "TicketTeamMember_userId_idx" ON "TicketTeamMember"("userId");

-- TicketWatcher indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketWatcher_ticketId_userId_key" ON "TicketWatcher"("ticketId", "userId");
CREATE INDEX IF NOT EXISTS "TicketWatcher_userId_idx" ON "TicketWatcher"("userId");

-- TicketRelation indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketRelation_ticketId_relationType_relatedId_key" ON "TicketRelation"("ticketId", "relationType", "relatedId");
CREATE INDEX IF NOT EXISTS "TicketRelation_ticketId_idx" ON "TicketRelation"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketRelation_relationType_relatedId_idx" ON "TicketRelation"("relationType", "relatedId");

-- TicketAttachment indexes
CREATE INDEX IF NOT EXISTS "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketAttachment_commentId_idx" ON "TicketAttachment"("commentId");

-- TicketActivity indexes
CREATE INDEX IF NOT EXISTS "TicketActivity_ticketId_createdAt_idx" ON "TicketActivity"("ticketId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "TicketActivity_ticketId_activityType_idx" ON "TicketActivity"("ticketId", "activityType");
CREATE INDEX IF NOT EXISTS "TicketActivity_userId_createdAt_idx" ON "TicketActivity"("userId", "createdAt" DESC);

-- TicketMerge indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketMerge_sourceTicketId_key" ON "TicketMerge"("sourceTicketId");
CREATE INDEX IF NOT EXISTS "TicketMerge_targetTicketId_idx" ON "TicketMerge"("targetTicketId");

-- TicketMacro indexes
CREATE INDEX IF NOT EXISTS "TicketMacro_clinicId_isActive_idx" ON "TicketMacro"("clinicId", "isActive");
CREATE INDEX IF NOT EXISTS "TicketMacro_clinicId_category_idx" ON "TicketMacro"("clinicId", "category");
CREATE INDEX IF NOT EXISTS "TicketMacro_createdById_idx" ON "TicketMacro"("createdById");
CREATE INDEX IF NOT EXISTS "TicketMacro_teamId_idx" ON "TicketMacro"("teamId");

-- TicketTemplate indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketTemplate_clinicId_name_key" ON "TicketTemplate"("clinicId", "name");
CREATE INDEX IF NOT EXISTS "TicketTemplate_clinicId_category_idx" ON "TicketTemplate"("clinicId", "category");
CREATE INDEX IF NOT EXISTS "TicketTemplate_clinicId_isActive_idx" ON "TicketTemplate"("clinicId", "isActive");

-- TicketAutomationRule indexes
CREATE INDEX IF NOT EXISTS "TicketAutomationRule_clinicId_trigger_isActive_idx" ON "TicketAutomationRule"("clinicId", "trigger", "isActive");
CREATE INDEX IF NOT EXISTS "TicketAutomationRule_clinicId_isActive_idx" ON "TicketAutomationRule"("clinicId", "isActive");

-- TicketSavedView indexes
CREATE INDEX IF NOT EXISTS "TicketSavedView_clinicId_isPersonal_idx" ON "TicketSavedView"("clinicId", "isPersonal");
CREATE INDEX IF NOT EXISTS "TicketSavedView_createdById_idx" ON "TicketSavedView"("createdById");

-- TicketCsat indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TicketCsat_ticketId_key" ON "TicketCsat"("ticketId");
CREATE UNIQUE INDEX IF NOT EXISTS "TicketCsat_surveyToken_key" ON "TicketCsat"("surveyToken");
CREATE INDEX IF NOT EXISTS "TicketCsat_ticketId_idx" ON "TicketCsat"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketCsat_surveyToken_idx" ON "TicketCsat"("surveyToken");

-- Ticket table new indexes
CREATE INDEX IF NOT EXISTS "Ticket_clinicId_status_priority_idx" ON "Ticket"("clinicId", "status", "priority");
CREATE INDEX IF NOT EXISTS "Ticket_clinicId_status_createdAt_idx" ON "Ticket"("clinicId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Ticket_clinicId_teamId_status_idx" ON "Ticket"("clinicId", "teamId", "status");
CREATE INDEX IF NOT EXISTS "Ticket_clinicId_category_status_idx" ON "Ticket"("clinicId", "category", "status");
CREATE INDEX IF NOT EXISTS "Ticket_parentTicketId_idx" ON "Ticket"("parentTicketId");
CREATE INDEX IF NOT EXISTS "Ticket_lastActivityAt_idx" ON "Ticket"("lastActivityAt" DESC);
CREATE INDEX IF NOT EXISTS "Ticket_dueDate_idx" ON "Ticket"("dueDate");
CREATE INDEX IF NOT EXISTS "Ticket_orderId_idx" ON "Ticket"("orderId");

-- TicketSLA new indexes
CREATE INDEX IF NOT EXISTS "TicketSLA_slaPolicyId_idx" ON "TicketSLA"("slaPolicyId");

-- =====================================================
-- PHASE 6: ADD FOREIGN KEY CONSTRAINTS
-- =====================================================

-- TicketBusinessHours
ALTER TABLE "TicketBusinessHours" ADD CONSTRAINT "TicketBusinessHours_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SlaPolicyConfig
ALTER TABLE "SlaPolicyConfig" ADD CONSTRAINT "SlaPolicyConfig_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlaPolicyConfig" ADD CONSTRAINT "SlaPolicyConfig_businessHoursId_fkey" 
    FOREIGN KEY ("businessHoursId") REFERENCES "TicketBusinessHours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TicketTeam
ALTER TABLE "TicketTeam" ADD CONSTRAINT "TicketTeam_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketTeam" ADD CONSTRAINT "TicketTeam_defaultSlaPolicyId_fkey" 
    FOREIGN KEY ("defaultSlaPolicyId") REFERENCES "SlaPolicyConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TicketTeamMember
ALTER TABLE "TicketTeamMember" ADD CONSTRAINT "TicketTeamMember_teamId_fkey" 
    FOREIGN KEY ("teamId") REFERENCES "TicketTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketTeamMember" ADD CONSTRAINT "TicketTeamMember_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TicketWatcher
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_ticketId_fkey" 
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_addedById_fkey" 
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TicketRelation
ALTER TABLE "TicketRelation" ADD CONSTRAINT "TicketRelation_ticketId_fkey" 
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketRelation" ADD CONSTRAINT "TicketRelation_createdById_fkey" 
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketAttachment
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" 
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_uploadedById_fkey" 
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketActivity
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_ticketId_fkey" 
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_automationId_fkey" 
    FOREIGN KEY ("automationId") REFERENCES "TicketAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TicketMerge
ALTER TABLE "TicketMerge" ADD CONSTRAINT "TicketMerge_sourceTicketId_fkey" 
    FOREIGN KEY ("sourceTicketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketMerge" ADD CONSTRAINT "TicketMerge_targetTicketId_fkey" 
    FOREIGN KEY ("targetTicketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketMerge" ADD CONSTRAINT "TicketMerge_mergedById_fkey" 
    FOREIGN KEY ("mergedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketMacro
ALTER TABLE "TicketMacro" ADD CONSTRAINT "TicketMacro_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketMacro" ADD CONSTRAINT "TicketMacro_teamId_fkey" 
    FOREIGN KEY ("teamId") REFERENCES "TicketTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketMacro" ADD CONSTRAINT "TicketMacro_createdById_fkey" 
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketTemplate
ALTER TABLE "TicketTemplate" ADD CONSTRAINT "TicketTemplate_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketTemplate" ADD CONSTRAINT "TicketTemplate_createdById_fkey" 
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketAutomationRule
ALTER TABLE "TicketAutomationRule" ADD CONSTRAINT "TicketAutomationRule_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketAutomationRule" ADD CONSTRAINT "TicketAutomationRule_createdById_fkey" 
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketSavedView
ALTER TABLE "TicketSavedView" ADD CONSTRAINT "TicketSavedView_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketSavedView" ADD CONSTRAINT "TicketSavedView_createdById_fkey" 
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TicketCsat
ALTER TABLE "TicketCsat" ADD CONSTRAINT "TicketCsat_ticketId_fkey" 
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ticket self-referential (parent-child)
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_parentTicketId_fkey" 
    FOREIGN KEY ("parentTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ticket team assignment
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_teamId_fkey" 
    FOREIGN KEY ("teamId") REFERENCES "TicketTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ticket additional user relations
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_lastReopenedById_fkey" 
    FOREIGN KEY ("lastReopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_lockedById_fkey" 
    FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_closedById_fkey" 
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TicketSLA relation to policy
ALTER TABLE "TicketSLA" ADD CONSTRAINT "TicketSLA_slaPolicyId_fkey" 
    FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicyConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================
-- PHASE 7: SET DEFAULT UUID FOR CSAT SURVEY TOKEN
-- =====================================================

-- Create extension if not exists (for uuid generation)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set default for surveyToken
ALTER TABLE "TicketCsat" ALTER COLUMN "surveyToken" SET DEFAULT gen_random_uuid()::text;
