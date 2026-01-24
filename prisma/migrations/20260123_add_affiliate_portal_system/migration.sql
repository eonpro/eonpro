-- Migration: Add Affiliate Portal System
-- Date: 2026-01-23
-- Description: Creates tables for the new HIPAA-compliant affiliate portal

-- Add AFFILIATE to UserRole enum
ALTER TYPE "UserRole" ADD VALUE 'AFFILIATE' AFTER 'INFLUENCER';

-- Create AffiliateStatus enum
CREATE TYPE "AffiliateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SUSPENDED', 'INACTIVE');

-- Create CommissionPlanType enum
CREATE TYPE "CommissionPlanType" AS ENUM ('FLAT', 'PERCENT');

-- Create CommissionAppliesTo enum
CREATE TYPE "CommissionAppliesTo" AS ENUM ('FIRST_PAYMENT_ONLY', 'ALL_PAYMENTS');

-- Create CommissionEventStatus enum
CREATE TYPE "CommissionEventStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REVERSED');

-- Create Affiliate table
CREATE TABLE "Affiliate" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- Create AffiliateRefCode table
CREATE TABLE "AffiliateRefCode" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AffiliateRefCode_pkey" PRIMARY KEY ("id")
);

-- Create AffiliateCommissionPlan table
CREATE TABLE "AffiliateCommissionPlan" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "planType" "CommissionPlanType" NOT NULL DEFAULT 'PERCENT',
    "flatAmountCents" INTEGER,
    "percentBps" INTEGER,
    "appliesTo" "CommissionAppliesTo" NOT NULL DEFAULT 'FIRST_PAYMENT_ONLY',
    "holdDays" INTEGER NOT NULL DEFAULT 0,
    "clawbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AffiliateCommissionPlan_pkey" PRIMARY KEY ("id")
);

-- Create AffiliatePlanAssignment table
CREATE TABLE "AffiliatePlanAssignment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "commissionPlanId" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "AffiliatePlanAssignment_pkey" PRIMARY KEY ("id")
);

-- Create AffiliateCommissionEvent table (immutable ledger)
CREATE TABLE "AffiliateCommissionEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "stripeObjectId" TEXT NOT NULL,
    "stripeEventType" TEXT NOT NULL,
    "eventAmountCents" INTEGER NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "commissionPlanId" INTEGER,
    "status" "CommissionEventStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "holdUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AffiliateCommissionEvent_pkey" PRIMARY KEY ("id")
);

-- Add attribution fields to Patient table
ALTER TABLE "Patient" ADD COLUMN "attributionAffiliateId" INTEGER;
ALTER TABLE "Patient" ADD COLUMN "attributionRefCode" TEXT;
ALTER TABLE "Patient" ADD COLUMN "attributionFirstTouchAt" TIMESTAMP(3);

-- Create indexes for Affiliate
CREATE INDEX "Affiliate_clinicId_idx" ON "Affiliate"("clinicId");
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");
CREATE UNIQUE INDEX "Affiliate_userId_key" ON "Affiliate"("userId");

-- Create indexes for AffiliateRefCode
CREATE UNIQUE INDEX "AffiliateRefCode_clinicId_refCode_key" ON "AffiliateRefCode"("clinicId", "refCode");
CREATE INDEX "AffiliateRefCode_clinicId_idx" ON "AffiliateRefCode"("clinicId");
CREATE INDEX "AffiliateRefCode_affiliateId_idx" ON "AffiliateRefCode"("affiliateId");
CREATE INDEX "AffiliateRefCode_refCode_idx" ON "AffiliateRefCode"("refCode");

-- Create indexes for AffiliateCommissionPlan
CREATE INDEX "AffiliateCommissionPlan_clinicId_idx" ON "AffiliateCommissionPlan"("clinicId");
CREATE INDEX "AffiliateCommissionPlan_isActive_idx" ON "AffiliateCommissionPlan"("isActive");

-- Create indexes for AffiliatePlanAssignment
CREATE INDEX "AffiliatePlanAssignment_clinicId_idx" ON "AffiliatePlanAssignment"("clinicId");
CREATE INDEX "AffiliatePlanAssignment_affiliateId_idx" ON "AffiliatePlanAssignment"("affiliateId");
CREATE INDEX "AffiliatePlanAssignment_commissionPlanId_idx" ON "AffiliatePlanAssignment"("commissionPlanId");
CREATE INDEX "AffiliatePlanAssignment_effectiveFrom_effectiveTo_idx" ON "AffiliatePlanAssignment"("effectiveFrom", "effectiveTo");

-- Create indexes for AffiliateCommissionEvent
CREATE UNIQUE INDEX "AffiliateCommissionEvent_clinicId_stripeEventId_key" ON "AffiliateCommissionEvent"("clinicId", "stripeEventId");
CREATE INDEX "AffiliateCommissionEvent_clinicId_idx" ON "AffiliateCommissionEvent"("clinicId");
CREATE INDEX "AffiliateCommissionEvent_affiliateId_idx" ON "AffiliateCommissionEvent"("affiliateId");
CREATE INDEX "AffiliateCommissionEvent_status_idx" ON "AffiliateCommissionEvent"("status");
CREATE INDEX "AffiliateCommissionEvent_occurredAt_idx" ON "AffiliateCommissionEvent"("occurredAt");
CREATE INDEX "AffiliateCommissionEvent_stripeEventId_idx" ON "AffiliateCommissionEvent"("stripeEventId");

-- Add foreign key constraints
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AffiliateRefCode" ADD CONSTRAINT "AffiliateRefCode_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateRefCode" ADD CONSTRAINT "AffiliateRefCode_affiliateId_fkey" 
    FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AffiliateCommissionPlan" ADD CONSTRAINT "AffiliateCommissionPlan_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AffiliatePlanAssignment" ADD CONSTRAINT "AffiliatePlanAssignment_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliatePlanAssignment" ADD CONSTRAINT "AffiliatePlanAssignment_affiliateId_fkey" 
    FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliatePlanAssignment" ADD CONSTRAINT "AffiliatePlanAssignment_commissionPlanId_fkey" 
    FOREIGN KEY ("commissionPlanId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_affiliateId_fkey" 
    FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Patient" ADD CONSTRAINT "Patient_attributionAffiliateId_fkey" 
    FOREIGN KEY ("attributionAffiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
