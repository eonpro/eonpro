# Full-Platform Stability and Production Readiness Report

**Date:** 2026-02-08  
**Scope:** Entire platform (frontend, API, auth, DB, payments, webhooks, config, observability)  
**Verdict:** See Section H.

---

## Remediation progress (post-report)

- **create-subscription auth (🔴#1):** **FIXED.** Route now uses `verifyAuth`, Zod-validated body, and authorization: patient may only use own `patientId`; admin/provider must have same clinic as patient; super_admin allowed for any. When only `customerId` is sent (no patientId), caller is still authenticated.
- **support/page.tsx JSON.parse (🟠#2):** **FIXED.** `JSON.parse(user)` wrapped in try/catch; on error localStorage is cleared and user is redirected to login.
- **PHI in logs – registration (🔴#2 sample):** **FIXED.** `src/lib/auth/registration.ts` no longer logs `email` in the patient registration failure message.
- **JSON.parse try/catch (🟠) – additional pages:** **FIXED.** `staff/page.tsx`, `provider/page.tsx`, `provider/settings/page.tsx`, `super-admin/clinics/new/page.tsx`, `providers/page.tsx`, and `admin/settings/stripe/page.tsx` (adminEmail fallback) now wrap `JSON.parse(localStorage...)` in try/catch with clear/redirect or safe fallback.
- **v2 stripe cancel-subscription auth:** **FIXED.** Route now requires `verifyAuth` and validates body with Zod.
- **PHI in logs – db middleware & websocket:** **FIXED.** `src/lib/db/middleware.ts` and `src/lib/realtime/websocket.ts` now log only `userId` (and relevant IDs) instead of `user.email` in warn/error/info/debug messages.
- **v2 Stripe test/validate routes – auth:** **FIXED.** `test-payment`, `test-customer`, `validate-config`, and `test-webhook` now require `verifyAuth`; return 401 when unauthenticated.
- **PHI in logs – API routes (batch):** **FIXED.** Logger calls in `auth/refresh-token`, `admin/webhooks`, `admin/clinic/info`, `users`, `users/create`, `users/[id]`, `settings`, `settings/dashboard`, `patients/protected`, `patients/[id]/tags`, `patient-portal/branding`, `developer/webhooks`, `developer/api-keys`, `admin/integrations`, `admin/create-test-user`, `admin/clinic/users/[userId]`, `admin/clinic/portal-settings`, `admin/api-keys`, `admin/dlq`, and `super-admin/clinics/[id]/lifefile` now use `userId` (and related IDs) instead of email in log messages.
- **Webhook JSON parse safety:** **FIXED.** (1) Stripe main and OT webhook `queueFailedEvent`: payload stored for failed events is now parsed in try/catch and stored as null on parse failure so the DLQ write does not throw. (2) Lifefile inbound and lifefile-data-push: on JSON parse failure they now return 400 with `{ error: 'Invalid JSON format' }` and log to webhook log instead of throwing (which previously resulted in 500 and unnecessary retries).
- **Client-side user for display only:** **FIXED.** Added `getStoredUser()` and `StoredUser` in `@/lib/auth/stored-role` with explicit "display/UI only" documentation; refactored `getStoredUserRole()` to use it. Replaced client-side JWT decode with `getStoredUser()` in: `settings/users/page.tsx`, `settings/layout.tsx`, `staff/tickets/page.tsx`, `staff/messages/page.tsx`, `PrescriptionForm.tsx`, and `BeccaAIGlobalChat.tsx`. Server still enforces auth on all API calls.
- **Audit updatedBy (API routes and service logs):** **FIXED.** Replaced `updatedBy: user.email` with `updatedBy: user.id` in audit/metadata details in settings, users, admin clinic (info, branding, features, settings, portal-settings, users), admin providers compensation, admin clinics, developer api-keys, super-admin (clinics, lifefile, routing-config, providers), patients intake, finance pending-profiles, and in domain service logs (provider.service, order.service). Note: ProviderAudit.actorEmail and similar DB columns unchanged without a migration.

---

## A) 🔴 Production-Blocking Failures

### 1. ~~Unauthenticated subscription creation~~ → FIXED

**File:** `src/app/api/v2/stripe/create-subscription/route.ts`

**Was:** Unauthenticated; any caller could create subscriptions for any patient.  
**Now:** Requires `verifyAuth`; body validated with Zod; patient role can only use own `patientId`; admin/provider require same clinic as patient; super_admin allowed for any.

---

### 2. ~~PHI in logs (HIPAA / compliance)~~ → Largely fixed

**Status:** Logger and audit `updatedBy` now use IDs only in the areas listed in “Remediation progress” above.

**Files (examples):**  
`src/lib/auth/registration.ts` (line 476), `src/app/api/users/route.ts`, `src/app/api/admin/clinic/info/route.ts`, `src/lib/realtime/websocket.ts`, `src/lib/db/middleware.ts`, and others.

**Issue:** Logging includes **email** and other identifiers (e.g. `user.email`, `targetUser.email`, `input.email`) in `logger.info` / `logger.warn` / `logger.error`. Platform rules state “Never Log PHI” and “IDs only.”

**Evidence:**  
- `logger.info(\`User ${targetUser.email} updated by ${user.email}\`)`  
- `logger.error('Patient registration failed', { ..., email: input.email })`  
- `logger.warn(\`Provider ${user.email} attempted to access patient not assigned to them\`)`

**Risk:** Audit findings, breach notification obligations if logs are exposed, and HIPAA compliance gaps.

**Required fix:** Remove email/PII from log messages. Use only IDs (e.g. `userId`, `targetUserId`, `patientId`) and/or a dedicated audit table with access controls for any needed attribution. *One instance fixed: `src/lib/auth/registration.ts` no longer logs email on patient registration failure.*

---

### 3. ~~Decoding JWT payload client-side without verification~~ → Fixed

**Status:** UI uses `getStoredUser()` from login storage; only token expiry decode remains in `lib/api/fetch.ts` (non-authorization).

**Files:**  
`src/app/staff/tickets/page.tsx`, `src/app/staff/messages/page.tsx`, `src/app/settings/users/page.tsx`, `src/components/PrescriptionForm.tsx`, `src/components/BeccaAIGlobalChat.tsx`, and others.

**Issue:** Code uses `JSON.parse(atob(token.split('.')[1]))` to read the JWT payload in the browser. This is **not** verification; it only decodes the base64 body. A tampered or forged token is still “decodable” and can be used to misrepresent role or identity if the app trusts it for authorization.

**Evidence:**  
- `const payload = JSON.parse(atob(token.split('.')[1]));` used to derive user/role for UI decisions.

**Risk:** Client-side authorization can be bypassed by forging or editing tokens. If any server path ever trusted client-decoded claims without verifying the signature, that would be a critical vulnerability. At minimum, this pattern is unsafe as a sole basis for access control.

**Required fix:** Do not use client-decoded JWT for authorization. All permission checks must use server-verified auth (e.g. `withAuth` and session/JWT verification on the server). Use decoded payload only for non-security UI (e.g. display label) and never for “can this user do X.”

---

## B) 🟠 High-Risk Issues

### 1. ~~Unprotected or weakly protected v2 Stripe routes~~ → Fixed

**Status:** All listed v2 Stripe routes require `verifyAuth` and return 401 when unauthenticated.

**Files:**  
`src/app/api/v2/stripe/create-subscription/route.ts` (see 🔴 above),  
`src/app/api/v2/stripe/cancel-subscription/route.ts`,  
`src/app/api/v2/stripe/test-payment/route.ts`,  
`src/app/api/v2/stripe/test-customer/route.ts`,  
`src/app/api/v2/stripe/validate-config/route.ts`,  
`src/app/api/v2/stripe/test-webhook/route.ts`.

**Issue:** Several v2 Stripe endpoints appear to lack auth or to rely on feature flags only. Even “test” endpoints can create customers, payments, or subscriptions if left open.

**Required fix:** Audit every v2 Stripe route: require authentication and appropriate roles; restrict test-* routes to non-production or to authenticated admin only.

---

### 2. ~~JSON.parse without try/catch (crash / white screen)~~ → Fixed

**Was:** support, staff, provider, and other pages parsed localStorage user without try/catch.

**Now:** support, staff, provider, provider/settings, super-admin/clinics/new, providers, admin/settings/stripe, and tickets layout (where applicable) wrap `JSON.parse(localStorage...)` in try/catch with clear/redirect or safe fallback.

---

### 3. Inconsistent API error handling

**Issue:** Only a subset of API routes use `handleApiError` from `@/domains/shared/errors`. Many routes use ad-hoc `NextResponse.json({ error: ... }, { status: 500 })` or only `logger.error` without a consistent response shape.

**Evidence:** `handleApiError` appears in ~50 route files; the codebase has 460+ API route files. Many routes (e.g. v2 Stripe, several webhooks, cron) do not use the shared handler.

**Risk:** Inconsistent error payloads and status codes for clients and monitoring; harder to distinguish expected vs unexpected errors.

**Required fix:** Standardize on `handleApiError` (or equivalent) for all API handlers and document the convention (as in `docs/API_ERROR_HANDLING_CONVENTION.md`).

---

### 4. Webhook JSON.parse and rawBody handling — partial fix

**Status:** Stripe (main + OT) and Lifefile (inbound + data-push) webhooks now handle parse failure safely (400 + no throw). Other webhooks in the list should be audited similarly.

**Files:**  
`src/app/api/webhooks/overtime-intake/route.ts`, `src/app/api/webhooks/wellmedr-intake/route.ts`, `src/app/api/webhooks/weightlossintake/route.ts`, `src/app/api/webhooks/lifefile-data-push/route.ts`, `src/app/api/webhooks/heyflow-intake-v2/route.ts`, `src/app/api/v2/twilio/chat/webhook/route.ts`, and others.

**Issue:** Several webhooks use `JSON.parse(text)` or `JSON.parse(rawBody)` without try/catch. Invalid payloads can throw and return 500 to the sender, triggering retries and possible duplicate processing or blacklisting.

**Required fix:** Wrap body parsing in try/catch; on parse failure return 400 with a clear body and do not retry the same payload indefinitely.

---

### 5. Multi-step flows not wrapped in transactions

**Issue:** Platform rules require multi-record operations to run in `prisma.$transaction`. Many flows use transactions (e.g. orders, tickets, billing, prescriptions), but some multi-step writes may still be outside a single transaction.

**Evidence:** Transactions are used in ~40+ places (orders, tickets, invoices, refunds, patient merge, etc.). Not every create/update chain was audited; order creation and prescription flows use the order service which uses transactions.

**Risk:** Partial writes on failure (e.g. order created but RX not, or invoice created but payment record not) can leave inconsistent state and require manual correction.

**Required fix:** Audit all “create order + RX + invoice” and similar flows; ensure every such path runs in a single `$transaction` (with external API calls after commit, per rules).

---

## C) 🟡 Medium-Risk Issues

### 1. Error boundary coverage

**Evidence:** Only six `error.tsx` files: root `src/app/error.tsx`, `admin/error.tsx`, `provider/error.tsx`, `providers/[id]/error.tsx`, `patients/[id]/error.tsx`, `patient-portal/error.tsx`. Many segments (e.g. orders, intakes, settings, affiliate, staff, support) have no segment-level error boundary.

**Risk:** Uncaught errors in a segment without a boundary can bubble to the root or cause full-app failure instead of a contained error UI.

**Recommendation:** Add `error.tsx` (and optionally `global-error.tsx`) for critical segments (e.g. orders, patient-portal, settings, pay).

---

### 2. TypeScript: `any` and `@ts-ignore`

**Evidence:** Grep shows many uses of `as any` and `@ts-ignore` across `src` (e.g. in API routes, services, components). Examples: `src/lib/intake-forms/service.ts` (tx: any), `src/app/api/users/route.ts` (tx: any), `src/app/api/monitoring/ready/route.ts` (@ts-ignore), and others.

**Risk:** Type safety and refactor safety are reduced; runtime shape mismatches can slip through.

**Recommendation:** Replace with proper types (e.g. `Prisma.TransactionClient`) and fix underlying types instead of suppressing.

---

### 3. Build skips type-check

**Evidence:** Next.js build output includes: “Skipping validation of types.” So production builds do not run full `tsc --noEmit`.

**Risk:** Type errors can exist in code that still builds, and only appear in IDE or when running `npm run type-check` (which timed out in this audit).

**Recommendation:** Enable type checking in the build (e.g. run `tsc --noEmit` before `next build` in CI and in `vercel-build`) and fix or fix any type errors; consider splitting type-check into a separate CI job with a longer timeout.

---

### 4. Ready endpoint uses `any` and optional Redis check

**File:** `src/app/api/monitoring/ready/route.ts`

**Issue:** Uses `(check: any)` and `(overallStatus as any)`; Redis check returns “operational” when `REDIS_URL` is not set without actually testing Redis. If Redis is required in production, readiness could be falsely reported.

**Recommendation:** Type the check result properly; if Redis is required, only report “operational” when Redis is configured and reachable.

---

### 5. Health check exposes patient count

**File:** `src/app/api/health/route.ts`

**Issue:** Full health check includes `patientCount` from `prisma.patient.count()` in the response. When combined with auth, this could be considered sensitive (e.g. scale of PHI).

**Recommendation:** Either remove counts from the health response or restrict full health to internal monitoring and return only generic “ok” for external probes.

---

## D) 🟢 Low-Risk / Cosmetic

- **Multiple lockfiles:** Next.js warns about workspace root and multiple lockfiles; clarify root or remove unused lockfile to silence the warning.
- **CSP:** `unsafe-inline` for scripts is still used for Next.js hydration; consider moving toward nonce-based CSP when feasible.
- **Stripe API version:** Code uses `apiVersion: '2026-01-28.clover'` in health check; ensure this matches the version used by the main Stripe client and is supported.
- **V2 create-subscription:** Commented-out code for saving subscription to DB and `stripeCustomerId` on patient; either implement or remove to avoid confusion.

---

## E) ✅ What Is Solid and Enterprise-Grade

1. **Auth layer:** `withAuth`, `withClinicalAuth`, `withAdminAuth`, `withAuthParams` from `@/lib/auth/middleware.ts` are used consistently across a large number of routes (~230+ route files). Session validation, JWT verification, and role checks are centralized.

2. **Multi-tenant isolation:** Patient and document routes enforce `patient.clinicId === user.clinicId` (and super_admin bypass) in multiple places (e.g. patients/[id]/documents, patients/[id]/bloodwork). Clinic context is set and used in queries.

3. **Stripe webhook:** Main `src/app/api/stripe/webhook/route.ts` verifies signature, avoids returning 500 on processing failure (queues to DLQ), and documents critical-path behavior. Idempotency and DB-first patterns are used in payment service and invoice creation.

4. **Transactions:** Critical paths use `prisma.$transaction` (e.g. orders, tickets, invoices, refunds, patient merge, affiliate payouts, bloodwork, shipment schedule). Transaction usage is widespread and aligned with documented rules.

5. **Health and readiness:** `/api/health` (DB + optional full checks) and `/api/monitoring/ready` (DB, Lifefile, env) exist. Basic health is public; full health is gated (auth in non-dev). Instrumentation runs schema validation at startup in production.

6. **Security headers:** `middleware.ts` sets CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and cache control for sensitive pages.

7. **PHI encryption:** `decryptPatientPHI` / encryption utilities and audit logging (e.g. DOCUMENT_VIEW) are used in document and patient APIs. HIPAA audit module exists.

8. **Idempotency:** Payment intents use idempotency keys (`paymentService.ts`); invoice creation supports idempotency key; bloodwork upload and subscription cancel are explicitly idempotent where noted.

9. **Error handler and docs:** `handleApiError` and domain errors (`NotFoundError`, `ValidationError`, etc.) are implemented and documented in `docs/API_ERROR_HANDLING_CONVENTION.md`. Routes that use them return a consistent error shape.

10. **Build:** Production build completes successfully (Next.js 16, Prisma generate, 556 static pages). No build failures observed.

11. **Tests:** Test structure includes unit, integration, security, e2e (Playwright), and characterization tests (auth, multi-tenant, orders, providers). Coverage and CI were not fully exercised in this audit.

12. **Secrets:** No `NEXT_PUBLIC_*` usage for secrets; Stripe publishable keys and similar are appropriately public. JWT and API keys are server-side.

---

## F) 📋 Stability & Functional Coverage Scorecard

| Area              | Score (0–10) | Justification |
|-------------------|--------------|----------------|
| **Functionality**  | 7            | Core flows (auth, orders, patients, payments, webhooks) are implemented and wired. Gaps: unauthenticated v2 Stripe subscription creation, inconsistent error handling, and some webhook parsing robustness. |
| **Stability**     | 6            | Transactions and auth are used in critical paths; build passes. Unprotected JSON.parse in frontend and webhooks can cause crashes or 500s; not all routes use centralized error handling. |
| **Safety**        | 5            | One critical auth bypass (create-subscription), PHI in logs, and client-side JWT decoding for authorization patterns reduce safety. Multi-tenant and server-side auth are strong where applied. |
| **Performance**    | 7            | DB health and pool checks exist; serverless and connection handling are considered. No obvious N+1 or heavy hot-path issues identified; large datasets (labs, history) would need targeted review. |
| **Maintainability** | 7          | Domain structure, shared errors, and API conventions are documented. Widespread `any`/`@ts-ignore` and mixed error handling increase maintenance cost. |

---

## G) 🧪 Platform Verification Checklist

**Note:** On a large codebase, `type-check` and `lint` can take several minutes; `build` may take 5–10+ minutes. Run these in CI with adequate timeouts (e.g. type-check 5 min, lint 5 min, build 15 min).

### Commands to run

```bash
# 1. Install and generate
npm ci
npm run postinstall   # or: rm -rf node_modules/.prisma && prisma generate

# 2. Type-check (allow long timeout; may be slow)
npm run type-check

# 3. Lint
npm run lint
# or strict: npm run lint:strict

# 4. Build (includes Prisma generate)
npm run build

# 5. Unit tests
npm run test:unit

# 6. Integration tests (if env configured)
npm run test:integration

# 7. Security tests
npm run test:security

# 8. E2E (Playwright; requires running app)
npm run test:e2e
```

### Health and readiness (after deploy or local start)

```bash
# Basic health (public)
curl -s https://<host>/api/health | jq .

# Ready (for k8s/load balancer)
curl -s https://<host>/api/monitoring/ready | jq .

# Full health (requires auth in production)
curl -s -H "Authorization: Bearer <token>" "https://<host>/api/health?full=true" | jq .
```

### Manual sanity checks

1. **Auth:** Log in as admin, provider, patient; confirm redirect and role-specific nav.
2. **Patient list:** As provider/admin, open patients list; confirm only own clinic’s patients (or all for super_admin).
3. **Documents:** Open a patient’s Documents tab; confirm no 500 (see `docs/FIX_DOCUMENTS_500.md` if issues).
4. **Order creation:** Create an order for a patient; confirm order and related records (e.g. RX) created atomically.
5. **Stripe:** In test mode, complete a payment; confirm webhook is received and payment recorded; confirm no 500 returned to Stripe on failure (DLQ path).
6. **Logout:** Use logout; confirm full redirect to login (e.g. `window.location.href`) per security rules.

---

## H) 🚦 Final Platform Verdict

### Original verdict: **NOT SAFE FOR PRODUCTION**

The report initially concluded the platform was not safe due to: (1) unauthenticated create-subscription, (2) PHI in logs, (3) client-side JWT decode for UI/role, (4) unhandled JSON.parse in several pages.

---

### Post-remediation verdict: **LIMITED / GUARDED ROLLOUT**

After the fixes documented in “Remediation progress” above, the following have been addressed:

- **Auth:** create-subscription and all v2 Stripe mutation/test routes require `verifyAuth`; create-subscription enforces patient/clinic authorization.
- **PHI in logs:** Logger calls across API routes, db middleware, and websocket now use `userId` (and related IDs) instead of email; audit `updatedBy` in API route payloads now stores `user.id`.
- **Client-side JWT:** Role/identity for UI now comes from `getStoredUser()` (stored at login); no authorization from decoded JWT. Only `parseTokenExpiry` in api/fetch still decodes for refresh timing (documented).
- **JSON.parse safety:** support, staff, provider, providers, super-admin clinics/new, admin/settings/stripe, and others wrap `JSON.parse(localStorage...)` in try/catch; Stripe and Lifefile webhooks handle parse failure with 400 and safe DLQ storage.

**Recommendation:** Proceed with a **limited or guarded rollout** (e.g. canary, feature flags, or restricted user set) while you:

- Run the verification checklist in Section G (build, tests, health, manual sanity).
- Optionally add error boundaries for more segments (e.g. orders, pay) and standardize `handleApiError` on remaining API routes.
- Keep runbooks and monitoring in place for payments, webhooks, and DB.

**Path to “ENTERPRISE PRODUCTION READY”:**

- Apply consistent `handleApiError` (or equivalent) across all API routes; add error boundaries for critical segments; reduce `any`/`@ts-ignore` and enable type-check in CI/build; run and maintain test suites (unit, integration, e2e) with clear coverage targets; document and verify runbooks for payments, webhooks, and DB failures. Consider migrating audit tables from `actorEmail` to `actorId` (FK to User) if you want to avoid storing email in DB.

---

*End of report.*
