-- CreateTable: AddressValidationLog
-- Tracks address parsing and validation metrics for monitoring

CREATE TABLE "AddressValidationLog" (
    "id" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "inputFormat" TEXT NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER,
    "wasStandardized" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER,
    "processingTimeMs" INTEGER,
    "errorMessage" TEXT,
    "inputPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressValidationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "AddressValidationLog_eventType_idx" ON "AddressValidationLog"("eventType");
CREATE INDEX "AddressValidationLog_clinicId_idx" ON "AddressValidationLog"("clinicId");
CREATE INDEX "AddressValidationLog_source_idx" ON "AddressValidationLog"("source");
CREATE INDEX "AddressValidationLog_createdAt_idx" ON "AddressValidationLog"("createdAt");
