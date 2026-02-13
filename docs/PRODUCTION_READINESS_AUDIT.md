# Production Readiness Audit — Frontend & Platform

**Date:** February 8, 2026  
**Scope:** Functionality, code quality, TypeScript, hydration/rendering, API/data flow, performance, reliability.  
**Context:** Enterprise healthcare platform (PHI, HIPAA, multi-tenant).

## Remediation applied (same day)

- **Critical #1:** Removed dev mock patient data from `GET /api/internal/patients`; catch block now returns only `{ error: 'Failed to fetch patients' }` with status 500. Tightened `whereClause` typing.
- **Critical #2:** `GET /api/docs` now requires auth via `withAuth` with roles `['admin', 'super_admin']`.
- **Critical #3:** Layout logout handlers no longer swallow errors: AdminLayout, PatientLayout, ProviderLayout, patients layout, patient-portal layout, tickets layout, orders layout now log (logger.debug) on logout API failure and still redirect.
- **High #6:** Added `src/lib/api/patient-portal-client.ts` with `portalFetch(path, init)` that always attaches `getAuthHeaders()` and `credentials: 'include'`. Use this for all patient-portal → API calls.
- **High #7–8:** ErrorBoundary: removed explicit `any` from Sentry `withScope` callback. AdminErrorBoundary now uses `logger.error` and `Sentry.captureException` instead of `console.error`.
- **Medium:** Added `src/lib/utils/safe-json.ts` with `safeParseJson(response)` and `safeParseJsonOr(response, fallback)`. Added `LayoutUser` in `src/types/common.ts`. AdminLayout and PatientLayout now use `LayoutUser | null` for `userData` instead of `any`.

---

## 🔴 Critical Issues (must-fix before production)

### 1. **Development-only mock data returned on error (PHI risk)**

**File:** `src/app/api/internal/patients/route.ts` (lines 54–72)

On catch, when `NODE_ENV === 'development'`, the handler returns **mock patient records** (firstName, lastName, email, phone). If `NODE_ENV` is mis-set in production (e.g. staging with `NODE_ENV=development`), or the check is bypassed, this could leak fake-but-plausible PII and confuse compliance.

**Recommendation:** Remove mock patient data entirely from this route. On error, return only `{ error: 'Failed to fetch patients' }` with status 500. If dev mocks are needed, gate behind a separate env (e.g. `ALLOW_MOCK_PATIENTS=true`) and document that it must never be set in production.

---

### 2. **API route `/api/docs` is unauthenticated**

**File:** `src/app/api/docs/route.ts`

`GET /api/docs` returns API structure, endpoint list, and authentication descriptions without any auth. For an enterprise/regulated system, even “documentation” endpoints can reveal internal surface area. Not PHI, but reduces control.

**Recommendation:** Either require auth (e.g. `withAuth` with optional role) or move docs behind a feature flag / internal-only URL and document that it must not be exposed publicly in production.

---

### 3. **Swallowed promise rejections in auth checks (layouts)**

**Files (examples):**  
`src/components/layouts/AdminLayout.tsx` (line 48),  
`src/components/layouts/PatientLayout.tsx` (line 118),  
`src/components/layouts/ProviderLayout.tsx` (line 203),  
`src/app/patient-portal/layout.tsx` (line 180),  
`src/app/tickets/layout.tsx` (line 186),  
`src/app/orders/layout.tsx` (line 43),  
and others.

Pattern: `fetch('/api/auth/me', …).then(…).catch(() => {});` — errors are swallowed. Users may remain on a protected page with stale or no user state, or get no feedback when the session is invalid.

**Recommendation:** In each layout, replace `.catch(() => {})` with a handler that: (1) logs the error (no PHI), (2) clears local auth state, (3) redirects to login (e.g. `window.location.href = '/login'`) on 401 or network failure, and optionally shows a short toast.

---

### 4. **Heavy use of `any` in PHI-adjacent components**

**Files:**  
`src/components/PatientPaymentMethods.tsx` (err, card, event handlers),  
`src/components/PatientIntakeView.tsx` (entries, patient, data, doc, field, error),  
`src/components/PatientDocumentsView.tsx` (error, file, doc, cat, event),  
`src/components/PatientBillingView.tsx` (err, invoice, payment, item, plan, events).

These components handle patient/billing/intake data. `any` disables type safety and increases risk of wrong fields being sent to APIs or displayed.

**Recommendation:** Define interfaces for API responses (e.g. `Invoice`, `Payment`, `IntakeEntry`) and use them in state and handlers. Replace `err: any` with `err: unknown` and narrow (e.g. `err instanceof Error ? err.message : 'Unknown error'`). Type event handlers as `React.ChangeEvent<HTMLInputElement>` etc.

---

### 5. **Layouts rely on `localStorage` before hydration (SSR/hydration risk)**

**File:** `src/components/layouts/RoleBasedLayout.tsx` (lines 144–159)

User state is read from `localStorage` in `useEffect`. Initial render uses `userRole = null` and shows a spinner. After hydration, `localStorage` is read and may show different content. If the server ever renders something that depends on “user” (e.g. in a shared layout), you get a hydration mismatch. Currently the spinner is safe, but `userData?: any` is passed down and used in many places.

**Recommendation:** Ensure no server-rendered output depends on `user` or `userRole`. Consider a single auth context that: (1) on client, reads from localStorage/cookie and sets user, (2) all role-based layouts consume that context and show a single “loading” or “redirect to login” state until resolved. Document that role-based UI is client-only.

---

## 🟠 High-Risk Issues (likely to cause bugs or outages)

### 6. **Inconsistent auth header usage (patient portal)**

Scratchpad and code show past bugs where patient portal APIs were called without `getAuthHeaders()` and returned 401; fixes were applied. Remaining risk: any new patient-portal `fetch` that omits `getAuthHeaders()` and `credentials: 'include'` will fail in production.

**Recommendation:** Centralize patient-portal API calls in a small client (e.g. `src/lib/api/patient-portal-client.ts`) that always attaches `getAuthHeaders()` and `credentials: 'include'`. Use it for all portal → API requests. Add a lint or test that greps for `fetch(` in `src/app/patient-portal` and `src/components` used by portal and flags calls that don’t use this client.

---

### 7. **ErrorBoundary passes `scope: any` to Sentry**

**File:** `src/components/ErrorBoundary.tsx` (line 41)

`Sentry.withScope((scope: any) => { ... })` uses `any` for Sentry’s scope type. Minor, but if Sentry API changes, this could hide type errors.

**Recommendation:** Use `@sentry/nextjs` types (e.g. `Scope`) for the callback parameter, or omit the type and let inference work.

---

### 8. **Admin error boundary uses `console.error`**

**File:** `src/app/admin/layout.tsx` (line 55)

`AdminErrorBoundary` uses `console.error` for caught errors. In production, this should go through the same observability pipeline (e.g. Sentry + structured logger) as the rest of the app.

**Recommendation:** In `componentDidCatch`, call the same logger/Sentry helpers used by the main `ErrorBoundary` (e.g. `logger.error`, `Sentry.captureException`) so admin errors are visible in Sentry and logs.

---

### 9. **Response body parsing with `.catch(() => ({}))`**

**Pattern across many components:**  
e.g. `const data = await response.json().catch(() => ({}));`

If `response.json()` throws (e.g. invalid JSON), `data` becomes `{}` and code may treat it as a successful payload (e.g. `data.user` undefined without an explicit check), leading to silent wrong behavior.

**Recommendation:** Prefer a small helper, e.g. `safeParseJson(response): Promise<unknown>`, that returns a Result type or throws a clear error. Where you need a fallback, use it explicitly: `const data = await safeParseJson(response).catch(() => null); if (!data) { handleError(); return; }`.

---

### 10. **Stripe/client and multi-step DB writes**

**Files:** Various (e.g. `paymentMatchingService.ts`, `order.repository.ts`, webhook handlers)

Some flows create/update Patient, Order, or Rx in multiple steps. The codebase uses `prisma.$transaction` in many places (good), but not everywhere. Any path that creates an Order and then Rxs or updates Patient without a transaction risks partial state on failure.

**Recommendation:** Audit all API routes and services that (1) create Order + Rxs, (2) create/update Patient + related records, (3) update payment and order status together. Ensure they run inside `prisma.$transaction` with an appropriate isolation level. Document the rule in the data-integrity cursor rule (already present); add a checklist for new payment/order/patient flows.

---

## 🟡 Medium Issues (code health / future risk)

### 11. **TypeScript `any` and weak typings**

- **Layouts:** Multiple layout components use `userData?: any` (AdminLayout, ProviderLayout, PatientLayout, StaffLayout, SupportLayout, RoleBasedLayout, SuperAdminLayout, InfluencerLayout). This propagates untyped user objects across the tree.
- **APIs:** Many catch blocks use `error: any` or `err: any`; some API handlers use `(cat: any)` in filters (e.g. `src/app/api/settings/route.ts`).
- **Internal patients route:** `whereClause: any` and `(patient: Record<string, unknown>)` — could be typed with Prisma’s generated types.

**Recommendation:** Introduce a shared `AuthUser` or `LayoutUser` type (align with `AuthUser` from `@/lib/auth/middleware`) and use it for layout props. Replace `any` in catch with `unknown` and narrow. Use Prisma types for query shapes where possible.

---

### 12. **`localStorage` / `window` access and SSR**

- **PatientLabView:** `getAuthHeaders` uses `localStorage`; there is an early return when `typeof window === 'undefined'`, but the hook that provides headers could be called during SSR in a different code path.
- **NotificationProvider:** Reads/writes localStorage with `typeof window === 'undefined'` guards; good. Similar guards exist in LanguageSwitcher and others.
- **Progress page:** Reads `localStorage.getItem('user')` inside `useEffect` without a window check; since it’s in useEffect it’s client-only, but the pattern is inconsistent.

**Recommendation:** Standardize: any module that reads `localStorage` or `window` should either (1) be used only in client components and inside `useEffect`/event handlers, or (2) use a small helper that returns a safe default when `typeof window === 'undefined'`. Document one preferred pattern (e.g. “auth from context set in client layout”) to avoid hydration issues.

---

### 13. **Missing error boundaries on key segments**

Root layout and admin and tickets have error boundaries. Other critical areas (patient portal beyond layout, provider dashboard, orders, patients list, finance) may not. A single uncaught render error in a deep child can take down the whole subtree.

**Recommendation:** Add error boundaries (with Sentry reporting) at segment level for: patient-portal (if not already covered by layout), provider, orders, patients, admin/finance. Use the same `ErrorBoundary` component and route-specific fallback UIs where helpful.

---

### 14. **CI / format / pre-deploy**

Scratchpad notes: CI fails on Prettier (format:check), and optionally on migration validation or pre-deploy (secrets/DB). Unfixed, this blocks reliable “green” deploys and increases risk of shipping unformatted or untested code.

**Recommendation:** Run `npm run format` and commit; fix any migration or pre-deploy step that fails in CI (secrets, DB URL, or migration idempotency). Make format-check and type-check required for merge.

---

## 🟢 Low-Risk / Cosmetic Issues

- **NEXT_PUBLIC_ usage:** Feature flags and app URL use is appropriate; no secrets exposed. Continue to avoid putting secrets in `NEXT_PUBLIC_*`.
- **Publishable Stripe keys:** Correctly exposed via `NEXT_PUBLIC_*`; no issue.
- **VAPID key:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is appropriate for client push subscription.
- **ErrorBoundary Sentry scope:** Typed as `any`; low risk but easy to fix (see #7).
- **Unused or duplicate clinic switchers:** Two `ClinicSwitcher` components exist; consider consolidating for maintainability.

---

## ✅ What Is Well Done

1. **Auth middleware:** `withAuth`, `withClinicalAuth`, `withAdminAuth`, and role options are used consistently across the vast majority of API routes. Webhooks correctly use signature/secret verification instead of user auth.
2. **Strict TypeScript:** `strict`, `strictNullChecks`, `noImplicitAny` in `tsconfig.json` give a solid base; the main gaps are explicit `any` and missing interfaces, not relaxed compiler options.
3. **Transaction usage:** Many critical paths (prescriptions, orders, tickets, billing, registration) use `prisma.$transaction`, supporting data integrity.
4. **HIPAA-oriented rules:** Cursor rules and code patterns (no PHI in logs, auth wrappers, clinic isolation) align with HIPAA and multi-tenant requirements.
5. **Patient portal auth fix:** Critical paths (dashboard, progress, medications, chat, documents, etc.) now use `getAuthHeaders()` and `credentials: 'include'`; scratchpad documents the fix.
6. **Error reporting:** Root and tickets use ErrorBoundary with Sentry; good foundation for production debugging.
7. **Modular portal and branding:** Patient portal modules and clinic branding/features are structured for per-clinic and per-treatment configuration.
8. **Tests and security:** Dedicated security tests (auth, RBAC, multi-tenant, PHI encryption, input validation) and integration tests for critical flows (Stripe, Twilio, Lifefile, prescriptions) improve confidence.

---

## 📋 Concrete Refactor Recommendations

### A. Remove dev mock from internal patients API

```typescript
// src/app/api/internal/patients/route.ts — in catch block
} catch (error) {
  logger.error('Error fetching patients for internal use:', error);
  return NextResponse.json(
    { error: 'Failed to fetch patients' },
    { status: 500 }
  );
}
```

Remove the `if (process.env.NODE_ENV === 'development') { ... mockPatients }` block entirely.

---

### B. Layout auth check: log and redirect on failure

```typescript
// Example: AdminLayout.tsx (and mirror in PatientLayout, ProviderLayout, etc.)
fetch('/api/auth/me', { headers: getAuthHeaders(), credentials: 'include' })
  .then((res) => {
    if (res.ok) return res.json();
    throw new Error('Unauthorized');
  })
  .then((data) => { /* set user */ })
  .catch((err) => {
    logger.debug('Auth check failed, redirecting to login', { message: err?.message });
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    window.location.href = '/login';
  });
```

Apply the same pattern (with the appropriate token keys and login URL) in other layouts that currently use `.catch(() => {})`.

---

### C. Type layout user and narrow errors

```typescript
// Shared type (e.g. in @/types/layout.ts or alongside AuthUser)
export interface LayoutUser {
  id: number;
  email: string;
  role: string;
  clinicId?: number;
  patientId?: number;
  providerId?: number;
  firstName?: string;
  lastName?: string;
}

// In layout props
userData?: LayoutUser | null;

// In catch blocks
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('Operation failed', { message });
  // ...
}
```

Use `LayoutUser` (or `AuthUser` if identical) everywhere layouts pass `userData`.

---

### D. Patient portal API client (centralized auth)

```typescript
// src/lib/api/patient-portal-client.ts
import { getAuthHeaders } from '@/lib/utils/auth-token';

export async function portalFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { ...getAuthHeaders(), ...init?.headers },
    credentials: 'include',
  });
}
```

Use `portalFetch` for all patient-portal `fetch` calls so auth and credentials are never omitted.

---

## 🚀 Production Readiness Verdict

**Verdict: No — not yet production-ready without addressing critical and high-risk items.**

**Justification:**

- **Critical:** Returning mock patient data on error (even when gated by NODE_ENV) is a compliance and safety risk. Unauthenticated `/api/docs` and swallowed layout auth errors can lead to confusing or insecure behavior. Heavy `any` in PHI-adjacent UI increases the chance of logic and display bugs. Hydration/SSR discipline around `localStorage` should be explicit and consistent.
- **High-risk:** Any remaining missing auth headers in patient portal, or partial DB writes without transactions, can cause 401s or inconsistent data in production. Improving error handling and observability (Sentry, no silent catch) reduces outage and debugging time.
- **Medium:** TypeScript and error-boundary coverage and CI (format, migrations) are important for long-term maintainability and deploy reliability.

**Recommended order before production:**

1. Fix critical items (#1–#5): remove mock patients, secure or gate `/api/docs`, fix layout auth catch blocks, reduce `any` in key components, document/standardize client-only auth.
2. Address high-risk (#6–#10): centralize portal API auth, fix Sentry/admin error reporting, improve response parsing and transaction coverage.
3. Then run through a short production-readiness checklist: type-check and lint green, format clean, migrations and pre-deploy passing in CI, and a smoke test of login → patient portal → key admin flows.

After (1) and (2) are done and (3) passes, the codebase is in a much stronger position for an enterprise production deployment.
