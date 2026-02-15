-- Add searchIndex column for DB-level full-text search on encrypted PHI fields.
-- Contains lowercased: "firstname lastname email phone_digits patientid"
-- Original PHI fields remain AES-256-GCM encrypted; this enables efficient LIKE queries.
ALTER TABLE "Patient" ADD COLUMN "searchIndex" TEXT;

-- Enable pg_trgm extension for trigram-based substring matching (ILIKE '%query%')
-- This is safe to run multiple times (IF NOT EXISTS)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram index for O(1) substring search at any scale (10M+ rows)
-- This index supports: WHERE "searchIndex" ILIKE '%italo%' efficiently
CREATE INDEX "Patient_searchIndex_trgm_idx" ON "Patient" USING GIN ("searchIndex" gin_trgm_ops);
