-- Prevent duplicate bloodwork uploads when two requests with the same PDF race.
-- Partial unique index: (patientId, contentHash) for LAB_RESULTS bloodwork_upload only.
CREATE UNIQUE INDEX "PatientDocument_patientId_contentHash_bloodwork_key" ON "PatientDocument" ("patientId", "contentHash")
WHERE "category" = 'LAB_RESULTS' AND "source" = 'bloodwork_upload' AND "contentHash" IS NOT NULL;
