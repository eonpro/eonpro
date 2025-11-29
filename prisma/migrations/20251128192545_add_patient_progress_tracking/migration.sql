-- CreateTable
CREATE TABLE "PatientWeightLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "weight" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'lbs',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'patient',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientWeightLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatientMedicationReminder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "patientId" INTEGER NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeOfDay" TEXT NOT NULL DEFAULT '08:00',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggered" DATETIME,
    "metadata" JSONB,
    CONSTRAINT "PatientMedicationReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PatientWeightLog_patientId_recordedAt_idx" ON "PatientWeightLog"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "PatientMedicationReminder_patientId_isActive_idx" ON "PatientMedicationReminder"("patientId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PatientMedicationReminder_patientId_medicationName_dayOfWeek_key" ON "PatientMedicationReminder"("patientId", "medicationName", "dayOfWeek");
