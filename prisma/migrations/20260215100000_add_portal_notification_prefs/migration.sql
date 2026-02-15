-- AlterTable: Add portal notification preferences JSON column to Patient
ALTER TABLE "Patient" ADD COLUMN "portalNotificationPrefs" JSONB;
