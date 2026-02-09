# Fix: Documents Tab 500 (GET /api/patients/:id/documents)

When the **Documents** tab for a patient returns **500**, the API is throwing while listing documents. Follow these steps to fix it.

## 1. Get the actual error message

The route now returns the error message in the response body and logs it on the server.

- **Browser:** Open DevTools → Network, reload the Documents tab, click the failed `documents` request, and read the **Response** body. Look for `error: "Failed to fetch documents: <message>"`.
- **Server logs:** Search for `Error fetching documents` and use the logged `error` and `stack`.

## 2. Apply the right fix by error type

| If the error says… | Fix |
|--------------------|-----|
| **Can't reach database** / **Connection** / **ECONNREFUSED** | Check `DATABASE_URL` (and `DIRECT_DATABASE_URL` if using PgBouncer) in the environment (e.g. Vercel). Ensure the DB is reachable from the app (network, firewall, pooling). |
| **Table 'PatientDocument' does not exist** / **relation "PatientDocument" does not exist** | Run migrations in the deploy environment: `npm run db:migrate` or `prisma migrate deploy`. Ensure the deploy pipeline runs this (e.g. `vercel-build` runs `db:migrate:safe` then build). |
| **Unknown arg** / **Invalid prisma.patientDocument** | Prisma schema and DB are out of sync. Run `prisma generate` and `prisma migrate deploy` (or `db push` in dev only). Confirm the same schema and migrations are used in CI and production. |
| **Authentication required** / **Invalid or expired token** | You’ll get 401, not 500. If you do see 500 and logs mention auth, check that the auth middleware and JWT verification are not throwing (e.g. missing `JWT_SECRET`). |
| **Patient not found** | You’ll get 404 from the route. No change needed for documents list. |
| **Access denied** / **Patient not in your clinic** | You’ll get 403. Ensure the user’s token has the correct `clinicId` (staff/admin) or `patientId` (patient) for that patient. |

## 3. Auth checklist (if the caller is the patient portal)

For **patient** users, the JWT must include `patientId` so the route can allow access to their own documents.

- **Login:** `src/app/api/auth/login/route.ts` sets `tokenPayload.patientId` (from user or fallback by email).
- **Verify OTP:** `src/app/api/auth/verify-otp/route.ts` sets `patientId: patient.id` for patient logins.

If patients use another login path, that path must set `patientId` on the JWT the same way.

## 4. Verify the fix

- Open the patient’s Documents tab again; it should load (empty list or list of documents).
- Optionally call the API directly with a valid Bearer token:
  ```bash
  curl -s -H "Authorization: Bearer YOUR_TOKEN" "https://ot.eonpro.io/api/patients/2695/documents"
  ```
  You should get `200` and a JSON array (possibly empty), not 500.

## Summary

1. Reproduce and read the **error message** from the 500 response or server logs.  
2. Fix **DB** (URL, connectivity, migrations) or **auth** (JWT payload, middleware) based on that message.  
3. Re-test the Documents tab (and optional `curl`).
