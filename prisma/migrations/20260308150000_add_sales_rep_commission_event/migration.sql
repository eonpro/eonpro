-- CreateTable
CREATE TABLE "SalesRepCommissionEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "stripeEventId" TEXT,
    "stripeObjectId" TEXT,
    "stripeEventType" TEXT,
    "eventAmountCents" INTEGER NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "baseCommissionCents" INTEGER NOT NULL DEFAULT 0,
    "volumeTierBonusCents" INTEGER NOT NULL DEFAULT 0,
    "productBonusCents" INTEGER NOT NULL DEFAULT 0,
    "multiItemBonusCents" INTEGER NOT NULL DEFAULT 0,
    "commissionPlanId" INTEGER,
    "patientId" INTEGER,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringMonth" INTEGER,
    "status" "CommissionEventStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "holdUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SalesRepCommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepCommissionEvent_clinicId_stripeEventId_key" ON "SalesRepCommissionEvent"("clinicId", "stripeEventId");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_salesRepId_status_idx" ON "SalesRepCommissionEvent"("salesRepId", "status");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_clinicId_occurredAt_idx" ON "SalesRepCommissionEvent"("clinicId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_status_holdUntil_idx" ON "SalesRepCommissionEvent"("status", "holdUntil");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_salesRepId_occurredAt_idx" ON "SalesRepCommissionEvent"("salesRepId", "occurredAt");

-- AddForeignKey
ALTER TABLE "SalesRepCommissionEvent" ADD CONSTRAINT "SalesRepCommissionEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepCommissionEvent" ADD CONSTRAINT "SalesRepCommissionEvent_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
