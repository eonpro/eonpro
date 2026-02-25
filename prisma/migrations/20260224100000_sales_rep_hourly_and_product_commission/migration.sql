-- Add hourly rate to SalesRepPlanAssignment
ALTER TABLE "SalesRepPlanAssignment" ADD COLUMN "hourlyRateCents" INTEGER;

-- SalesRepProductCommission: per-product or per-package commission (clinic-customizable)
CREATE TABLE "SalesRepProductCommission" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productBundleId" INTEGER,
    "bonusType" TEXT NOT NULL,
    "percentBps" INTEGER,
    "flatAmountCents" INTEGER,

    CONSTRAINT "SalesRepProductCommission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesRepProductCommission_planId_idx" ON "SalesRepProductCommission"("planId");
CREATE INDEX "SalesRepProductCommission_productId_idx" ON "SalesRepProductCommission"("productId");
CREATE INDEX "SalesRepProductCommission_productBundleId_idx" ON "SalesRepProductCommission"("productBundleId");

ALTER TABLE "SalesRepProductCommission" ADD CONSTRAINT "SalesRepProductCommission_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "SalesRepCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesRepProductCommission" ADD CONSTRAINT "SalesRepProductCommission_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesRepProductCommission" ADD CONSTRAINT "SalesRepProductCommission_productBundleId_fkey"
    FOREIGN KEY ("productBundleId") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
