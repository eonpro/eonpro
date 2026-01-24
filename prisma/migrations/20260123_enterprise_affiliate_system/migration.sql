-- Enterprise Affiliate System Migration
-- Adds attribution tracking, tiered commissions, payouts, and fraud detection

-- =============================================================================
-- PHASE 1: Update existing Affiliate table
-- =============================================================================

-- Add new columns to Affiliate table
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "currentTierId" INTEGER;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "tierQualifiedAt" TIMESTAMP(3);
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "lifetimeConversions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "lifetimeRevenueCents" INTEGER NOT NULL DEFAULT 0;

-- =============================================================================
-- PHASE 2: Update AffiliateCommissionPlan table
-- =============================================================================

-- Add new columns to AffiliateCommissionPlan table
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "tierEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "recurringEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "recurringMonths" INTEGER;
ALTER TABLE "AffiliateCommissionPlan" ADD COLUMN IF NOT EXISTS "recurringDecayPct" INTEGER;

-- =============================================================================
-- PHASE 3: Update AffiliateCommissionEvent table
-- =============================================================================

-- Add new columns to AffiliateCommissionEvent table
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "baseCommissionCents" INTEGER;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "tierBonusCents" INTEGER;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "promotionBonusCents" INTEGER;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "productAdjustmentCents" INTEGER;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "touchId" INTEGER;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "attributionModel" TEXT;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "recurringMonth" INTEGER;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "originalEventId" INTEGER;
ALTER TABLE "AffiliateCommissionEvent" ADD COLUMN IF NOT EXISTS "payoutId" INTEGER;

-- =============================================================================
-- PHASE 4: Create Attribution Tables
-- =============================================================================

-- TouchType enum
DO $$ BEGIN
    CREATE TYPE "TouchType" AS ENUM ('CLICK', 'IMPRESSION', 'POSTBACK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AttributionModel enum
DO $$ BEGIN
    CREATE TYPE "AttributionModel" AS ENUM ('FIRST_CLICK', 'LAST_CLICK', 'LINEAR', 'TIME_DECAY', 'POSITION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AffiliateTouch table
CREATE TABLE IF NOT EXISTS "AffiliateTouch" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "visitorFingerprint" TEXT NOT NULL,
    "cookieId" TEXT,
    "ipAddressHash" TEXT,
    "userAgent" TEXT,
    "affiliateId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "subId1" TEXT,
    "subId2" TEXT,
    "subId3" TEXT,
    "subId4" TEXT,
    "subId5" TEXT,
    "landingPage" TEXT,
    "referrerUrl" TEXT,
    "touchType" "TouchType" NOT NULL DEFAULT 'CLICK',
    "convertedPatientId" INTEGER,
    "convertedAt" TIMESTAMP(3),
    CONSTRAINT "AffiliateTouch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffiliateTouch_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AffiliateTouch_clinicId_visitorFingerprint_idx" ON "AffiliateTouch"("clinicId", "visitorFingerprint");
CREATE INDEX IF NOT EXISTS "AffiliateTouch_clinicId_cookieId_idx" ON "AffiliateTouch"("clinicId", "cookieId");
CREATE INDEX IF NOT EXISTS "AffiliateTouch_affiliateId_idx" ON "AffiliateTouch"("affiliateId");
CREATE INDEX IF NOT EXISTS "AffiliateTouch_createdAt_idx" ON "AffiliateTouch"("createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateTouch_refCode_idx" ON "AffiliateTouch"("refCode");

-- AffiliateAttributionConfig table
CREATE TABLE IF NOT EXISTS "AffiliateAttributionConfig" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL UNIQUE,
    "newPatientModel" "AttributionModel" NOT NULL DEFAULT 'FIRST_CLICK',
    "returningPatientModel" "AttributionModel" NOT NULL DEFAULT 'LAST_CLICK',
    "cookieWindowDays" INTEGER NOT NULL DEFAULT 30,
    "impressionWindowHours" INTEGER NOT NULL DEFAULT 24,
    "enableFingerprinting" BOOLEAN NOT NULL DEFAULT true,
    "enableSubIds" BOOLEAN NOT NULL DEFAULT true,
    "maxSubIds" INTEGER NOT NULL DEFAULT 5,
    "crossDeviceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "viewThroughEnabled" BOOLEAN NOT NULL DEFAULT false,
    "viewThroughWindowHours" INTEGER NOT NULL DEFAULT 24,
    CONSTRAINT "AffiliateAttributionConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================================================
-- PHASE 5: Create Tiered Commission Tables
-- =============================================================================

-- AffiliateCommissionTier table
CREATE TABLE IF NOT EXISTS "AffiliateCommissionTier" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "minConversions" INTEGER NOT NULL DEFAULT 0,
    "minRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "minActiveMonths" INTEGER,
    "percentBps" INTEGER,
    "flatAmountCents" INTEGER,
    "bonusCents" INTEGER,
    "perks" JSONB,
    CONSTRAINT "AffiliateCommissionTier_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffiliateCommissionTier_planId_level_key" UNIQUE ("planId", "level"),
    CONSTRAINT "AffiliateCommissionTier_planId_name_key" UNIQUE ("planId", "name")
);

CREATE INDEX IF NOT EXISTS "AffiliateCommissionTier_planId_idx" ON "AffiliateCommissionTier"("planId");

-- AffiliateProductRate table
CREATE TABLE IF NOT EXISTS "AffiliateProductRate" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "productSku" TEXT,
    "productCategory" TEXT,
    "minPriceCents" INTEGER,
    "maxPriceCents" INTEGER,
    "percentBps" INTEGER,
    "flatAmountCents" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AffiliateProductRate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AffiliateProductRate_planId_idx" ON "AffiliateProductRate"("planId");
CREATE INDEX IF NOT EXISTS "AffiliateProductRate_productSku_idx" ON "AffiliateProductRate"("productSku");
CREATE INDEX IF NOT EXISTS "AffiliateProductRate_productCategory_idx" ON "AffiliateProductRate"("productCategory");

-- AffiliatePromotion table
CREATE TABLE IF NOT EXISTS "AffiliatePromotion" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bonusPercentBps" INTEGER,
    "bonusFlatCents" INTEGER,
    "minOrderCents" INTEGER,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "affiliateIds" JSONB,
    "refCodes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AffiliatePromotion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AffiliatePromotion_planId_startsAt_endsAt_idx" ON "AffiliatePromotion"("planId", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "AffiliatePromotion_isActive_idx" ON "AffiliatePromotion"("isActive");

-- =============================================================================
-- PHASE 6: Create Payout Tables
-- =============================================================================

-- PayoutMethodType enum
DO $$ BEGIN
    CREATE TYPE "PayoutMethodType" AS ENUM ('STRIPE_CONNECT', 'PAYPAL', 'BANK_WIRE', 'CHECK', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AffiliatePayoutStatus enum
DO $$ BEGIN
    CREATE TYPE "AffiliatePayoutStatus" AS ENUM ('PENDING', 'SCHEDULED', 'AWAITING_APPROVAL', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ON_HOLD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TaxDocumentType enum
DO $$ BEGIN
    CREATE TYPE "TaxDocumentType" AS ENUM ('W9', 'W8BEN', 'W8BENE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- TaxDocumentStatus enum
DO $$ BEGIN
    CREATE TYPE "TaxDocumentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AffiliatePayoutMethod table
CREATE TABLE IF NOT EXISTS "AffiliatePayoutMethod" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "affiliateId" INTEGER NOT NULL,
    "methodType" "PayoutMethodType" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "stripeAccountId" TEXT,
    "stripeAccountStatus" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "paypalEmail" TEXT,
    "paypalPayerId" TEXT,
    "paypalVerified" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT,
    "bankAccountLast4" TEXT,
    "bankRoutingLast4" TEXT,
    "bankCountry" TEXT,
    "encryptedDetails" TEXT,
    "encryptionKeyId" TEXT,
    "mailingAddressLine1" TEXT,
    "mailingAddressLine2" TEXT,
    "mailingCity" TEXT,
    "mailingState" TEXT,
    "mailingZip" TEXT,
    "mailingCountry" TEXT,
    "metadata" JSONB,
    CONSTRAINT "AffiliatePayoutMethod_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffiliatePayoutMethod_affiliateId_methodType_key" UNIQUE ("affiliateId", "methodType")
);

CREATE INDEX IF NOT EXISTS "AffiliatePayoutMethod_affiliateId_idx" ON "AffiliatePayoutMethod"("affiliateId");

-- AffiliatePayout table
CREATE TABLE IF NOT EXISTS "AffiliatePayout" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "netAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "methodType" "PayoutMethodType" NOT NULL,
    "status" "AffiliatePayoutStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "failureCode" TEXT,
    "stripeTransferId" TEXT,
    "stripePayoutId" TEXT,
    "paypalBatchId" TEXT,
    "paypalPayoutId" TEXT,
    "checkNumber" TEXT,
    "wireReference" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "processedBy" INTEGER,
    "approvedBy" INTEGER,
    "notes" TEXT,
    CONSTRAINT "AffiliatePayout_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AffiliatePayout_clinicId_idx" ON "AffiliatePayout"("clinicId");
CREATE INDEX IF NOT EXISTS "AffiliatePayout_affiliateId_idx" ON "AffiliatePayout"("affiliateId");
CREATE INDEX IF NOT EXISTS "AffiliatePayout_status_idx" ON "AffiliatePayout"("status");
CREATE INDEX IF NOT EXISTS "AffiliatePayout_scheduledAt_idx" ON "AffiliatePayout"("scheduledAt");

-- Add foreign key for AffiliateCommissionEvent -> AffiliatePayout
ALTER TABLE "AffiliateCommissionEvent" 
ADD CONSTRAINT "AffiliateCommissionEvent_payoutId_fkey" 
FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "AffiliateCommissionEvent_payoutId_idx" ON "AffiliateCommissionEvent"("payoutId");

-- AffiliateTaxDocument table
CREATE TABLE IF NOT EXISTS "AffiliateTaxDocument" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "affiliateId" INTEGER NOT NULL,
    "documentType" "TaxDocumentType" NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "s3Key" TEXT,
    "s3Bucket" TEXT,
    "encryptionKeyId" TEXT,
    "status" "TaxDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "taxIdLast4" TEXT,
    "taxIdType" TEXT,
    "legalName" TEXT,
    "businessName" TEXT,
    "taxClassification" TEXT,
    "address" TEXT,
    "tinMatchStatus" TEXT,
    "tinMatchedAt" TIMESTAMP(3),
    CONSTRAINT "AffiliateTaxDocument_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffiliateTaxDocument_affiliateId_documentType_taxYear_key" UNIQUE ("affiliateId", "documentType", "taxYear")
);

CREATE INDEX IF NOT EXISTS "AffiliateTaxDocument_affiliateId_idx" ON "AffiliateTaxDocument"("affiliateId");
CREATE INDEX IF NOT EXISTS "AffiliateTaxDocument_status_idx" ON "AffiliateTaxDocument"("status");

-- =============================================================================
-- PHASE 7: Create Fraud Detection Tables
-- =============================================================================

-- FraudAlertType enum
DO $$ BEGIN
    CREATE TYPE "FraudAlertType" AS ENUM (
        'SELF_REFERRAL', 
        'DUPLICATE_IP', 
        'VELOCITY_SPIKE', 
        'SUSPICIOUS_PATTERN', 
        'GEO_MISMATCH', 
        'REFUND_ABUSE', 
        'COOKIE_STUFFING', 
        'CLICK_FRAUD',
        'DEVICE_FRAUD',
        'INCENTIVIZED_TRAFFIC'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- FraudSeverity enum
DO $$ BEGIN
    CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- FraudAlertStatus enum
DO $$ BEGIN
    CREATE TYPE "FraudAlertStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'DISMISSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- FraudResolutionAction enum
DO $$ BEGIN
    CREATE TYPE "FraudResolutionAction" AS ENUM (
        'NO_ACTION',
        'WARNING_ISSUED',
        'COMMISSION_REVERSED',
        'COMMISSIONS_HELD',
        'AFFILIATE_SUSPENDED',
        'AFFILIATE_TERMINATED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AffiliateFraudAlert table
CREATE TABLE IF NOT EXISTS "AffiliateFraudAlert" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "alertType" "FraudAlertType" NOT NULL,
    "severity" "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "commissionEventId" INTEGER,
    "touchId" INTEGER,
    "riskScore" INTEGER NOT NULL DEFAULT 50,
    "affectedAmountCents" INTEGER,
    "status" "FraudAlertStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,
    "resolution" TEXT,
    "resolutionAction" "FraudResolutionAction",
    CONSTRAINT "AffiliateFraudAlert_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffiliateFraudAlert_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AffiliateFraudAlert_clinicId_idx" ON "AffiliateFraudAlert"("clinicId");
CREATE INDEX IF NOT EXISTS "AffiliateFraudAlert_affiliateId_idx" ON "AffiliateFraudAlert"("affiliateId");
CREATE INDEX IF NOT EXISTS "AffiliateFraudAlert_status_idx" ON "AffiliateFraudAlert"("status");
CREATE INDEX IF NOT EXISTS "AffiliateFraudAlert_severity_idx" ON "AffiliateFraudAlert"("severity");
CREATE INDEX IF NOT EXISTS "AffiliateFraudAlert_createdAt_idx" ON "AffiliateFraudAlert"("createdAt");

-- AffiliateIpIntel table (for caching IP intelligence)
CREATE TABLE IF NOT EXISTS "AffiliateIpIntel" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT NOT NULL UNIQUE,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "isp" TEXT,
    "organization" TEXT,
    "asn" TEXT,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "isVpn" BOOLEAN NOT NULL DEFAULT false,
    "isTor" BOOLEAN NOT NULL DEFAULT false,
    "isDatacenter" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isCrawler" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "fraudScore" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "AffiliateIpIntel_ipHash_idx" ON "AffiliateIpIntel"("ipHash");
CREATE INDEX IF NOT EXISTS "AffiliateIpIntel_expiresAt_idx" ON "AffiliateIpIntel"("expiresAt");

-- AffiliateFraudConfig table (per-clinic fraud detection settings)
CREATE TABLE IF NOT EXISTS "AffiliateFraudConfig" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL UNIQUE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxConversionsPerDay" INTEGER NOT NULL DEFAULT 50,
    "maxConversionsPerHour" INTEGER NOT NULL DEFAULT 10,
    "velocitySpikeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "maxConversionsPerIp" INTEGER NOT NULL DEFAULT 3,
    "minIpRiskScore" INTEGER NOT NULL DEFAULT 75,
    "blockProxyVpn" BOOLEAN NOT NULL DEFAULT false,
    "blockDatacenter" BOOLEAN NOT NULL DEFAULT true,
    "blockTor" BOOLEAN NOT NULL DEFAULT true,
    "maxRefundRatePct" INTEGER NOT NULL DEFAULT 20,
    "minRefundsForAlert" INTEGER NOT NULL DEFAULT 5,
    "enableGeoMismatchCheck" BOOLEAN NOT NULL DEFAULT true,
    "allowedCountries" JSONB,
    "enableSelfReferralCheck" BOOLEAN NOT NULL DEFAULT true,
    "autoHoldOnHighRisk" BOOLEAN NOT NULL DEFAULT true,
    "autoSuspendOnCritical" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AffiliateFraudConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AffiliateFraudConfig_clinicId_idx" ON "AffiliateFraudConfig"("clinicId");

-- =============================================================================
-- PHASE 8: Performance Optimizations
-- =============================================================================

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS "AffiliateTouch_clinicId_createdAt_idx" ON "AffiliateTouch"("clinicId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AffiliatePayout_affiliateId_status_idx" ON "AffiliatePayout"("affiliateId", "status");
CREATE INDEX IF NOT EXISTS "AffiliateFraudAlert_clinicId_status_severity_idx" ON "AffiliateFraudAlert"("clinicId", "status", "severity");
