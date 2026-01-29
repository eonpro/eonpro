-- Add RefillStatus enum
CREATE TYPE "RefillStatus" AS ENUM ('SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER', 'PRESCRIBED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'ON_HOLD');

-- Add PaymentVerificationMethod enum
CREATE TYPE "PaymentVerificationMethod" AS ENUM ('STRIPE_AUTO', 'MANUAL_VERIFIED', 'EXTERNAL_REFERENCE', 'PAYMENT_SKIPPED');

-- Add refill scheduling fields to Subscription
ALTER TABLE "Subscription" ADD COLUMN "vialCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Subscription" ADD COLUMN "refillIntervalDays" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "lastRefillQueueId" INTEGER;

-- Create RefillQueue table
CREATE TABLE "RefillQueue" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "subscriptionId" INTEGER,
    "lastOrderId" INTEGER,
    "vialCount" INTEGER NOT NULL DEFAULT 1,
    "refillIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "nextRefillDate" TIMESTAMP(3) NOT NULL,
    "lastRefillDate" TIMESTAMP(3),
    "status" "RefillStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paymentVerified" BOOLEAN NOT NULL DEFAULT false,
    "paymentVerifiedAt" TIMESTAMP(3),
    "paymentVerifiedBy" INTEGER,
    "paymentMethod" "PaymentVerificationMethod",
    "paymentReference" TEXT,
    "stripePaymentId" TEXT,
    "invoiceId" INTEGER,
    "adminApproved" BOOLEAN,
    "adminApprovedAt" TIMESTAMP(3),
    "adminApprovedBy" INTEGER,
    "adminNotes" TEXT,
    "providerQueuedAt" TIMESTAMP(3),
    "prescribedAt" TIMESTAMP(3),
    "prescribedBy" INTEGER,
    "orderId" INTEGER,
    "requestedEarly" BOOLEAN NOT NULL DEFAULT false,
    "patientNotes" TEXT,
    "medicationName" TEXT,
    "medicationStrength" TEXT,
    "medicationForm" TEXT,
    "planName" TEXT,

    CONSTRAINT "RefillQueue_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for orderId
CREATE UNIQUE INDEX "RefillQueue_orderId_key" ON "RefillQueue"("orderId");

-- Create indexes for RefillQueue
CREATE INDEX "RefillQueue_clinicId_status_idx" ON "RefillQueue"("clinicId", "status");
CREATE INDEX "RefillQueue_patientId_idx" ON "RefillQueue"("patientId");
CREATE INDEX "RefillQueue_subscriptionId_idx" ON "RefillQueue"("subscriptionId");
CREATE INDEX "RefillQueue_nextRefillDate_idx" ON "RefillQueue"("nextRefillDate");
CREATE INDEX "RefillQueue_status_nextRefillDate_idx" ON "RefillQueue"("status", "nextRefillDate");

-- Add foreign key constraints
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_lastOrderId_fkey" FOREIGN KEY ("lastOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
