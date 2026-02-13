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
| POST 503, "PDF parsing library not available" / "Lab report parsing is temporarily unavailable" | pdf-parse or native deps fail in serverless (e.g. Vercel) | See "PDF parsing library not available" section below. Use self-hosted Node or separate parsing service. |
| POST 500 | Parse/storage/DB error | Check server logs for "Bloodwork upload failed". Verify S3 (or local storage) config and DB migrations. |

## Production: GET 503 + POST 500 (e.g. app.eonpro.io)

If you see **GET 503** ("Lab reports are temporarily unavailable") and **POST 500** ("An unexpected error occurred") on the Labs tab:

1. **Cause:** The production database is almost certainly missing the bloodwork tables or columns. The API returns 503 when it detects schema/table errors; upload can surface as 500 when the same missing schema causes a different error shape.
2. **Fix (run against the DB used by production):**
   ```bash
   npx prisma migrate status    # confirm pending migrations
   npx prisma migrate deploy    # apply all pending (LabReport, LabReportResult, contentHash, etc.)
   ```
3. **After migrations:** Restart or redeploy the API so it uses the updated schema. Reload the Labs tab; both list and upload should work.
4. **If 500 persists after migrations:** Check application logs (Vercel/host) for `Bloodwork list failed` or `Bloodwork upload failed` — the logged error and stack will show the real cause (e.g. S3, decrypt, pdf-parse).

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

## PDF parsing library not available / 503 on upload

If you see **POST 503** with a message like "Lab report parsing is temporarily unavailable on this server" or "PDF parsing library not available":

1. **Cause:** The `pdf-parse` package (and its dependencies `@napi-rs/canvas`, `pdfjs-dist`) often fails to load in **Vercel serverless** or other serverless runtimes. Native canvas bindings may not be available in the function environment.
2. **Check server logs:** Look for `Failed to load pdf-parse` or `Bloodwork upload failed`; the logged error (e.g. `Cannot find module`, `@napi-rs/canvas`) confirms this.
3. **Workarounds:**
   - **Self-hosted / Docker:** Deploy the app with `output: 'standalone'` and run on a Node.js server (not serverless). pdf-parse works in full Node environments.
   - **Alternative infrastructure:** Run bloodwork parsing on a long-running Node server, AWS Lambda with provisioned layers for native deps, or a background worker.
   - **Vercel:** There is no reliable fix for pdf-parse + @napi-rs/canvas on Vercel serverless today. Consider moving lab parsing to a separate service (e.g. API route on a self-hosted Next.js or a dedicated microservice).
