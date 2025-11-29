-- CreateTable
CREATE TABLE "PatientAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    CONSTRAINT "PatientAudit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
