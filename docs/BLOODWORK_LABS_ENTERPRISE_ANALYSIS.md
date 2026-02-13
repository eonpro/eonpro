# Bloodwork / Labs Feature — Enterprise-Level Analysis

**Scope:** Labs tab (PDF upload of bloodwork, display for patient portal and clinic patient profile).  
**Date:** 2025-02-08.

---

## 1. Build

| Check | Status | Notes |
|-------|--------|------|
| **Next.js build** | ✅ Passes | `npm run build` completes; Prisma generate + Next.js compile succeed. |
| **TypeScript in build** | ⚠️ Skipped | `next.config.js` has `typescript.ignoreBuildErrors: true`, so TS errors do not fail the build. |
| **Standalone output** | ✅ | `output: 'standalone'`; suitable for Docker. |

**Recommendation:** Run `npx tsc --noEmit` in CI and fix errors so the feature is type-safe without relying on `ignoreBuildErrors`.

---

## 2. Code Quality

### Strengths

- **Auth and authorization:** All bloodwork API routes use `withAuth` / `withAuthParams` with correct roles (patient for portal, admin/provider/staff/super_admin for clinic). Clinic routes enforce `patientId` + `clinicId` and 404/403.
- **Single service layer:** `createBloodworkReportFromPdf()` in `@/lib/bloodwork/service.ts` is used by both portal and clinic upload routes; no duplicated business logic.
- **Transaction:** Report creation (document + lab report + results) runs in a single `prisma.$transaction()` with `Prisma.TransactionClient` typing.
- **PHI and validation:** Patient name on PDF is validated against profile when `requireNameMatch` is true. No PHI in logs (only `patientId`, `clinicId`, `labReportId`, `resultCount`).
- **File handling:** PDF-only, 15MB limit, MIME check; storage supports S3 or local via `storeFile` / `uploadToS3` with `FileCategory.LAB_RESULTS`.
- **Patient portal client:** `portalFetch()` in `@/lib/api/patient-portal-client` centralizes auth headers and `credentials: 'include'` for portal → API calls.

### Gaps

- **Error handling (done):** Service throws BadRequestError/ServiceUnavailableError; routes use handleApiError with route/context. Client gets structured code and user-friendly messages. Structured codes and logging; previously generic “Failed to load…” without logging or structured codes; 500s could be more informative (e.g. “storage unavailable” vs “parse error”) for ops.
- **Idempotency (done):** PatientDocument.contentHash (SHA-256) added; duplicate PDF returns existing report. Migration: 20260208_add_patient_document_content_hash. Previously: upload was not idempotent; same PDF uploaded twice creates two reports. Acceptable for labs; optional later: hash-based dedupe.
- **Rate limiting (done):** bloodworkUploadRateLimit (10/15min per IP) on both upload routes. Previously: no dedicated rate limiter; rely on app-level limits.
- **Audit (done):** logPHIAccess on GET list/single for portal and clinic (resourceType LabReport / LabReportList, patientId; no PHI in logs).

---

## 3. Functionality

- **Patient portal:** Upload Quest PDF → list reports → open report by id → view parsed results by category (Heart, Metabolic, etc.) and summary (optimal/in range/out of range). i18n (EN/ES) present.
- **Clinic profile:** Labs tab: upload PDF, list reports, select report for detail, “View report” opens stored PDF in new tab. Same parsing and display as portal.
- **Parsing:** Quest-specific parser in `@/lib/bloodwork/quest-parser.ts`; handles multi-page, table layout, and fallbacks. Name extraction for match; collected/reported dates, fasting, specimen ID.
- **Edge cases:** Name mismatch returns clear error; unparseable or non-Quest PDFs return user-facing messages. Image-only PDFs may fail (parser expects text).

---

## 4. Link Errors (Fixed)

| Issue | Location | Fix applied |
|-------|----------|-------------|
| **Wrong patient portal path** | `src/lib/auth/roles.config.ts` (patient navigation) | “Lab Results” pointed to `${PATIENT_PORTAL_PATH}/labs` (404). Actual route is `/bloodwork`. Updated to `${PATIENT_PORTAL_PATH}/bloodwork`. |

**Remaining:** Any external docs or deep links that point to `/portal/labs` or `/patient-portal/labs` should be updated to `/portal/bloodwork` or `/patient-portal/bloodwork` (or use the path derived from the registry).

---

## 5. TypeScript Errors (Addressed in This Pass)

| File | Issue | Fix |
|------|--------|-----|
| `src/lib/bloodwork/quest-parser.ts` | `last` and `secondLast` undefined in one branch → runtime `ReferenceError` | Defined `last` and `secondLast` from `parts` before use. |
| `src/lib/bloodwork/quest-parser.ts` | `mod.default` not on type for dynamic `pdf-parse` import | Cast import to type with `default` and use safe fallback. |
| `src/lib/bloodwork/service.ts` | `tx` in `$transaction` implicitly `any` | Typed callback with `Prisma.TransactionClient`. |
| `src/app/api/patient-portal/bloodwork/route.ts` | Parameter `r` implicitly `any` in `reports.map` | Typed with `(typeof reports)[number]`. |
| `src/app/api/patient-portal/bloodwork/[reportId]/route.ts` | Same for `report.results.map` / `filter` | Introduced `ResultRow` from `(typeof report.results)[number]`. |
| `src/app/api/patients/[id]/bloodwork/route.ts` | Same for `reports.map` | Typed with `(typeof reports)[number]`. |
| `src/app/api/patients/[id]/bloodwork/[reportId]/route.ts` | Same for results map/filter | Used `ResultRow` from `(typeof report.results)[number]`. |

**Note:** `PatientDocumentCategory` from `@prisma/client` is used in `service.ts`. If `tsc` reports it as missing, ensure `prisma generate` has been run and that the schema enum name matches. The build does not fail due to `ignoreBuildErrors`.

---

## 6. CORS

- **Relevant requests:** Patient portal and clinic UI call same-origin APIs (e.g. `/api/patient-portal/bloodwork`, `/api/patients/[id]/bloodwork`). No cross-origin API calls for this feature.
- **Config:** No CORS headers or CORS middleware were added in `next.config.js` for bloodwork; none required for same-origin.
- **Credentials:** Portal uses `portalFetch(..., { credentials: 'include' })`; clinic uses `fetch(..., { credentials: 'include' })` with auth headers. Appropriate for same-origin cookies/Bearer.

**Conclusion:** No CORS issues for current deployment. If the portal is later served from another domain, add CORS (and allowed origins) for that API base URL.

---

## 7. Summary Scorecard

| Area | Rating | Notes |
|------|--------|--------|
| **Build** | Good | Build passes; TS not enforced in build. |
| **Code quality** | Good | Clear auth, service layer, transaction, PHI care; audit and richer errors would raise it. |
| **Functionality** | Good | Upload, list, detail, PDF view (clinic), parsing, i18n; Quest-focused. |
| **Link errors** | Fixed | Patient “Lab Results” nav now points to `/bloodwork`. |
| **TypeScript** | Improved | Parser bug and implicit `any` in bloodwork routes addressed; project-wide TS still has other errors. |
| **CORS** | N/A | Same-origin only; no CORS needed. |

---

## 8. Recommendations

1. **CI:** Run `npx tsc --noEmit` in CI and fix remaining project TypeScript errors; consider turning off `ignoreBuildErrors` once clean.
2. **Audit:** Done — see Gaps (Addressed). Previously: add HIPAA audit logging for “view lab report” and “list lab reports” (resource, user, patient id, no PHI in logs).
3. **Errors:** Done — see Gaps (Addressed) above.
4. **Docs:** Update any runbooks or external links that reference `/portal/labs` to use `/bloodwork`.
5. **Tests:** Add integration tests: upload (success, duplicate, name mismatch, invalid PDF, rate limit); list and single report for portal and clinic. Location: e.g. tests/integration/bloodwork.api.test.ts. Owner: Engineering; add to CI.

---

## 9. Deploy and visibility

- **Labs tab on patient profile:** The **Labs** tab is in the patient sidebar (second after Profile). Link: `/patients/[id]?tab=lab`. Shows `PatientLabView`: upload Quest PDF, list reports, view single report, open PDF.
- **Deploy (Vercel):** `vercel.json` uses `buildCommand: "npm run vercel-build"` (migrate + build). Push to the connected branch or run `vercel --prod` to deploy. Migration `20260208_add_patient_document_content_hash` runs on deploy.
- **Post-deploy:** On any patient profile, confirm **Labs** appears in the left sidebar and opens the bloodwork UI.

---

## 10. Enabling the Labs tab per clinic (e.g. ot.eonpro.io)

If the Labs tab does not show for a clinic (e.g. OT at ot.eonpro.io), ensure the clinic’s `features.BLOODWORK_LABS` is not `false`. Default is `true` when the key is missing.

### Option A: Super-admin UI (recommended)

1. Log in as **super_admin** (e.g. on app.eonpro.io).
2. Go to **Super Admin → Clinics** and open the clinic (e.g. OT).
3. Open the **Features** tab.
4. Turn **“Labs tab (patient profile)”** **ON** (toggle to the right).
5. Click **Save**. The Labs tab will appear on that clinic’s patient profiles (e.g. ot.eonpro.io).

### Option B: PATCH API

Call the clinic features API with a partial payload to set `BLOODWORK_LABS: true` (merge with existing features).

- **As clinic admin (updates own clinic):**
  ```bash
  curl -X PATCH 'https://<host>/api/admin/clinic/features' \
    -H 'Authorization: Bearer <admin-token>' \
    -H 'Content-Type: application/json' \
    -d '{"BLOODWORK_LABS": true}'
  ```
- **As super_admin (update any clinic by ID):**
  ```bash
  curl -X PATCH 'https://<host>/api/admin/clinic/features' \
    -H 'Authorization: Bearer <super-admin-token>' \
    -H 'Content-Type: application/json' \
    -d '{"clinicId": <OT_CLINIC_ID>, "BLOODWORK_LABS": true}'
  ```
  Replace `<OT_CLINIC_ID>` with the OT clinic’s numeric ID (from Super Admin → Clinics or the database).

### Option C: Direct database

Merge `BLOODWORK_LABS: true` into the clinic’s `features` JSON (do not replace the whole object, or you will remove other flags).

- **Postgres example** (replace `OT_CLINIC_ID` and adjust JSON merge for your DB):
  ```sql
  UPDATE "Clinic"
  SET features = features || '{"BLOODWORK_LABS": true}'::jsonb
  WHERE id = OT_CLINIC_ID;
  ```
  (If your column is `json` not `jsonb`, use equivalent merge/concatenation for your DB.)
- **Prisma script** (Node): load the clinic by id (or subdomain `'ot'`), then `prisma.clinic.update({ where: { id }, data: { features: { ...existing.features, BLOODWORK_LABS: true } } })`.
