-- Provider Routing & Compensation System
-- Enterprise feature for provider prescription routing, SOAP approval workflows,
-- and per-script compensation tracking - configurable per clinic

-- Create enums
CREATE TYPE "RoutingStrategy" AS ENUM ('STATE_LICENSE_MATCH', 'ROUND_ROBIN', 'MANUAL_ASSIGNMENT', 'PROVIDER_CHOICE');
CREATE TYPE "SoapApprovalMode" AS ENUM ('REQUIRED', 'ADVISORY', 'DISABLED');
CREATE TYPE "CompensationEventStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOIDED');

-- Create ProviderRoutingConfig table
CREATE TABLE "ProviderRoutingConfig" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "routingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "compensationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "routingStrategy" "RoutingStrategy" NOT NULL DEFAULT 'PROVIDER_CHOICE',
    "soapApprovalMode" "SoapApprovalMode" NOT NULL DEFAULT 'ADVISORY',
    "lastAssignedIndex" INTEGER NOT NULL DEFAULT 0,
    "lastAssignedProviderId" INTEGER,
    "autoAssignOnPayment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRoutingConfig_pkey" PRIMARY KEY ("id")
);

-- Create ProviderCompensationPlan table
CREATE TABLE "ProviderCompensationPlan" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "flatRatePerScript" INTEGER NOT NULL DEFAULT 500,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "notes" TEXT,

    CONSTRAINT "ProviderCompensationPlan_pkey" PRIMARY KEY ("id")
);

-- Create ProviderCompensationEvent table
CREATE TABLE "ProviderCompensationEvent" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "prescriptionCount" INTEGER NOT NULL DEFAULT 1,
    "status" "CompensationEventStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" INTEGER,
    "paidAt" TIMESTAMP(3),
    "payoutReference" TEXT,
    "payoutBatchId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" INTEGER,
    "voidedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ProviderCompensationEvent_pkey" PRIMARY KEY ("id")
);

-- Add assignment tracking fields to Order table
ALTER TABLE "Order" ADD COLUMN "assignedProviderId" INTEGER;
ALTER TABLE "Order" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "assignmentSource" TEXT;

-- Create unique constraints
CREATE UNIQUE INDEX "ProviderRoutingConfig_clinicId_key" ON "ProviderRoutingConfig"("clinicId");
CREATE UNIQUE INDEX "ProviderCompensationPlan_clinicId_providerId_key" ON "ProviderCompensationPlan"("clinicId", "providerId");
CREATE UNIQUE INDEX "ProviderCompensationEvent_orderId_key" ON "ProviderCompensationEvent"("orderId");

-- Create indexes for ProviderCompensationPlan
CREATE INDEX "ProviderCompensationPlan_clinicId_idx" ON "ProviderCompensationPlan"("clinicId");
CREATE INDEX "ProviderCompensationPlan_providerId_idx" ON "ProviderCompensationPlan"("providerId");
CREATE INDEX "ProviderCompensationPlan_isActive_idx" ON "ProviderCompensationPlan"("isActive");

-- Create indexes for ProviderCompensationEvent
CREATE INDEX "ProviderCompensationEvent_clinicId_providerId_idx" ON "ProviderCompensationEvent"("clinicId", "providerId");
CREATE INDEX "ProviderCompensationEvent_clinicId_createdAt_idx" ON "ProviderCompensationEvent"("clinicId", "createdAt");
CREATE INDEX "ProviderCompensationEvent_providerId_status_idx" ON "ProviderCompensationEvent"("providerId", "status");
CREATE INDEX "ProviderCompensationEvent_status_idx" ON "ProviderCompensationEvent"("status");
CREATE INDEX "ProviderCompensationEvent_createdAt_idx" ON "ProviderCompensationEvent"("createdAt");

-- Create index for Order.assignedProviderId
CREATE INDEX "Order_assignedProviderId_idx" ON "Order"("assignedProviderId");

-- Add foreign key constraints
ALTER TABLE "ProviderRoutingConfig" ADD CONSTRAINT "ProviderRoutingConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderCompensationPlan" ADD CONSTRAINT "ProviderCompensationPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCompensationPlan" ADD CONSTRAINT "ProviderCompensationPlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProviderCompensationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
