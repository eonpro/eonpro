-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('PENDING', 'LABEL_CREATED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'EXCEPTION', 'CANCELLED');

-- CreateTable
CREATE TABLE "PatientShippingUpdate" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "trackingUrl" TEXT,
    "status" "ShippingStatus" NOT NULL DEFAULT 'SHIPPED',
    "statusNote" TEXT,
    "shippedAt" TIMESTAMP(3),
    "estimatedDelivery" TIMESTAMP(3),
    "actualDelivery" TIMESTAMP(3),
    "medicationName" TEXT,
    "medicationStrength" TEXT,
    "medicationQuantity" TEXT,
    "medicationForm" TEXT,
    "lifefileOrderId" TEXT,
    "externalRef" TEXT,
    "brand" TEXT,
    "rawPayload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'lifefile',
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PatientShippingUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_clinicId_patientId_idx" ON "PatientShippingUpdate"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_trackingNumber_idx" ON "PatientShippingUpdate"("trackingNumber");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_lifefileOrderId_idx" ON "PatientShippingUpdate"("lifefileOrderId");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_status_idx" ON "PatientShippingUpdate"("status");

-- AddForeignKey
ALTER TABLE "PatientShippingUpdate" ADD CONSTRAINT "PatientShippingUpdate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientShippingUpdate" ADD CONSTRAINT "PatientShippingUpdate_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientShippingUpdate" ADD CONSTRAINT "PatientShippingUpdate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
