-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('IN_PERSON', 'VIDEO', 'PHONE');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('EMAIL', 'SMS', 'BOTH');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AppointmentType" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresVideoLink" BOOLEAN NOT NULL DEFAULT false,
    "allowSelfScheduling" BOOLEAN NOT NULL DEFAULT true,
    "bufferBefore" INTEGER NOT NULL DEFAULT 0,
    "bufferAfter" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER,
    "intakeFormTemplateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAvailability" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "locationId" INTEGER,
    "appointmentTypes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTimeOff" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "appointmentTypeId" INTEGER,
    "title" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "type" "AppointmentType" NOT NULL DEFAULT 'IN_PERSON',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "location" TEXT,
    "roomNumber" TEXT,
    "videoLink" TEXT,
    "zoomMeetingId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "rescheduledFrom" INTEGER,
    "rescheduledTo" INTEGER,
    "noShowAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentReminder" (
    "id" SERIAL NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "type" "ReminderType" NOT NULL DEFAULT 'BOTH',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "messageId" TEXT,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Superbill" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "appointmentId" INTEGER,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "sentToPatient" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Superbill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperbillItem" (
    "id" SERIAL NOT NULL,
    "superbillId" INTEGER NOT NULL,
    "cptCode" TEXT NOT NULL,
    "cptDescription" TEXT NOT NULL,
    "icdCodes" TEXT[],
    "icdDescriptions" TEXT[],
    "modifier" TEXT,
    "units" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperbillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCode" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "codeType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultPrice" INTEGER,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "templateId" INTEGER,
    "pdfUrl" TEXT,
    "patientSignature" TEXT,
    "patientSignedAt" TIMESTAMP(3),
    "providerSignature" TEXT,
    "providerSignedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanTemplate" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "treatmentType" TEXT,
    "defaultDurationDays" INTEGER DEFAULT 90,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanGoal" (
    "id" SERIAL NOT NULL,
    "carePlanId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" TEXT,
    "currentValue" TEXT,
    "unit" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanActivity" (
    "id" SERIAL NOT NULL,
    "carePlanId" INTEGER NOT NULL,
    "goalId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT,
    "instructions" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanProgress" (
    "id" SERIAL NOT NULL,
    "carePlanId" INTEGER NOT NULL,
    "goalId" INTEGER,
    "activityId" INTEGER,
    "value" TEXT,
    "notes" TEXT,
    "recordedById" INTEGER,
    "recordedByPatient" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlanProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentType_clinicId_idx" ON "AppointmentType"("clinicId");

-- CreateIndex
CREATE INDEX "ProviderAvailability_providerId_idx" ON "ProviderAvailability"("providerId");

-- CreateIndex
CREATE INDEX "ProviderAvailability_dayOfWeek_idx" ON "ProviderAvailability"("dayOfWeek");

-- CreateIndex
CREATE INDEX "ProviderTimeOff_providerId_idx" ON "ProviderTimeOff"("providerId");

-- CreateIndex
CREATE INDEX "ProviderTimeOff_startDate_endDate_idx" ON "ProviderTimeOff"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_idx" ON "Appointment"("clinicId");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_providerId_idx" ON "Appointment"("providerId");

-- CreateIndex
CREATE INDEX "Appointment_startTime_idx" ON "Appointment"("startTime");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "AppointmentReminder_appointmentId_idx" ON "AppointmentReminder"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentReminder_scheduledFor_status_idx" ON "AppointmentReminder"("scheduledFor", "status");

-- CreateIndex
CREATE INDEX "Superbill_clinicId_idx" ON "Superbill"("clinicId");

-- CreateIndex
CREATE INDEX "Superbill_patientId_idx" ON "Superbill"("patientId");

-- CreateIndex
CREATE INDEX "Superbill_providerId_idx" ON "Superbill"("providerId");

-- CreateIndex
CREATE INDEX "Superbill_serviceDate_idx" ON "Superbill"("serviceDate");

-- CreateIndex
CREATE INDEX "SuperbillItem_superbillId_idx" ON "SuperbillItem"("superbillId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCode_clinicId_codeType_code_key" ON "BillingCode"("clinicId", "codeType", "code");

-- CreateIndex
CREATE INDEX "CarePlan_clinicId_idx" ON "CarePlan"("clinicId");

-- CreateIndex
CREATE INDEX "CarePlan_patientId_idx" ON "CarePlan"("patientId");

-- CreateIndex
CREATE INDEX "CarePlan_status_idx" ON "CarePlan"("status");

-- CreateIndex
CREATE INDEX "CarePlanTemplate_clinicId_idx" ON "CarePlanTemplate"("clinicId");

-- CreateIndex
CREATE INDEX "CarePlanGoal_carePlanId_idx" ON "CarePlanGoal"("carePlanId");

-- CreateIndex
CREATE INDEX "CarePlanActivity_carePlanId_idx" ON "CarePlanActivity"("carePlanId");

-- CreateIndex
CREATE INDEX "CarePlanProgress_carePlanId_idx" ON "CarePlanProgress"("carePlanId");

-- CreateIndex
CREATE INDEX "CarePlanProgress_recordedAt_idx" ON "CarePlanProgress"("recordedAt");

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_intakeFormTemplateId_fkey" FOREIGN KEY ("intakeFormTemplateId") REFERENCES "IntakeFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTimeOff" ADD CONSTRAINT "ProviderTimeOff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTimeOff" ADD CONSTRAINT "ProviderTimeOff_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperbillItem" ADD CONSTRAINT "SuperbillItem_superbillId_fkey" FOREIGN KEY ("superbillId") REFERENCES "Superbill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCode" ADD CONSTRAINT "BillingCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CarePlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanTemplate" ADD CONSTRAINT "CarePlanTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanTemplate" ADD CONSTRAINT "CarePlanTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanGoal" ADD CONSTRAINT "CarePlanGoal_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanActivity" ADD CONSTRAINT "CarePlanActivity_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanActivity" ADD CONSTRAINT "CarePlanActivity_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CarePlanGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CarePlanGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CarePlanActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
