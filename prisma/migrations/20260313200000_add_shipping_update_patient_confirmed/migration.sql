-- Add patient delivery confirmation columns to PatientShippingUpdate
ALTER TABLE "PatientShippingUpdate" ADD COLUMN "patientConfirmedAt" TIMESTAMP(3);
ALTER TABLE "PatientShippingUpdate" ADD COLUMN "patientConfirmedById" INTEGER;
