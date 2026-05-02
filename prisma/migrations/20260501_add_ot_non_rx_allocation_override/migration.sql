-- ============================================================================
-- Migration: add OtNonRxAllocationOverride for OT non-Rx disposition
-- ============================================================================
-- Adds a per-(invoice|payment) override snapshot for OT clinic non-Rx charges
-- (bloodwork / consults / packages / standalone Stripe payments). Mirrors
-- `OtSaleAllocationOverride` and reuses the same `OtSaleAllocationOverrideStatus`
-- enum so DRAFT/FINALIZED semantics are identical across Rx and non-Rx.
--
-- Composite key: `dispositionKey` is a string of the form
--   'inv:<invoiceId>'  -- when the row is keyed off a non-Rx Stripe invoice
--   'pay:<paymentId>'  -- when the row is keyed off an invoice-less Payment
-- The unique index `(clinicId, dispositionKey)` prevents duplicate overrides
-- and is the upsert target from the API layer.
--
-- Safe additive change: new enum, new table, new FKs and indexes only. No
-- existing rows are touched, no FK constraints on existing tables change.
-- ============================================================================

-- CreateEnum
CREATE TYPE "OtNonRxChargeKind" AS ENUM ('bloodwork', 'consult', 'other');

-- CreateTable
CREATE TABLE "OtNonRxAllocationOverride" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "dispositionKey" TEXT NOT NULL,
    "invoiceId" INTEGER,
    "paymentId" INTEGER,
    "chargeKind" "OtNonRxChargeKind" NOT NULL,
    "overridePayload" JSONB NOT NULL,
    "status" "OtSaleAllocationOverrideStatus" NOT NULL DEFAULT 'DRAFT',
    "lastEditedByUserId" INTEGER,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "OtNonRxAllocationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OtNonRxAllocationOverride_clinicId_dispositionKey_key"
    ON "OtNonRxAllocationOverride"("clinicId", "dispositionKey");

-- CreateIndex
CREATE INDEX "OtNonRxAllocationOverride_clinicId_status_idx"
    ON "OtNonRxAllocationOverride"("clinicId", "status");

-- CreateIndex
CREATE INDEX "OtNonRxAllocationOverride_invoiceId_idx"
    ON "OtNonRxAllocationOverride"("invoiceId");

-- CreateIndex
CREATE INDEX "OtNonRxAllocationOverride_paymentId_idx"
    ON "OtNonRxAllocationOverride"("paymentId");

-- AddForeignKey
ALTER TABLE "OtNonRxAllocationOverride"
    ADD CONSTRAINT "OtNonRxAllocationOverride_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtNonRxAllocationOverride"
    ADD CONSTRAINT "OtNonRxAllocationOverride_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtNonRxAllocationOverride"
    ADD CONSTRAINT "OtNonRxAllocationOverride_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtNonRxAllocationOverride"
    ADD CONSTRAINT "OtNonRxAllocationOverride_lastEditedByUserId_fkey"
    FOREIGN KEY ("lastEditedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Defense-in-depth: enforce the "exactly one of invoiceId / paymentId" rule at
-- the SQL level too, so a buggy API write can't create a row with both null
-- (orphan) or both non-null (ambiguous).
-- ============================================================================
ALTER TABLE "OtNonRxAllocationOverride"
    ADD CONSTRAINT "OtNonRxAllocationOverride_disposition_xor_chk"
    CHECK (
        ("invoiceId" IS NOT NULL AND "paymentId" IS NULL)
        OR ("invoiceId" IS NULL AND "paymentId" IS NOT NULL)
    );
