-- CreateTable
CREATE TABLE "PatientDeviceConnection" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "terraUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "PatientDeviceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientDeviceConnection_terraUserId_key" ON "PatientDeviceConnection"("terraUserId");

-- CreateIndex
CREATE INDEX "PatientDeviceConnection_patientId_idx" ON "PatientDeviceConnection"("patientId");

-- CreateIndex
CREATE INDEX "PatientDeviceConnection_terraUserId_idx" ON "PatientDeviceConnection"("terraUserId");

-- CreateIndex
CREATE INDEX "PatientDeviceConnection_clinicId_patientId_idx" ON "PatientDeviceConnection"("clinicId", "patientId");

-- AddForeignKey
ALTER TABLE "PatientDeviceConnection" ADD CONSTRAINT "PatientDeviceConnection_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDeviceConnection" ADD CONSTRAINT "PatientDeviceConnection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
