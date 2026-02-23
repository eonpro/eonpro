-- Sales Rep Ref Codes and Touch Tracking
-- Enables sales reps to create shareable intake URLs and track clicks/conversions (like affiliates).

-- CreateTable SalesRepRefCode
CREATE TABLE "SalesRepRefCode" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalesRepRefCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable SalesRepTouch
CREATE TABLE "SalesRepTouch" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "visitorFingerprint" TEXT NOT NULL,
    "cookieId" TEXT,
    "ipAddressHash" TEXT,
    "userAgent" TEXT,
    "salesRepId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "landingPage" TEXT,
    "referrerUrl" TEXT,
    "touchType" "TouchType" NOT NULL DEFAULT 'CLICK',
    "convertedPatientId" INTEGER,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "SalesRepTouch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepRefCode_clinicId_refCode_key" ON "SalesRepRefCode"("clinicId", "refCode");
CREATE INDEX "SalesRepRefCode_clinicId_idx" ON "SalesRepRefCode"("clinicId");
CREATE INDEX "SalesRepRefCode_salesRepId_idx" ON "SalesRepRefCode"("salesRepId");
CREATE INDEX "SalesRepRefCode_refCode_idx" ON "SalesRepRefCode"("refCode");

CREATE INDEX "SalesRepTouch_clinicId_visitorFingerprint_idx" ON "SalesRepTouch"("clinicId", "visitorFingerprint");
CREATE INDEX "SalesRepTouch_clinicId_cookieId_idx" ON "SalesRepTouch"("clinicId", "cookieId");
CREATE INDEX "SalesRepTouch_salesRepId_idx" ON "SalesRepTouch"("salesRepId");
CREATE INDEX "SalesRepTouch_createdAt_idx" ON "SalesRepTouch"("createdAt");
CREATE INDEX "SalesRepTouch_refCode_idx" ON "SalesRepTouch"("refCode");
CREATE INDEX "SalesRepTouch_salesRepId_convertedAt_idx" ON "SalesRepTouch"("salesRepId", "convertedAt");
CREATE INDEX "SalesRepTouch_refCode_createdAt_idx" ON "SalesRepTouch"("refCode", "createdAt");
CREATE INDEX "SalesRepTouch_salesRepId_createdAt_idx" ON "SalesRepTouch"("salesRepId", "createdAt");
CREATE INDEX "SalesRepTouch_salesRepId_touchType_createdAt_idx" ON "SalesRepTouch"("salesRepId", "touchType", "createdAt");

-- AddForeignKey
ALTER TABLE "SalesRepRefCode" ADD CONSTRAINT "SalesRepRefCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesRepRefCode" ADD CONSTRAINT "SalesRepRefCode_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesRepTouch" ADD CONSTRAINT "SalesRepTouch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesRepTouch" ADD CONSTRAINT "SalesRepTouch_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
