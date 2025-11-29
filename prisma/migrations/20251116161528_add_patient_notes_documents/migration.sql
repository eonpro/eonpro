-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "notes" TEXT;
ALTER TABLE "Patient" ADD COLUMN "tags" JSONB;

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "source" TEXT,
    "data" BLOB,
    "externalUrl" TEXT,
    CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
