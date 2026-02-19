-- AlterTable: Add matchStrategy column to PatientShippingUpdate
-- Tracks how each shipping record was matched to a patient/order
-- Values: lifefileOrderId, patientLookup, rematch:<strategy>, manual, etc.
ALTER TABLE "PatientShippingUpdate" ADD COLUMN "matchStrategy" TEXT;
