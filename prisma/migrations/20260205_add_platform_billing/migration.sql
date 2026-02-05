-- ============================================================================
-- PLATFORM BILLING: Per-Clinic Fee Configuration & Invoicing
-- ============================================================================
-- Enables EONPRO to charge clinics for platform usage based on:
-- - Medical Prescription Fee: When EONPRO internal provider writes Rx
-- - Transmission Fee: When clinic's own provider uses platform to send to Lifefile
-- - Admin Fee: Weekly platform usage fee (flat or percentage of sales)
-- ============================================================================

-- Add isEonproProvider flag to Provider table
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "isEonproProvider" BOOLEAN NOT NULL DEFAULT false;

-- Create index for provider type queries
CREATE INDEX IF NOT EXISTS "Provider_isEonproProvider_idx" ON "Provider"("isEonproProvider");

-- Create enums for platform billing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformFeeType') THEN
        CREATE TYPE "PlatformFeeType" AS ENUM ('PRESCRIPTION', 'TRANSMISSION', 'ADMIN');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformFeeStatus') THEN
        CREATE TYPE "PlatformFeeStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID', 'WAIVED', 'VOIDED');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformFeeCalculationType') THEN
        CREATE TYPE "PlatformFeeCalculationType" AS ENUM ('FLAT', 'PERCENTAGE');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformAdminFeeType') THEN
        CREATE TYPE "PlatformAdminFeeType" AS ENUM ('NONE', 'FLAT_WEEKLY', 'PERCENTAGE_WEEKLY');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClinicInvoicePeriodType') THEN
        CREATE TYPE "ClinicInvoicePeriodType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClinicInvoiceStatus') THEN
        CREATE TYPE "ClinicInvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');
    END IF;
END$$;

-- Create ClinicPlatformFeeConfig table
CREATE TABLE IF NOT EXISTS "ClinicPlatformFeeConfig" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL UNIQUE,
    
    -- Medical prescription fee (EONPRO provider writes Rx)
    "prescriptionFeeType" "PlatformFeeCalculationType" NOT NULL DEFAULT 'FLAT',
    "prescriptionFeeAmount" INTEGER NOT NULL DEFAULT 2000,
    
    -- Transmission fee (clinic provider uses platform)
    "transmissionFeeType" "PlatformFeeCalculationType" NOT NULL DEFAULT 'FLAT',
    "transmissionFeeAmount" INTEGER NOT NULL DEFAULT 500,
    
    -- Admin fee (weekly platform usage)
    "adminFeeType" "PlatformAdminFeeType" NOT NULL DEFAULT 'NONE',
    "adminFeeAmount" INTEGER NOT NULL DEFAULT 0,
    
    -- Prescription cycle tracking
    "prescriptionCycleDays" INTEGER NOT NULL DEFAULT 90,
    
    -- Billing contact
    "billingEmail" TEXT,
    "billingName" TEXT,
    "billingAddress" JSONB,
    
    -- Payment terms
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    
    -- Status
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    
    -- Audit
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "notes" TEXT,
    
    CONSTRAINT "ClinicPlatformFeeConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ClinicPlatformFeeConfig_isActive_idx" ON "ClinicPlatformFeeConfig"("isActive");

-- Create PlatformFeeEvent table
CREATE TABLE IF NOT EXISTS "PlatformFeeEvent" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Clinic association
    "clinicId" INTEGER NOT NULL,
    "configId" INTEGER NOT NULL,
    
    -- Fee type
    "feeType" "PlatformFeeType" NOT NULL,
    
    -- Related entities (nullable based on fee type)
    "orderId" INTEGER UNIQUE,
    "providerId" INTEGER,
    "patientId" INTEGER,
    
    -- For ADMIN fees - the week period
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "periodSales" INTEGER,
    
    -- Fee calculation
    "amountCents" INTEGER NOT NULL,
    "calculationDetails" JSONB,
    
    -- Invoice reference
    "invoiceId" INTEGER,
    
    -- Status
    "status" "PlatformFeeStatus" NOT NULL DEFAULT 'PENDING',
    
    -- Voiding
    "voidedAt" TIMESTAMP(3),
    "voidedBy" INTEGER,
    "voidedReason" TEXT,
    
    -- Waiving
    "waivedAt" TIMESTAMP(3),
    "waivedBy" INTEGER,
    "waivedReason" TEXT,
    
    CONSTRAINT "PlatformFeeEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlatformFeeEvent_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ClinicPlatformFeeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlatformFeeEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlatformFeeEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlatformFeeEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlatformFeeEvent_clinicId_idx" ON "PlatformFeeEvent"("clinicId");
CREATE INDEX IF NOT EXISTS "PlatformFeeEvent_createdAt_idx" ON "PlatformFeeEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "PlatformFeeEvent_status_idx" ON "PlatformFeeEvent"("status");
CREATE INDEX IF NOT EXISTS "PlatformFeeEvent_feeType_idx" ON "PlatformFeeEvent"("feeType");
CREATE INDEX IF NOT EXISTS "PlatformFeeEvent_invoiceId_idx" ON "PlatformFeeEvent"("invoiceId");

-- Create PatientPrescriptionCycle table
CREATE TABLE IF NOT EXISTS "PatientPrescriptionCycle" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    
    -- Medication identifier
    "medicationKey" TEXT NOT NULL,
    
    -- Last billable prescription date
    "lastChargedAt" TIMESTAMP(3) NOT NULL,
    "lastOrderId" INTEGER NOT NULL,
    
    -- Next eligible billing date
    "nextEligibleAt" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "PatientPrescriptionCycle_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientPrescriptionCycle_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientPrescriptionCycle_clinicId_patientId_medicationKey_key" UNIQUE ("clinicId", "patientId", "medicationKey")
);

CREATE INDEX IF NOT EXISTS "PatientPrescriptionCycle_clinicId_idx" ON "PatientPrescriptionCycle"("clinicId");
CREATE INDEX IF NOT EXISTS "PatientPrescriptionCycle_patientId_idx" ON "PatientPrescriptionCycle"("patientId");
CREATE INDEX IF NOT EXISTS "PatientPrescriptionCycle_nextEligibleAt_idx" ON "PatientPrescriptionCycle"("nextEligibleAt");

-- Create ClinicPlatformInvoice table
CREATE TABLE IF NOT EXISTS "ClinicPlatformInvoice" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    "clinicId" INTEGER NOT NULL,
    "configId" INTEGER NOT NULL,
    
    -- Invoice period
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" "ClinicInvoicePeriodType" NOT NULL,
    
    -- Fee totals in cents
    "prescriptionFeeTotal" INTEGER NOT NULL DEFAULT 0,
    "transmissionFeeTotal" INTEGER NOT NULL DEFAULT 0,
    "adminFeeTotal" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    
    -- Fee counts
    "prescriptionCount" INTEGER NOT NULL DEFAULT 0,
    "transmissionCount" INTEGER NOT NULL DEFAULT 0,
    
    -- Invoice details
    "invoiceNumber" TEXT NOT NULL UNIQUE,
    "dueDate" TIMESTAMP(3) NOT NULL,
    
    -- Stripe integration
    "stripeInvoiceId" TEXT UNIQUE,
    "stripeInvoiceUrl" TEXT,
    "stripePdfUrl" TEXT,
    
    -- PDF report
    "pdfUrl" TEXT,
    "pdfS3Key" TEXT,
    "pdfS3ETag" TEXT,
    
    -- Status
    "status" "ClinicInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    
    -- Payment tracking
    "paidAt" TIMESTAMP(3),
    "paidAmountCents" INTEGER,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    
    -- Audit
    "generatedBy" INTEGER,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" INTEGER,
    "sentAt" TIMESTAMP(3),
    "sentBy" INTEGER,
    
    -- Notes
    "notes" TEXT,
    "externalNotes" TEXT,
    
    CONSTRAINT "ClinicPlatformInvoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClinicPlatformInvoice_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ClinicPlatformFeeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ClinicPlatformInvoice_clinicId_idx" ON "ClinicPlatformInvoice"("clinicId");
CREATE INDEX IF NOT EXISTS "ClinicPlatformInvoice_status_idx" ON "ClinicPlatformInvoice"("status");
CREATE INDEX IF NOT EXISTS "ClinicPlatformInvoice_periodStart_periodEnd_idx" ON "ClinicPlatformInvoice"("periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "ClinicPlatformInvoice_dueDate_idx" ON "ClinicPlatformInvoice"("dueDate");

-- Add foreign key from PlatformFeeEvent to ClinicPlatformInvoice
ALTER TABLE "PlatformFeeEvent" ADD CONSTRAINT "PlatformFeeEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ClinicPlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
