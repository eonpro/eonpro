# Bloodwork / Lab Results Tab — Troubleshooting

## Overview

The Lab Results tab (patient profile → Labs) uses:

- **GET** `/api/patients/[id]/bloodwork` — list lab reports
- **POST** `/api/patients/[id]/bloodwork/upload` — upload Quest PDF and parse

Both require the `LabReport` and `LabReportResult` tables (and related `PatientDocument` fields). If you see **500** or **503** on the Labs tab, follow this guide.

## Quick checks

1. **Response body**  
   In the browser Network tab, open the failing request and check the **Response** body. The `error` field often explains the issue (e.g. "Lab reports are temporarily unavailable...", "Database operation failed", "File must be a PDF").

2. **Server logs**  
   For 500s, the API logs the full error and stack under:
   - `Bloodwork list failed` (GET)
   - `Bloodwork upload failed` (POST)  
   Use these to see the underlying exception (e.g. missing table, S3 config, decrypt error).

3. **Migrations**  
   Ensure all migrations have been applied in the environment that serves the API (e.g. production DB):

   ```bash
   npx prisma migrate status
   npx prisma migrate deploy   # if pending
   ```

   Relevant migrations:

   - `20260207_add_lab_report_bloodwork` — creates `LabReport`, `LabReportResult`
   - `20260208_add_patient_document_content_hash` — adds `contentHash` to `PatientDocument`
   - `20260208000000_bloodwork_upload_dedup_unique` — unique index for dedup
   - `20260208000001_lab_report_parser_version` — adds `parserVersion` to `LabReport`

## Common causes

| Symptom | Likely cause | Action |
|--------|----------------|--------|
| GET 503, message "temporarily unavailable" / "run database migrations" | Table or column missing | Run `prisma migrate deploy` against the DB used by the API. |
| GET 500, no specific message | Unhandled error (e.g. Prisma/client bug) | Check server logs for "Bloodwork list failed"; fix or report. |
| POST 400, "No PDF file provided" | Form not sent as multipart or wrong field name | Ensure client sends `multipart/form-data` with field name `file`. Do not set `Content-Type` manually when sending `FormData`. |
| POST 400, "File must be a PDF" | Wrong MIME or file type | Server accepts `application/pdf` or filename ending in `.pdf`. |
| POST 500 | Parse/storage/DB error | Check server logs for "Bloodwork upload failed". Verify S3 (or local storage) config and DB migrations. |

## Runbook (production)

1. Reproduce: open patient → Labs tab (and optionally try upload).
2. In Network tab, note status and response body `error` for:
   - `GET .../bloodwork`
   - `POST .../bloodwork/upload` (if upload was tried).
3. If 503 or message mentions migrations:
   - Run `prisma migrate status` (and `migrate deploy` if needed) for the **production** DB.
   - Redeploy or restart the API so it uses the updated schema.
4. If 500: check application/Vercel logs for "Bloodwork list failed" or "Bloodwork upload failed" and act on the logged error (e.g. missing env, wrong S3 config, missing table).

## Optional: status endpoint

To verify that the Labs API can reach the lab report table, you can call:

- **GET** `/api/patients/[id]/bloodwork/status` (same auth as list)

If the table is missing or inaccessible, this returns 503 with a clear message; if OK, it returns `{ ok: true }`. Useful for support or health checks.
