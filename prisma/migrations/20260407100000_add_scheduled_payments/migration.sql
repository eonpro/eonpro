-- CreateEnum
CREATE TYPE "ScheduledPaymentType" AS ENUM ('AUTO_CHARGE', 'REMINDER');

-- CreateEnum
CREATE TYPE "ScheduledPaymentStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "ScheduledPayment" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "planId" TEXT,
    "planName" TEXT,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "type" "ScheduledPaymentType" NOT NULL DEFAULT 'AUTO_CHARGE',
    "status" "ScheduledPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3),
    "paymentId" INTEGER,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" INTEGER,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledPayment_clinicId_scheduledDate_idx" ON "ScheduledPayment"("clinicId", "scheduledDate");

-- CreateIndex
CREATE INDEX "ScheduledPayment_patientId_idx" ON "ScheduledPayment"("patientId");

-- CreateIndex
CREATE INDEX "ScheduledPayment_status_scheduledDate_idx" ON "ScheduledPayment"("status", "scheduledDate");

-- AddForeignKey
ALTER TABLE "ScheduledPayment" ADD CONSTRAINT "ScheduledPayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPayment" ADD CONSTRAINT "ScheduledPayment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
