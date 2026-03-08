-- Add weekly/report-window volume tier fields to sales rep commission plans
ALTER TABLE "SalesRepCommissionPlan"
  ADD COLUMN "volumeTierEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "volumeTierWindow" TEXT,
  ADD COLUMN "volumeTierRetroactive" BOOLEAN NOT NULL DEFAULT true;

-- Add volume tier table (per-plan flat commission by sales count range)
CREATE TABLE "SalesRepVolumeCommissionTier" (
  "id" SERIAL NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "planId" INTEGER NOT NULL,
  "minSales" INTEGER NOT NULL,
  "maxSales" INTEGER,
  "amountCents" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SalesRepVolumeCommissionTier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesRepVolumeCommissionTier_planId_idx"
  ON "SalesRepVolumeCommissionTier"("planId");
CREATE INDEX "SalesRepVolumeCommissionTier_planId_minSales_idx"
  ON "SalesRepVolumeCommissionTier"("planId", "minSales");

ALTER TABLE "SalesRepVolumeCommissionTier"
  ADD CONSTRAINT "SalesRepVolumeCommissionTier_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SalesRepCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
