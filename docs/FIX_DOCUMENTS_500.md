# Fix Documents Tab – 500 (GET) and 503 (POST Upload)

When the **Documents** tab for a patient returns **500**, the API is throwing while listing documents. When **document upload** returns **503 (Service Unavailable)**, document storage is not configured or failing.

## POST 503 (Document Upload)

If `POST /api/patients/:id/documents` returns **503**, the cause is one of:

1. **S3 not enabled or not configured in production**
   - The app requires AWS S3 for document uploads when `NODE_ENV=production` or `VERCEL=1`.
   - **Check Vercel env vars** for the deployment (e.g. app.eonpro.io):
     - `NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true`
     - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
     - `AWS_S3_BUCKET_NAME` or `AWS_S3_DOCUMENTS_BUCKET_NAME`
   - If S3 is not configured in production, you get:  
     `"Document upload is not available. Please contact support to enable cloud storage."` (code: `STORAGE_NOT_CONFIGURED`)

2. **S3 upload failed (network, permissions, bucket)**
   - If S3 is configured but the upload throws, the route returns 503 with:  
     `"Document storage is temporarily unavailable. For lab results, use the Lab tab..."` (code: `STORAGE_UNAVAILABLE`)
   - Check Vercel logs for the failed request; look for S3-related errors (credentials, bucket access, network).

**Quick fix checklist for 503:**
- [ ] Set `NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true` in Vercel
- [ ] Set AWS credentials and bucket name in Vercel
- [ ] Ensure the S3 bucket exists and the IAM user has `s3:PutObject` (and `s3:GetObject`) permissions
- [ ] Redeploy after changing env vars

**Full runbook:** See `docs/DOCUMENT_UPLOAD_503_RUNBOOK.md` for step-by-step troubleshooting, the diagnostic endpoint, and IAM policy examples.

---

When the **Documents** tab for a patient returns **500**, the API is throwing while listing documents. Follow these steps to fix it.

**Full runbook (Lifefile + Documents):** For a single step-by-step guide that covers both **Lifefile tracking verification** and **Documents 500**, see **`docs/RUNBOOK_100_PERCENT_OPERATIONAL.md`**.

## Defensive coding in place

- **Date serialization:** The GET handler uses a safe `toSafeIso()` helper so invalid or missing `createdAt` from the DB never throws; each document is formatted without risking 500.
- **Error response:** The route uses `handleApiError`, so the response body includes an `error` field (and optional `code`, `statusCode`, `timestamp`) and is logged with route + context on the server.
- **Audit non-blocking:** HIPAA audit for the documents list is wrapped in try/catch. If audit fails, the route logs a warning and still returns the document list (200). So **500 from this route is now only from:** DB (Prisma) or auth middleware, not from audit.
- **JSON on 500:** The GET handler’s catch uses `handleApiError`; if that ever throws, a fallback catch returns `NextResponse.json({ error: '...', code: 'INTERNAL_ERROR' }, 500)` so the client always receives a JSON body.

## 1. Get the actual error message

- **Browser:** Open DevTools → Network, reload the Documents tab, click the failed `documents` request, and read the **Response** body. You should get JSON with `error: "<message>"` (and optional `code`, `statusCode`, `timestamp`). If the body is HTML or empty, the 500 may be from a layer before the route (e.g. auth middleware or Next.js).
- **Server logs:** Search for `GET /api/patients/[id]/documents` or `handleApiError` / `Error fetching documents` and use the logged `error` and `stack`.
- **Quick debug:** If you have a Bearer token, call the API directly to see the same error in the response body:
  ```bash
  curl -s -w "\nHTTP_CODE:%{http_code}" -H "Authorization: Bearer YOUR_TOKEN" "https://YOUR_DOMAIN/api/patients/2695/documents"
  ```
  The JSON `error` field (and HTTP_CODE) tell you the cause.

## 2. Confirm the 500 response is JSON

If the response body is **HTML** or **empty**, the 500 is coming from a layer before the route (e.g. auth middleware or Next.js). In that case:

- Check that `JWT_SECRET` is set in the environment.
- Check auth middleware and token validation (no uncaught throws).
- The GET handler and its catch block always return **JSON** with at least an `error` field; if you see HTML, the failure is outside this route.

## 3. Apply the right fix by error type

| If the error says… | Fix |
|--------------------|-----|
| **Can't reach database** / **Connection** / **ECONNREFUSED** | Check `DATABASE_URL` (and `DIRECT_DATABASE_URL` if using PgBouncer) in the environment (e.g. Vercel). Ensure the DB is reachable from the app (network, firewall, pooling). |
| **Table 'PatientDocument' does not exist** / **relation "PatientDocument" does not exist** | Run migrations in the deploy environment: `npm run db:migrate` or `prisma migrate deploy`. Ensure the deploy pipeline runs this (e.g. `vercel-build` runs `db:migrate:safe` then build). |
| **Unknown arg** / **Invalid prisma.patientDocument** | Prisma schema and DB are out of sync. Run `prisma generate` and `prisma migrate deploy` (or `db push` in dev only). Confirm the same schema and migrations are used in CI and production. |
| **Authentication required** / **Invalid or expired token** | You’ll get 401, not 500. If you do see 500 and logs mention auth, check that the auth middleware and JWT verification are not throwing (e.g. missing `JWT_SECRET`). |
| **Patient not found** | You’ll get 404 from the route. No change needed for documents list. |
| **Access denied** / **Patient not in your clinic** | You’ll get 403. Ensure the user’s token has the correct `clinicId` (staff/admin) or `patientId` (patient) for that patient. |
| **Audit** / **HIPAA audit** / **auditLog** | The list route now catches audit log failures and still returns the document list; the error is logged with `Failed to create HIPAA audit log for documents list`. Fix the audit/DB dependency if you need full audit coverage. |

## 4. Auth checklist (if the caller is the patient portal)

For **patient** users, the JWT must include `patientId` so the route can allow access to their own documents.

- **Login:** `src/app/api/auth/login/route.ts` sets `tokenPayload.patientId` (from user or fallback by email).
- **Verify OTP:** `src/app/api/auth/verify-otp/route.ts` sets `patientId: patient.id` for patient logins.

If patients use another login path, that path must set `patientId` on the JWT the same way.

## 5. Verify the fix

- Open the patient’s Documents tab again; it should load (empty list or list of documents).
- Optionally call the API directly with a valid Bearer token:
  ```bash
  curl -s -H "Authorization: Bearer YOUR_TOKEN" "https://ot.eonpro.io/api/patients/2695/documents"
  ```
  You should get `200` and a JSON array (possibly empty), not 500.

## Summary

1. Reproduce and read the **error message** from the 500 response or server logs (response must be JSON with `error`; if HTML, the failure is before the route).  
2. Fix **DB** (URL, connectivity, migrations) or **auth** (JWT payload, middleware) based on that message.  
3. Re-test the Documents tab (and optional `curl`).
