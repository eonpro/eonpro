-- AlterTable: add contentHash to PatientDocument for idempotent bloodwork uploads (SHA-256 dedupe).
ALTER TABLE "PatientDocument" ADD COLUMN "contentHash" TEXT;
