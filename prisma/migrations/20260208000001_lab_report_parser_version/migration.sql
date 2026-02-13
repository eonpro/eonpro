-- AlterTable: add parserVersion to LabReport for re-process and audit.
ALTER TABLE "LabReport" ADD COLUMN "parserVersion" TEXT;
