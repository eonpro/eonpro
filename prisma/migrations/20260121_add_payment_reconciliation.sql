-- Add paidAt field to Payment table
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Create ReconciliationStatus enum
DO $$ BEGIN
    CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'CREATED', 'FAILED', 'SKIPPED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create PaymentReconciliation table
CREATE TABLE IF NOT EXISTS "PaymentReconciliation" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeEventId" TEXT,
    "stripeEventType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "description" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "matchedBy" TEXT,
    "matchConfidence" TEXT,
    "patientId" INTEGER,
    "invoiceId" INTEGER,
    "patientCreated" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on stripeEventId
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentReconciliation_stripeEventId_key" ON "PaymentReconciliation"("stripeEventId");

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "PaymentReconciliation_stripePaymentIntentId_idx" ON "PaymentReconciliation"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "PaymentReconciliation_stripeChargeId_idx" ON "PaymentReconciliation"("stripeChargeId");
CREATE INDEX IF NOT EXISTS "PaymentReconciliation_stripeCustomerId_idx" ON "PaymentReconciliation"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "PaymentReconciliation_customerEmail_idx" ON "PaymentReconciliation"("customerEmail");
CREATE INDEX IF NOT EXISTS "PaymentReconciliation_status_idx" ON "PaymentReconciliation"("status");
CREATE INDEX IF NOT EXISTS "PaymentReconciliation_createdAt_idx" ON "PaymentReconciliation"("createdAt");

-- Add foreign key constraints
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_clinicId_fkey" 
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_patientId_fkey" 
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_invoiceId_fkey" 
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
