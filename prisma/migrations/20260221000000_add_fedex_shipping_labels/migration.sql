-- AlterTable: Add FedEx credential fields to Clinic
ALTER TABLE "Clinic" ADD COLUMN     "fedexAccountNumber" TEXT,
ADD COLUMN     "fedexClientId" TEXT,
ADD COLUMN     "fedexClientSecret" TEXT,
ADD COLUMN     "fedexEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: ShipmentLabel for FedEx shipping labels
CREATE TABLE "ShipmentLabel" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "shipmentId" TEXT,
    "serviceType" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'FEDEX',
    "originAddress" JSONB NOT NULL,
    "destinationAddress" JSONB NOT NULL,
    "weightLbs" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "weightOz" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "labelS3Key" TEXT,
    "labelFormat" TEXT NOT NULL DEFAULT 'PDF',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "voidedAt" TIMESTAMP(3),
    "voidedBy" INTEGER,

    CONSTRAINT "ShipmentLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentLabel_clinicId_patientId_idx" ON "ShipmentLabel"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "ShipmentLabel_trackingNumber_idx" ON "ShipmentLabel"("trackingNumber");

-- CreateIndex
CREATE INDEX "ShipmentLabel_clinicId_createdAt_idx" ON "ShipmentLabel"("clinicId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
