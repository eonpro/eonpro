-- CreateTable
CREATE TABLE "LabReport" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "documentId" INTEGER,
    "labName" TEXT NOT NULL DEFAULT 'Quest Diagnostics',
    "specimenId" TEXT,
    "collectedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "fasting" BOOLEAN,

    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportResult" (
    "id" SERIAL NOT NULL,
    "labReportId" INTEGER NOT NULL,
    "testName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueNumeric" DOUBLE PRECISION,
    "unit" TEXT,
    "referenceRange" TEXT,
    "flag" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabReport_documentId_key" ON "LabReport"("documentId");

-- CreateIndex
CREATE INDEX "LabReport_patientId_idx" ON "LabReport"("patientId");

-- CreateIndex
CREATE INDEX "LabReport_clinicId_idx" ON "LabReport"("clinicId");

-- CreateIndex
CREATE INDEX "LabReportResult_labReportId_idx" ON "LabReportResult"("labReportId");

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PatientDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportResult" ADD CONSTRAINT "LabReportResult_labReportId_fkey" FOREIGN KEY ("labReportId") REFERENCES "LabReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
