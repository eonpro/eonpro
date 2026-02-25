-- Sales Rep Commission Plans (dedicated area — separate from affiliates)
-- Reuses CommissionPlanType and CommissionAppliesTo enums from affiliate domain.

CREATE TABLE "SalesRepCommissionPlan" (
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
    "initialPercentBps" INTEGER,
    "initialFlatAmountCents" INTEGER,
    "recurringPercentBps" INTEGER,
    "recurringFlatAmountCents" INTEGER,
    "recurringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recurringMonths" INTEGER,

    CONSTRAINT "SalesRepCommissionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesRepPlanAssignment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "commissionPlanId" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "SalesRepPlanAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesRepCommissionPlan_clinicId_idx" ON "SalesRepCommissionPlan"("clinicId");
CREATE INDEX "SalesRepCommissionPlan_isActive_idx" ON "SalesRepCommissionPlan"("isActive");

CREATE INDEX "SalesRepPlanAssignment_clinicId_idx" ON "SalesRepPlanAssignment"("clinicId");
CREATE INDEX "SalesRepPlanAssignment_salesRepId_idx" ON "SalesRepPlanAssignment"("salesRepId");
CREATE INDEX "SalesRepPlanAssignment_commissionPlanId_idx" ON "SalesRepPlanAssignment"("commissionPlanId");
CREATE INDEX "SalesRepPlanAssignment_effectiveFrom_effectiveTo_idx" ON "SalesRepPlanAssignment"("effectiveFrom", "effectiveTo");

ALTER TABLE "SalesRepCommissionPlan" ADD CONSTRAINT "SalesRepCommissionPlan_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesRepPlanAssignment" ADD CONSTRAINT "SalesRepPlanAssignment_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesRepPlanAssignment" ADD CONSTRAINT "SalesRepPlanAssignment_salesRepId_fkey"
    FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesRepPlanAssignment" ADD CONSTRAINT "SalesRepPlanAssignment_commissionPlanId_fkey"
    FOREIGN KEY ("commissionPlanId") REFERENCES "SalesRepCommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
