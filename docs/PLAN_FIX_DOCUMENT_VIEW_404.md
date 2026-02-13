# Plan: Fix Document View 404 (Legacy PDF / Regenerate)

**Issue:** `GET /api/patients/3058/documents/3225` returns **404 (Not Found)** when viewing a patient document. The modal shows: *"This document was created before PDF storage was implemented. Use the regenerate endpoint to create the PDF."*

**Root cause (from code):**

- In `src/app/api/patients/[id]/documents/[documentId]/route.ts`, the GET handler serves documents in this order:
  1. **Priority 1:** `document.data` as PDF bytes → served as PDF.
  2. If `document.data` exists but is **JSON** (legacy intake stored as JSON, not PDF), the handler returns **404** with `needsRegeneration: true` and the message above.
  3. **Priority 2:** `document.externalUrl` (S3 or local file) → served from storage.
  4. If neither yields a servable file, it returns **404** with `needsRegeneration` when `document.intakeData` exists.

So the document **record** exists (id 3225), but there is **no stored PDF** to serve—only legacy JSON or missing file. The existing **regenerate** logic lives in `POST /api/admin/regenerate-pdf`, which is **admin-only**; providers in the dashboard cannot call it.

---

## Goals

1. **Allow providers** to regenerate a single document for a patient they have access to (same clinic).
2. **Improve UX** when view fails: offer a "Regenerate PDF" action so the user can fix the document and then view it.

---

## High-Level Task Breakdown

| ID | Task | Owner | Status |
|----|------|--------|--------|
| 1 | Add `POST /api/patients/[id]/documents/[documentId]/regenerate` (clinical auth: provider/admin, same clinic) | Executor | Done |
| 2 | Reuse regeneration logic (from admin/regenerate-pdf) for one document; update `document.data` with new PDF | Executor | Done |
| 3 | In `PatientDocumentsView.tsx`: on view 404 with `needsRegeneration`, show option to "Regenerate PDF" and call new endpoint; then retry view or prompt "View again" | Executor | Done |
| 4 | (Optional) Return `needsRegeneration` from GET list so UI can show a badge/icon for documents that need regeneration | Backlog | Pending |

---

## Implementation Details

### 1. New API: `POST /api/patients/[id]/documents/[documentId]/regenerate`

- **Path:** `src/app/api/patients/[id]/documents/[documentId]/regenerate/route.ts`
- **Auth:** Same as GET document: `withAuthParams`, roles `['super_admin', 'admin', 'provider']`. Enforce:
  - Patient exists and user has access (patient’s clinic = user’s clinic, or super_admin).
  - Document exists, belongs to that patient, and is `MEDICAL_INTAKE_FORM` (only type we regenerate).
- **Logic:** Mirror the single-document flow from `api/admin/regenerate-pdf/route.ts`:
  - Load document with `patient` include.
  - Resolve intake source: from `document.data` (if JSON), else from `document.intakeData`, else build minimal intake from `patient` fields.
  - Call `generateIntakePdf(intake, patient)`.
  - Update `PatientDocument`: `data = pdfBuffer`, clear `externalUrl` if desired for consistency.
- **Response:** `200 { success: true, documentId }` or `4xx/5xx` with clear error (e.g. "Document is not an intake form", "No intake data available to regenerate").

### 2. Frontend: `PatientDocumentsView.tsx`

- **Current behavior:** On view 404, `handleView` shows an alert with the API error message (already handles `needsRegeneration` in the message string).
- **Change:**
  - When `response.status === 404` and body has `needsRegeneration === true`:
    - Show a dialog/modal (or confirm) that explains the document needs PDF regeneration and offers:
      - **"Regenerate PDF"** → call `POST /api/patients/${patientId}/documents/${doc.id}/regenerate`. On success, either:
        - Automatically retry `handleView` for that doc, or
        - Show "Regenerated. Click View again." and refresh the document list if needed.
      - **"Cancel"** / "OK" to close.
  - Use the same auth (e.g. `localStorage.getItem('auth-token')` or `admin-token`) as for GET document.

### 3. Optional: List API `needsRegeneration`

- In `GET /api/patients/[id]/documents`, we could add a flag per document: e.g. `needsRegeneration: true` when category is `MEDICAL_INTAKE_FORM` and (`data` is null or is JSON) and (`intakeData` is set or `data` parses as JSON). This would allow showing a "Regenerate" icon next to such documents without trying view first. Defer to a follow-up if time is limited.

---

## Success Criteria

- Provider (or admin) on patient 3058’s Documents tab can click **View** on document 3225.
- If the document is legacy (no PDF): they see a clear message and a **Regenerate PDF** action.
- After Regenerate succeeds, **View** works and the PDF opens (or they click View again and it works).
- No change to admin-only bulk regenerate (`POST /api/admin/regenerate-pdf`); it remains for batch fixes.
- No PHI in logs; HIPAA audit for document view already in place; consider audit event for "document_regenerate" if required.

---

## Files to Touch

| File | Action |
|-----|--------|
| `src/app/api/patients/[id]/documents/[documentId]/regenerate/route.ts` | **Create** – new POST handler |
| `src/components/PatientDocumentsView.tsx` | **Edit** – handle 404 + needsRegeneration, add Regenerate action and retry view |
| `src/app/api/admin/regenerate-pdf/route.ts` | **Reference only** – reuse logic (extract shared helper if desired later) |

---

## Risks and Mitigations

- **Decryption:** Patient fields (firstName, lastName, etc.) may be encrypted. Regenerate flow uses `doc.patient`; ensure decrypt is applied where needed (e.g. `generateIntakePdf` or the service it uses may already use a repository that decrypts). Verify with existing admin regenerate path.
- **Rate:** Regenerate is per-document and triggered by user; no extra rate limit required for v1.
- **Idempotency:** Regenerating twice is safe (overwrites `data` with a new PDF).

---

## Lessons

- Document view 404 for legacy intake documents is by design: we do not serve JSON as a file. The fix is to give providers a way to run the same regeneration that admins have, scoped to one document and one patient they’re allowed to access.
