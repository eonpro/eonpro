-- Add patientId column
ALTER TABLE "Patient" ADD COLUMN "patientId" TEXT;

-- Populate patientId for existing rows
UPDATE "Patient" SET "patientId" = printf('%05d', "id") WHERE "patientId" IS NULL;

-- Ensure uniqueness
CREATE UNIQUE INDEX "Patient_patientId_key" ON "Patient"("patientId");

-- Extend PatientDocument
ALTER TABLE "PatientDocument" ADD COLUMN "sourceSubmissionId" TEXT;
ALTER TABLE "PatientDocument" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER';

-- Create PatientCounter table
CREATE TABLE "PatientCounter" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "current" INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "PatientCounter" ("id", "current") VALUES (1, 0);
