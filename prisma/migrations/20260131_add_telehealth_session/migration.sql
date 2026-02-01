-- CreateEnum
CREATE TYPE "TelehealthSessionStatus" AS ENUM ('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'TECHNICAL_ISSUES');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('google', 'outlook', 'apple');

-- CreateTable
CREATE TABLE "TelehealthSession" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "appointmentId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "meetingId" TEXT NOT NULL,
    "meetingUuid" TEXT,
    "joinUrl" TEXT NOT NULL,
    "hostUrl" TEXT,
    "password" TEXT,
    "topic" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 30,
    "actualDuration" INTEGER,
    "status" "TelehealthSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "platform" TEXT NOT NULL DEFAULT 'zoom',
    "recordingUrl" TEXT,
    "recordingPassword" TEXT,
    "recordingDuration" INTEGER,
    "recordingSize" BIGINT,
    "transcriptUrl" TEXT,
    "participantCount" INTEGER DEFAULT 0,
    "hostJoinedAt" TIMESTAMP(3),
    "patientJoinedAt" TIMESTAMP(3),
    "waitingRoomEnteredAt" TIMESTAMP(3),
    "waitingRoomAdmittedAt" TIMESTAMP(3),
    "technicalIssues" TEXT,
    "endReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelehealthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelehealthParticipant" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "participantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "duration" INTEGER,
    "deviceType" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "connectionQuality" TEXT,
    "audioEnabled" BOOLEAN DEFAULT true,
    "videoEnabled" BOOLEAN DEFAULT true,
    "screenShared" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelehealthParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSubscription" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "token" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "includePatientNames" BOOLEAN NOT NULL DEFAULT false,
    "includeMeetingLinks" BOOLEAN NOT NULL DEFAULT true,
    "syncRangeDays" INTEGER NOT NULL DEFAULT 90,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelehealthSession_meetingId_key" ON "TelehealthSession"("meetingId");

-- CreateIndex
CREATE INDEX "TelehealthSession_clinicId_idx" ON "TelehealthSession"("clinicId");

-- CreateIndex
CREATE INDEX "TelehealthSession_appointmentId_idx" ON "TelehealthSession"("appointmentId");

-- CreateIndex
CREATE INDEX "TelehealthSession_patientId_idx" ON "TelehealthSession"("patientId");

-- CreateIndex
CREATE INDEX "TelehealthSession_providerId_idx" ON "TelehealthSession"("providerId");

-- CreateIndex
CREATE INDEX "TelehealthSession_status_idx" ON "TelehealthSession"("status");

-- CreateIndex
CREATE INDEX "TelehealthSession_scheduledAt_idx" ON "TelehealthSession"("scheduledAt");

-- CreateIndex
CREATE INDEX "TelehealthParticipant_sessionId_idx" ON "TelehealthParticipant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSubscription_token_key" ON "CalendarSubscription"("token");

-- CreateIndex
CREATE INDEX "CalendarSubscription_providerId_idx" ON "CalendarSubscription"("providerId");

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthParticipant" ADD CONSTRAINT "TelehealthParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TelehealthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add apple to CalendarProvider in ProviderCalendarIntegration
ALTER TYPE "CalendarProvider" ADD VALUE IF NOT EXISTS 'apple';

-- Add appleCalendarEventId to Appointment
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "appleCalendarEventId" TEXT;
