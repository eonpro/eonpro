-- AlterEnum
-- Add ID_PHOTO to PatientDocumentCategory enum for patient ID picture uploads
ALTER TYPE "PatientDocumentCategory" ADD VALUE IF NOT EXISTS 'ID_PHOTO' BEFORE 'OTHER';
