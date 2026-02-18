-- Add daysSupply to Rx table
ALTER TABLE "Rx" ADD COLUMN "daysSupply" INTEGER NOT NULL DEFAULT 30;

-- CreateTable: RxOrderSet
CREATE TABLE "RxOrderSet" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "RxOrderSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RxOrderSetItem
CREATE TABLE "RxOrderSetItem" (
    "id" SERIAL NOT NULL,
    "orderSetId" INTEGER NOT NULL,
    "medicationKey" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "refills" TEXT NOT NULL,
    "daysSupply" INTEGER NOT NULL DEFAULT 30,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RxOrderSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RxOrderSet_clinicId_isActive_idx" ON "RxOrderSet"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "RxOrderSetItem_orderSetId_idx" ON "RxOrderSetItem"("orderSetId");

-- AddForeignKey
ALTER TABLE "RxOrderSet" ADD CONSTRAINT "RxOrderSet_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RxOrderSetItem" ADD CONSTRAINT "RxOrderSetItem_orderSetId_fkey" FOREIGN KEY ("orderSetId") REFERENCES "RxOrderSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
