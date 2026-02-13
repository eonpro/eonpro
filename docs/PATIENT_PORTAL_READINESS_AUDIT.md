# Patient Portal Readiness Audit

**Date:** February 8, 2026  
**Context:** Assess portal readiness using the same failure patterns that caused weight/water display issues (patientId resolution, 401 handling, single source of truth, cache/refetch).

---

## 1. Error Patterns We Fixed (Progress / Weight)

| Pattern | What went wrong | Fix applied |
|--------|------------------|-------------|
| **patientId null on load** | Only `localStorage.user.patientId` used; when missing, progress never fetched weight. | Progress page: call `/api/auth/me` when patient and no patientId; persist to localStorage; show clear error if still missing. |
| **Dual fetch** | Progress page and WeightTracker both GET weight → could disagree (one 401, one 200). | Single source: progress page fetches weight, passes `weightLogsFromParent` to WeightTracker; WeightTracker skips internal GET when controlled. |
| **401 silent** | GET returned 401 → we never updated state → empty UI, no message. | Progress page: on any 401 in `fetchData`, set error "Your session has expired. Please log in again." and return. |
| **Cache** | Refetch after mutation could return cached response. | `portalFetch` default `cache: 'no-store'`; progress GETs use it. |

---

## 2. Portal-Wide Audit

### 2.1 patientId-dependent pages

Pages that need `patientId` to load data (progress, medications, documents, chat, dashboard).

| Page | patientId source | /api/auth/me when missing? | 401 handling | Verdict |
|------|------------------|----------------------------|--------------|---------|
| **Progress** | localStorage → /api/auth/me | Yes | Yes (clear message) | OK (fixed) |
| **Dashboard** | localStorage → /api/auth/me | Yes | No | 401 → empty widgets, no message |
| **Medications** | localStorage → /api/auth/me | Yes | No | 401 → empty reminders, no message |
| **Documents** | localStorage → /api/auth/me | Yes | Generic "Failed to load" only | 401 not distinguished |
| **Chat** | localStorage only; fallback `user.id` | No (and `user.id` is wrong) | Yes (session expired + redirect) | **Bug:** wrong patientId when patientId missing |

### 2.2 Session-only pages (no patientId in URL/body)

API infers identity from JWT/session (appointments, billing, care-plan, achievements, shipments, health-score, bloodwork, photos, settings, subscription).

| Page | 401 handling | Verdict |
|------|--------------|---------|
| **Appointments** | No (only response.ok) | 401 → empty list, no message |
| **Billing** | No | 401 → empty, no message |
| **Care plan** | No | 401 → empty, no message |
| **Achievements** | No | 401 → empty, no message |
| **Shipments** | Yes ("Please log in to view your shipments") | OK |
| **Chat** | Yes | OK |
| **Health score** | No | 401 → empty |
| **Bloodwork** | No | 401 → empty |
| **Photos** | No (generic error or throw) | 401 not distinguished |
| **Settings** | No | 401 not distinguished |
| **Subscription** | No | 401 not distinguished |

### 2.3 Layout and global auth

- **Layout:** Checks `user` + token in localStorage; redirects to login if missing. Does not call `/api/auth/me` or validate token server-side. Expired token can still pass; first API call will 401.
- **portalFetch:** Uses `getAuthHeaders()` (localStorage); default `cache: 'no-store'`. No global 401 interceptor (each page handles or doesn’t).

---

## 3. Issues Summary

### High priority

1. **Chat: wrong patientId**  
   Uses `userData.patientId || userData.id`. `user.id` is the auth user id, not the patient record id. Can load wrong chat or fail.  
   **Fix:** Resolve patientId like Progress/Documents: localStorage first; if patient and missing, call `/api/auth/me` and use `user.patientId`; do not use `user.id` as patientId.

2. **Dashboard: 401 leaves UI empty**  
   `loadPatientData` only checks `response.ok`. On 401, vitals/weight/reminders/photos stay empty with no "session expired" message.  
   **Fix:** At start of `loadPatientData`, or after first failing request, if status === 401 set a session-expired message (and optionally redirect or show banner).

3. **Medications: 401 leaves reminders empty**  
   Same pattern; no 401-specific message.  
   **Fix:** In `loadData`, if response.status === 401 set error "Your session has expired. Please log in again." and return.

### Medium priority

4. **Documents: 401 shows generic error**  
   Any non-ok (including 401) shows "Failed to load documents. Please try again."  
   **Fix:** If response.status === 401, set "Your session has expired. Please log in again." (and optionally redirect).

5. **Appointments, Billing, Care plan, Achievements, Health score, Bloodwork, Photos, Settings, Subscription: no 401 handling**  
   On 401, pages show empty content and no session-expired message.  
   **Fix:** For each main data-fetch, if response.status === 401 set a clear session-expired message (and optionally redirect). Consider a small shared hook or helper (e.g. `handlePortalResponse(res)` that sets error and returns false on 401).

### Low priority

6. **No global 401 handling**  
   Every page implements (or doesn’t) 401. A single place (e.g. portalFetch wrapper or layout effect that checks a shared "session invalid" state) could redirect or show a banner on first 401.  
   **Fix:** Optional: add a response interceptor or shared "session expired" state used by layout to show banner/redirect.

---

## 4. Readiness Verdict (updated after fixes)

| Area | Status | Notes |
|------|--------|------|
| **Progress / Health Tracking** | Ready | patientId resolved, 401 handled, single source for weight |
| **Chat** | Ready | patientId via /api/auth/me; 401 handled |
| **Dashboard** | Ready | 401 → dataError banner with Log in |
| **Medications** | Ready | 401 → loadError banner with Log in |
| **Documents** | Ready | 401 → session-expired UI with Log in |
| **Shipments** | Ready | 401 handled |
| **Appointments, Billing, Care plan, Achievements, Health score, Bloodwork, Photos, Subscription** | Ready | 401 → clear message and/or Log in / Try again |

**Overall:** Session-expired (401) is now handled consistently across the portal with a shared helper and user-friendly messaging. Remaining work: optional Settings 401 on save/change-password, optional “Log in” link on Achievements/Bloodwork error UI, and continued focus on empty states, loading states, and form validation for patient satisfaction.

---

## 5. Completed Improvements (Feb 8, 2026)

- **Shared 401 helper:** `src/lib/api/patient-portal-client.ts` — `SESSION_EXPIRED_MESSAGE`, `getPortalResponseError(response)` (401 → session message, 403 → access denied). All portal pages use this for consistent messaging.
- **Chat:** patientId now resolved via `/api/auth/me` when missing; removed incorrect `user.id` fallback.
- **Dashboard:** `dataError` state; on 401 from vitals/weight/reminders/photos, show amber banner with “Log in” link.
- **Medications:** `loadError` + 401 in `loadData`; banner with Log in link.
- **Documents:** 401 in `fetchDocuments` sets session message; error UI shows “Session Expired” + Log in when applicable.
- **Appointments, Billing, Care plan, Achievements, Health score, Bloodwork, Photos, Subscription:** Main fetch checks `getPortalResponseError(res)`; session-expired message and (where applicable) Log in link or “Try again” flow.

---

## 6. Recommended Next Steps (remaining)

1. ~~**Settings:**~~ **Done.** Save profile and Change password now check `getPortalResponseError` and show session-expired message (alert).
2. ~~**Achievements:**~~ **Done.** When `error === SESSION_EXPIRED_MESSAGE`, the error UI shows a “Log in” Log in link (amber styling) instead of only Try again.
3. **Bloodwork:** When `error` is session expired, the list page shows the error banner with a Log in link (implemented).
4. **Optional:** Global 401 interceptor (e.g. portalFetch wrapper that sets a shared “sessionExpired” and lets layout show one banner/redirect).

---

## 7. Additional Areas for Patient Satisfaction

- **Empty states:** Ensure every list (appointments, documents, reminders, messages, shipments, etc.) has a clear “no data yet” message and, where relevant, a CTA (e.g. “Book your first appointment”, “Upload a document”).
- **Loading states:** Every data fetch should show a loading indicator so the patient knows the app is working; avoid blank screens.
- **Form validation:** Inline validation and clear error messages on progress (weight, water, exercise, sleep, nutrition), medications (reminder form), documents (upload), and settings (profile, password).
- **Offline / PWA:** Portal has offline banner and install prompt; ensure critical flows degrade gracefully (e.g. show “You’re offline” instead of silent failure).
- **Console logs:** Existing `console.error` calls use generic messages; ensure no PHI is ever logged (e.g. avoid logging response bodies or user identifiers).

---

## 8. Smoke test and runbook

- **Automated:** `tests/e2e/patient-portal-session-expired.e2e.ts` — Playwright project `patient-portal-smoke`. Logs in as patient, visits each portal route, clears tokens, reloads, asserts session-expired message or Log in / Try again link.
- **Manual runbook:** `docs/PATIENT_PORTAL_SMOKE_TEST_STAGING.md` — How to run the automated test against staging and a manual checklist.

---

## 9. Files Referenced

- Progress: `src/app/patient-portal/progress/page.tsx`
- WeightTracker: `src/components/WeightTracker.tsx`
- Dashboard: `src/app/patient-portal/page.tsx`
- Chat: `src/app/patient-portal/chat/page.tsx`
- Medications: `src/app/patient-portal/medications/page.tsx`
- Documents: `src/app/patient-portal/documents/page.tsx`
- Layout: `src/app/patient-portal/layout.tsx`
- API client: `src/lib/api/patient-portal-client.ts`
- Root cause analysis: `docs/archive/WEIGHT_TRACKER_DISPLAY_ROOT_CAUSE_ANALYSIS.md`
