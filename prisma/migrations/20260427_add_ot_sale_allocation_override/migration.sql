-- ============================================================================
-- Migration: add OtSaleAllocationOverride for OT clinic manual reconciliation
-- ============================================================================
-- Adds a per-Order override snapshot the super-admin tool uses to manually
-- allocate medications, shipping, TRT telehealth, doctor/Rx fee, fulfillment,
-- and custom line items for the OT (Overtime) clinic. Status flips DRAFT
-- -> FINALIZED when the admin generates the branded PDF.
--
-- Safe additive change: new enum, new table, new FKs and indexes only. No
-- existing rows are touched, no FK constraints on existing tables change.
-- ============================================================================

-- CreateEnum
CREATE TYPE "OtSaleAllocationOverrideStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "OtSaleAllocationOverride" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "overridePayload" JSONB NOT NULL,
    "status" "OtSaleAllocationOverrideStatus" NOT NULL DEFAULT 'DRAFT',
    "lastEditedByUserId" INTEGER,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "OtSaleAllocationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OtSaleAllocationOverride_orderId_key"
    ON "OtSaleAllocationOverride"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OtSaleAllocationOverride_clinicId_orderId_key"
    ON "OtSaleAllocationOverride"("clinicId", "orderId");

-- CreateIndex
CREATE INDEX "OtSaleAllocationOverride_clinicId_status_idx"
    ON "OtSaleAllocationOverride"("clinicId", "status");

-- AddForeignKey
ALTER TABLE "OtSaleAllocationOverride"
    ADD CONSTRAINT "OtSaleAllocationOverride_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtSaleAllocationOverride"
    ADD CONSTRAINT "OtSaleAllocationOverride_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtSaleAllocationOverride"
    ADD CONSTRAINT "OtSaleAllocationOverride_lastEditedByUserId_fkey"
    FOREIGN KEY ("lastEditedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
