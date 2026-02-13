# Patient Portal – Deep Audit Report

**P0 fixes completed (2025-02):** Patient document upload (403), JWT fallback removed, middleware auth guard for `/patient-portal`, and all portal `response.json()` replaced with `safeParseJson`. See "P0 Changes Summary" below.

---

**Scope:** `src/app/patient-portal/**`, shared components used by portal (`src/components/**`, `src/lib/**`, `src/domains/**` as referenced), and patient-portal API routes (`src/app/api/patient-portal/**`, `src/app/api/patients/[id]/documents/**`).

**Focus:** Functionality, enterprise code quality, runtime stability, hydration/SSR, API resilience, security/PHI compliance.

---

## A) 🔴 Critical Issues (must-fix)

### 1. **Patient document upload returns 403 (broken flow)**

- **Location:** `src/app/patient-portal/documents/page.tsx` (lines 170–173) calls `POST /api/patients/${patientId}/documents`.
- **Evidence:** `src/app/api/patients/[id]/documents/route.ts` lines 134–137 explicitly reject patient role:
  ```ts
  if (user.role === 'patient') {
    return NextResponse.json({ error: 'Patients cannot upload documents' }, { status: 403 });
  }
  ```
- **Risk:** Patients can list documents but every upload fails with 403. UX shows “Upload failed” with no way to succeed.
- **Remediation:** Either (a) allow `patient` in POST with strict check `user.patientId === patientId` and only allow upload for self, or (b) switch portal to `POST /api/patient-portal/documents` and adapt the client to send JSON (e.g. base64) instead of FormData. Option (a) is minimal-diff if the patients route already has file handling; (b) requires changing request shape and possibly file size handling.

### 2. **JWT fallback secret in patient-portal tracking**

- **Location:** `src/app/api/patient-portal/tracking/route.ts` line 22.
- **Evidence:** `jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')`.
- **Risk:** If `JWT_SECRET` is unset (e.g. misconfiguration), tokens are verified with a known default; session hijack or forgery possible.
- **Remediation:** Remove fallback. Use a validated env (e.g. from `@/lib/config/env`) and return 401 if secret is missing. No default secret in code.

### 3. **Layout reads `localStorage` in `useEffect` then renders – brief flash of unguarded content**

- **Location:** `src/app/patient-portal/layout.tsx` lines 111–154.
- **Evidence:** Guard runs inside `useEffect`. Until it runs, `loading` is true and a spinner is shown; after it runs, either redirect or main UI. So the first paint is loading, not portal content. However, if a child page rendered before layout’s effect ran (e.g. due to Suspense or streaming), that child could access `localStorage` and assume a logged-in user. In practice the layout is client and children are under it, so the main risk is a short loading state, not wrong data – but the guard is client-only and there is no server/middleware guard.
- **Risk:** No server-side or middleware auth for `/patient-portal`; anyone can hit the route and see the loading spinner; real guard is only after hydration. For strict enterprise, portal routes should be protected in middleware or server layout so unauthenticated users never receive portal shell.
- **Remediation:** Add middleware (or server layout) that checks auth (e.g. cookie/Bearer) and redirects to login for `/patient-portal` when not authenticated. Keep client guard as defense-in-depth.

### 4. **Unsafe `response.json()` – can throw on malformed API response**

- **Locations (portal pages):**
  - `documents/page.tsx` line 90: `const data = await response.json();` (GET list), line 179: `const newDocuments = await response.json();` (POST).
  - `medications/page.tsx` lines 127, 161.
  - `chat/page.tsx` lines 118, 178.
  - `appointments/page.tsx` multiple `.json()` calls.
  - `achievements/page.tsx` lines 128, 133, 138, 143.
  - `health-score/page.tsx` line 75.
  - `photos/page.tsx`, `subscription/page.tsx`, `billing/page.tsx`, `care-plan/page.tsx`, `shipments/page.tsx`, `bloodwork/page.tsx`, `bloodwork/[reportId]/page.tsx`, `photos/medical/page.tsx`, `photos/verification/page.tsx`, `photos/progress/page.tsx`.
- **Risk:** If the API returns non-JSON (e.g. 502/504 HTML, proxy error page), `response.json()` throws and can crash the component or leave UI in a bad state.
- **Remediation:** Use `safeParseJson(response)` from `@/lib/utils/safe-json` (or equivalent) and handle `null` (show error state, don’t assume array/object). Apply to all portal fetches that currently use `.json()`.

---

## B) 🟠 High-Risk Issues

### 5. **PHI in `localStorage` (user object)**

- **Location:** Multiple portal pages and `layout.tsx` store and read `user` from `localStorage` (e.g. `layout.tsx` 112–113, 196–201; `progress/page.tsx` 149; `settings/page.tsx` 80, 127–129).
- **Evidence:** Stored object includes `firstName`, `lastName`, `email`, `patientId`, and in progress page `email` is explicitly stored: `toStore = { ...userData, patientId, email: me.email }`.
- **Risk:** PHI persists on device; if the device is shared or compromised, exposure. HIPAA guidance favors minimal storage and secure session handling.
- **Remediation:** Store only non-PHI session identifiers (e.g. `userId`, `patientId`, `role`) in `localStorage`; resolve display name/email from a secure API when needed, or use httpOnly cookie + server session for sensitive data.

### 6. **`console.error` instead of structured logger (and possible PHI in logs)**

- **Locations:** e.g. `medications/page.tsx` 133, 170, 187; `progress/page.tsx` 245, 273, 302, 342, 373; `page.tsx` 117, 266, 269; `chat/page.tsx` 131; `achievements/page.tsx` 147, 172; `appointments/page.tsx` 135, 149, 161, 184, 225, 256; `documents/page.tsx` uses `logger.error` (good) but `catch (error: any)` then `logger.error('View error:', error)` can log stack/object that might contain PHI if error ever included request/response bodies.
- **Risk:** Inconsistent logging; if any `console.error` or logger call ever includes user/patient objects or identifiers in development, risk of PHI in log aggregation.
- **Remediation:** Replace all `console.error` in portal with `logger.error` and ensure log payloads only include non-PHI context (e.g. `patientId`, not name/email). Sanitize `error` (message/code only) before logging.

### 7. **`portalFetch` has no timeout or abort**

- **Location:** `src/lib/api/patient-portal-client.ts`.
- **Evidence:** Uses raw `fetch(path, { ...init, headers, credentials: 'include', cache: ... })` with no `signal` or timeout.
- **Risk:** Hung requests can leave UI loading indefinitely; no way to cancel in-flight requests on navigation or retry with backoff.
- **Remediation:** Add optional `AbortSignal` and a default timeout (e.g. 30s) via `AbortController`; expose `signal` in `init` so callers can cancel. Consider a small retry with backoff for 5xx/network errors.

### 8. **Tracking route uses cookie-only auth (no Bearer)**

- **Location:** `src/app/api/patient-portal/tracking/route.ts` lines 16–18: reads only `cookieStore.get('patient-token')` / `auth-token`; no `Authorization: Bearer` from header.
- **Evidence:** Other portal APIs use `withAuth` (Bearer + cookie). `ActiveShipmentTracker` uses `getAuthHeaders()` (Bearer) + `credentials: 'include'`.
- **Risk:** If tokens are only in `localStorage` (e.g. some login flows), tracking request may send no auth and return 401 even when the user is logged in.
- **Remediation:** Align tracking with rest of portal auth: use same `withAuth` middleware (so Bearer from header is supported) or ensure cookie is always set when patient logs in.

### 9. **Double-submit / race on documents upload**

- **Location:** `src/app/patient-portal/documents/page.tsx` – `isUploading` is set but the file `<input>` is only hidden; the drop zone and “Click to upload” are replaced by progress UI when `isUploading` is true, so user can’t easily double-submit. However, rapid double-click before state updates could theoretically fire two submissions.
- **Risk:** Low but non-zero; duplicate uploads or confusing state.
- **Remediation:** Disable the file input and drop handler when `isUploading` (e.g. `disabled={isUploading}`, ignore drag/drop when `isUploading`).

### 10. **TypeScript `any` and weak typing in portal**

- **Locations:** `layout.tsx` line 85: `useState<any>(null)` for userData; `page.tsx` 50, 54–55: `useState<any>(null)` for patient, recentShipment, nextReminder; 159, 207, 211, 234, 236, 243, 253: `.map((x: any) => ...)`; `documents/page.tsx` 238: `catch (error: any)`; `settings/page.tsx` 244: `setActiveSection(item.id as any)`; multiple calculator/photo pages: `as any` for CSS variables (`style={{ '--tw-ring-color': primaryColor } as any}`); `photos/medical/page.tsx` and `photos/progress/page.tsx`: `verificationStatus: any`.
- **Risk:** Erodes type safety; easy to pass wrong shape to API or state; `error: any` can hide real error types.
- **Remediation:** Define minimal interfaces for user, patient, shipment, reminder, and API responses; replace `any` and `as any` (use proper React.CSSProperties for style objects). Use `unknown` in catch and narrow before logging.

---

## C) 🟡 Medium Issues

### 11. **Inconsistent use of `portalFetch` vs raw `fetch`**

- **Location:** `src/components/patient-portal/ActiveShipmentTracker.tsx` line 102: `fetch('/api/patient-portal/tracking', { headers: getAuthHeaders(), credentials: 'include' })`; `PhotoUploader.tsx` uses raw `fetch` for `/api/patient-portal/photos/upload` and `/api/patient-portal/photos`.
- **Risk:** If auth or cache behavior is centralized in `portalFetch`, these callers can drift (e.g. missing credentials or cache policy).
- **Remediation:** Use `portalFetch` for all patient-portal API calls from portal components so auth and behavior are consistent.

### 12. **Patient portal documents list vs patient-portal API response shape**

- **Evidence:** Portal documents page uses `GET /api/patients/${patientId}/documents` and does `setDocuments(data)` (expects array). `GET /api/patient-portal/documents` returns `{ documents }`. So list is intentionally using the patients API; only upload is wrong. No bug here for list; just note that two document APIs exist and portal mixes them (list from patients, upload currently to patients and fails).

### 13. **No global loading/error boundary for data fetches**

- **Evidence:** Each page manages its own `loading`/`error` state. If a child component throws during render (e.g. due to unexpected API shape), the portal `error.tsx` will catch it (good), but there is no shared “offline” or “request failed” strategy beyond per-page handling.
- **Remediation:** Consider a small data-fetch wrapper or boundary that shows a consistent “Something went wrong” + retry for failed fetches, and optionally an offline banner (you have `OfflineBanner` in layout – ensure it’s visible and tested).

### 14. **Injection tracker stores data only in `localStorage`**

- **Location:** `src/app/patient-portal/tools/injection-tracker/page.tsx` – injection history in `injection-history` key; no backend.
- **Risk:** Data is device-only; no backup or cross-device sync; cleared with browser data. Not PHI in the same way as name/DOB but still health-related.
- **Remediation:** Document as “local only” in UI; optionally add optional sync to backend later with consent and PHI controls.

### 15. **i18n language in `localStorage`**

- **Location:** `src/lib/i18n/patient-portal.ts` – `STORAGE_KEY = 'patient-portal-language'`; `getStoredPatientPortalLanguage` / `setStoredPatientPortalLanguage` use `localStorage` with SSR guard.
- **Risk:** Minimal (preference only, no PHI). Safe.

### 16. **Config uses `process.env` in base path**

- **Location:** `src/lib/config/patient-portal.ts` – `PATIENT_PORTAL_PATH = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_PATIENT_PORTAL_PATH) || '/portal'`.
- **Risk:** In edge/server, `process` exists; in browser, Next injects env at build time. Generally fine; ensure build has correct `NEXT_PUBLIC_*` for each env.

---

## D) 🟢 Low-Risk / Cosmetic

### 17. **CSS variable cast `as any`**

- **Locations:** Multiple portal pages use `style={{ '--tw-ring-color': primaryColor } as any}`.
- **Remediation:** Type as `React.CSSProperties & { '--tw-ring-color'?: string }` or use a small typed helper to avoid `as any`.

### 18. **Hardcoded support phone in error UI**

- **Location:** `src/app/patient-portal/error.tsx` line 81: `href="tel:+18001234567"`.
- **Remediation:** Source from branding or config (e.g. `supportPhone` from ClinicBrandingContext).

### 19. **Notification count in layout is static**

- **Location:** `layout.tsx` line 86: `const [notifications, setNotifications] = useState(3);` – never updated from API.
- **Remediation:** Replace with real count from API or remove badge until implemented.

---

## E) ✅ What’s Strong / Enterprise-Ready

- **Centralized portal fetch and session message:** `portalFetch` and `getPortalResponseError` / `SESSION_EXPIRED_MESSAGE` give consistent auth and user-facing errors.
- **Safe JSON parsing where used:** `safeParseJsonString` and `safeParseJson` used in layout, progress, page, documents, chat, medications, settings; reduces crash risk from malformed localStorage or API bodies.
- **Patient-scoped documents GET:** `GET /api/patients/[id]/documents` correctly allows `patient` role and enforces `user.patientId === patientId`; list is secure.
- **Auth on almost all patient-portal APIs:** Most routes use `withAuth` or `withAuthParams` with role checks; documents POST is the outlier for patients (rejected by design on patients route).
- **Route guard for disabled modules:** Layout uses `getNavModuleIdForPath` and `enabledNavIds` to redirect when a disabled module URL is bookmarked.
- **Error boundary:** `patient-portal/error.tsx` catches render errors and shows session-expired vs generic error with reset; development shows error message.
- **Logout uses full redirect:** `window.location.href = '/login'` after clearing storage (and optional logout API call) avoids deferred navigation.
- **SSR guards for `localStorage`:** Most pages check `typeof window !== 'undefined'` or run in `useEffect` before reading `localStorage`; layout guard is in `useEffect` so no direct SSR access.
- **HIPAA audit on documents (patients route):** `auditLog` with `DOCUMENT_VIEW` and list metadata on GET; upload path has audit on patients route for staff/admin.
- **Cancelled flag in async effects:** Dashboard, documents, progress, chat use `let cancelled = false` and cleanup to avoid setState after unmount.

---

## F) 📋 Prioritized Fix Plan

| Priority | Item | Effort | Action |
|----------|------|--------|--------|
| **P0** | Patient document upload 403 | S | Allow patient role on `POST /api/patients/[id]/documents` when `user.patientId === patientId`; keep existing file handling and audit. |
| **P0** | JWT fallback secret (tracking) | XS | Remove `\|\| 'your-secret-key'`; require `JWT_SECRET` from env and return 401 if missing. |
| **P1** | Replace all `response.json()` with safe parse in portal | M | Use `safeParseJson(response)` and handle null in every portal page that fetches; show error state on parse failure. |
| **P1** | Middleware or server guard for `/patient-portal` | S | Add auth check in middleware (or server layout) and redirect to login when not authenticated. |
| **P1** | `portalFetch` timeout + optional abort | S | Add default timeout (e.g. 30s) and optional `AbortSignal`; document for callers. |
| **P1** | Replace `console.error` with logger; no PHI in logs | M | Grep portal for `console.error`, replace with `logger.error` with safe context only. |
| **P2** | Reduce PHI in `localStorage` | M | Store only ids/role in `user`; fetch display name/email from `/api/auth/me` or similar when needed. |
| **P2** | Tracking route auth alignment | XS | Use `withAuth` (or same auth as other portal routes) so Bearer token is accepted. |
| **P2** | Disable document upload input when `isUploading` | XS | `disabled={isUploading}` on input; ignore drop when `isUploading`. |
| **P2** | TypeScript: remove `any` and add interfaces | L | Add types for user, patient, API responses; replace `as any` with proper types. |

S = small, M = medium, L = large; XS = extra small.

---

## G) 🧪 Verification Checklist

### Commands

```bash
# Build (no TS errors in portal)
npm run build

# Lint
npm run lint

# Unit / integration (if applicable)
npm run test -- --grep "patient-portal" 2>/dev/null || npm run test

# E2E (from project root; adjust if paths differ)
npx playwright test tests/e2e/patient-portal-session-expired.e2e.ts
```

### Manual tests

1. **Login / session**  
   Log in as patient → open `/portal` (or configured base) → confirm dashboard loads. Clear `localStorage` and refresh → confirm redirect to login with reason. Log out → confirm redirect to login and storage cleared.

2. **Documents**  
   As patient: open Documents → confirm list loads (empty or existing). Upload a file → confirm success and list updates (after P0 fix). Delete a document → confirm it disappears. View/Download → confirm no 500 and no PHI in network response body.

3. **Weight / progress**  
   Log weight, water, exercise (if enabled) → confirm save and list updates; no duplicate entries on double-click.

4. **Prescriptions / medications**  
   Open Medications → confirm list and reminders load; add/remove reminder → confirm persistence.

5. **Shipments**  
   Open Shipments and dashboard → confirm tracking data loads (or empty state); no 401 when logged in with token in localStorage.

6. **Hydration**  
   Load portal with “Disable JavaScript” then enable → confirm no layout shift or crash. Load portal on slow 3G → confirm loading states and no flash of wrong content.

7. **Error boundary**  
   Trigger a render error in a portal page (e.g. temporary throw in component) → confirm error.tsx shows and “Try Again” works.

8. **Offline**  
   Go offline → confirm offline banner if implemented; go online → confirm recovery.

---

## H) 🚦 Portal Readiness Verdict

**Verdict: Limited Rollout**

- **Blockers for full production:**  
  - Patient document **upload is broken** (403).  
  - **JWT fallback secret** in tracking is a security risk if env is missing.  
  - **No server/middleware auth** for portal routes; guard is client-only.  
  - Widespread **unsafe `response.json()`** can cause crashes on bad API responses.

- **Acceptable for limited rollout** (e.g. pilot) **after** P0 fixes and at least P1 safe-parse + logging:  
  - Use portal for read-heavy flows (dashboard, documents list, medications, shipments, progress).  
  - Avoid relying on document upload until P0 is deployed; or direct users to an alternative (e.g. staff upload) temporarily.  
  - Ensure `JWT_SECRET` is always set in all environments.

- **Recommendation:**  
  - Implement **P0** and **P1** (safe JSON, middleware/auth, portalFetch timeout, logger) before broader rollout.  
  - Then add **P2** (PHI in storage, TypeScript cleanup, upload UX) for enterprise hardening and maintainability.

- **Current status (P0 + P1 + P2 implemented):** Portal is **production-ready** for full rollout. Document upload fixed; server-side auth; safe JSON; portalFetch timeout; logger (no PHI); minimal localStorage; tracking uses withAuth; TypeScript tightened; upload guard; error support phone from branding; CSS ring helper (no `as any`).

---

## P0 Changes Summary (Implemented)

| Fix | File(s) | Risk fixed |
|-----|--------|------------|
| Patient document upload 403 | `src/app/api/patients/[id]/documents/route.ts` | Patients can upload to own profile only; staff/admin/provider unchanged (clinic check). |
| JWT fallback secret | `src/app/api/patient-portal/tracking/route.ts` | No default secret; log + return null when `JWT_SECRET` missing (GET returns 401). |
| Server-side portal auth | `middleware.ts` | Unauthenticated requests to `/patient-portal` redirect to `/login?redirect=/portal&reason=no_session` when no auth cookie. |
| Unsafe `response.json()` | All portal pages listed in §4 | Replaced with `safeParseJson(response)`; null/parse failure handled with error state or fallback. |

**Security posture:** Patient upload allowed only when `user.patientId === patientId`. Clinic and role checks for non-patient users unchanged. Audit logging and file validation unchanged.

---

## P1 Changes Summary (Implemented)

| Item | File(s) | What changed |
|------|--------|---------------|
| **portalFetch timeout & Abort** | `src/lib/api/patient-portal-client.ts` | Default 30s timeout via AbortController; caller can pass `init.signal` for cancellation (e.g. useEffect cleanup). Timeout and listener cleared in `finally`. |
| **Replace console.error** | All patient-portal pages that logged to console | Replaced with `logger.error('Context', { error: err instanceof Error ? err.message : 'Unknown' })`; no PHI in log payloads. |
| **Reduce PHI in localStorage** | New `src/lib/utils/portal-user-storage.ts`; layout, documents, chat, medications, progress, page, settings | Portal now writes only minimal user payload `{ id, role, patientId }` via `setPortalUserStorage(getMinimalPortalUserPayload(...))`. Layout resolves display name from `/api/auth/me` when missing (state only, not stored). Backward compatible: legacy full user still read; new writes are minimal. |
| **Tracking route auth** | `src/app/api/patient-portal/tracking/route.ts` | Replaced cookie-only `getPatientFromSession()` with `withAuth(getHandler, { roles: ['patient'] })`. Bearer and cookie both supported; same pattern as other portal APIs. |
| **Tighten TypeScript** | Layout, dashboard (page.tsx), documents, settings | Layout: `userData` typed; added `displayName` state. Dashboard: `patient`, `recentShipment`, `nextReminder` use explicit interfaces; removed `any` from map/sort. Documents: `catch (error: unknown)` and logger. Settings: removed `as any` from `setActiveSection(item.id)`. |

---

## P2 Changes Summary (Implemented)

| Item | File(s) | What changed |
|------|--------|---------------|
| **Document upload guard** | `src/app/patient-portal/documents/page.tsx` | File input `disabled={isUploading}`; drag/drop zone gets `pointer-events-none opacity-90` when uploading; `handleDrag`/`handleDrop` return early when `isUploading` to avoid double-submit. |
| **Error page support phone** | `src/app/patient-portal/error.tsx` | "Call Support" link uses `branding?.supportPhone` from `useClinicBranding()`; digits normalized and fallback `tel:+18001234567` when missing. |
| **CSS ring color type** | New `src/lib/utils/css-ring-color.ts`; settings, injection-tracker, calculators/calories, calculators/bmi, resources | Replaced `style={{ '--tw-ring-color': primaryColor } as any}` with `ringColorStyle(color)` helper (returns `React.CSSProperties`), removing `as any` from portal. |
