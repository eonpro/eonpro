-- Phase 3.3: S3 Blob Externalization
-- Adds s3DataKey column to PatientDocument for storing S3 keys of externalized intake JSON data.
-- This is a non-breaking, additive migration. The column is nullable and unused until the feature flag is enabled.

ALTER TABLE "PatientDocument" ADD COLUMN "s3DataKey" TEXT;
