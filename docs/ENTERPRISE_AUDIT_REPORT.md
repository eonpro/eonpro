# Enterprise Platform Audit Report

**Date:** February 9, 2026  
**Classification:** Principal Architect / Security Engineer / SRE  
**Scope:** Full codebase — frontend, backend APIs, database, auth, data pipelines, observability  
**Assumptions:** Real users, real money, real liability, regulated data (PHI/PII)

---

## A) 🔴 Critical Production Blockers

### 1. Build Ignores TypeScript Errors
- **Location:** `next.config.js` lines 15–17  
- **Issue:** `typescript: { ignoreBuildErrors: true }` allows the production build to succeed with type errors. Type safety is not enforced at deploy time.  
- **Evidence:** Scratchpad notes CI should run `npm run type-check` separately; build can ship broken types.  
- **Fix:** Run `npm run type-check` in CI and fail the pipeline on type errors. Remove `ignoreBuildErrors` once type backlog is cleared (or keep CI-only gate with documented rationale).

### 2. Webhook Accepts All Requests When Secret Not Set (Dev-Only Guard)
- **Location:** `src/app/api/webhooks/heyflow-intake-v2/route.ts` lines 26–37  
- **Issue:** If `MEDLINK_WEBHOOK_SECRET` / `HEYFLOW_WEBHOOK_SECRET` is unset and `NODE_ENV !== 'production'`, the handler returns `{ isValid: true, authMethod: 'no-secret-dev' }` and accepts all requests. Misconfiguration (e.g. staging with `NODE_ENV=development`) or missing env in production could open intake ingestion to unauthenticated callers.  
- **Fix:** In production, always reject when secret is unset (already done). Add a startup check or readiness check that fails if webhook secret is required but unset in production. Document that staging must set `NODE_ENV=production` or set the secret.

### 3. Eonpro Intake Webhook: No Secret → Accept Request
- **Location:** `src/app/api/webhooks/eonpro-intake/route.ts` lines 99–100  
- **Issue:** When no webhook secret is configured, code logs a warning and accepts the request: `logger.warn('... No webhook secret configured - accepting request')`.  
- **Fix:** In production, reject with 401 when secret is not configured; do not accept by default.

### 4. Unsafe SQL Pattern (Known HIGH)
- **Location:** `src/services/affiliate/affiliateCommissionService.ts` (e.g. ~1040–1051)  
- **Issue:** Nested `$queryRaw` template literals for conditional date filters may break parameterization (documented in `SECURITY_VULNERABILITY_AUDIT.md`).  
- **Fix:** Use Prisma query builder with `where: { occurredAt: { gte, lte } }` or single `$queryRaw` with bound parameters; remove dynamic SQL composition.

### 5. Session Validation Bypass for Tokens Without sessionId
- **Location:** `src/lib/auth/middleware.ts` (session validation block)  
- **Issue:** When `user.sessionId` is undefined, session validation is skipped entirely. Tokens without sessionId bypass idle/absolute timeout checks (see `AUTH_MIDDLEWARE_AUDIT_REPORT.md`).  
- **Fix:** Require sessionId for production tokens, or enforce at least token expiry when sessionId is missing and log a security warning.

---

## B) 🟠 High-Risk Issues

### 1. Unprotected JSON.parse (Crash / DoS)
- **Locations:** Many files still use raw `JSON.parse()` without try/catch or safe wrapper. Examples:  
  - `src/app/api/stripe/webhook/route.ts` line 657: `payload = JSON.parse(rawBody);`  
  - `src/app/api/webhooks/lifefile/inbound/[clinicSlug]/route.ts` line 724  
  - `src/app/api/webhooks/lifefile-data-push/route.ts` line 365  
  - `src/lib/cache/redis.ts` line 87; `src/lib/queue/deadLetterQueue.ts` multiple  
- **Risk:** Malformed or malicious payloads can throw and return 500 or crash the handler; repeated requests can cause DoS.  
- **Fix:** Use `safeParseJsonString()` from `src/lib/utils/safe-json.ts` (or equivalent) for all untrusted input; wrap in try/catch and return 400 with a safe message.

### 2. Inconsistent API Error Handling
- **Issue:** Many API routes do not use `handleApiError` from `@/domains/shared/errors`. Responses vary (plain `{ error: string }`, different status codes, no `code`/`requestId`).  
- **Evidence:** `handleApiError` appears in ~50+ route files; many others use ad-hoc `logger.error` + `NextResponse.json({ error: '...' }, { status: 500 })`.  
- **Risk:** Inconsistent client handling, poor observability, and possible information leakage in non-production.  
- **Fix:** Standardize on `handleApiError` (or equivalent) and a single error shape; add a lint/convention rule.

### 3. Transaction Typing with `any`
- **Locations:** Several `prisma.$transaction(async (tx: any) => { ... })` usages:  
  - `src/app/api/users/route.ts` lines 230, 325, 357  
  - `src/app/api/users/create/route.ts` line 123  
  - `src/app/api/patients/protected/route.ts` line 75  
  - `src/lib/auth/registration.ts` lines 342, 561  
  - `src/lib/intake-forms/service.ts` lines 60, 232, 503  
  - `src/app/api/super-admin/clinics/[id]/users/[userId]/route.ts` line 339  
- **Risk:** Weaker type safety inside transactions; possible misuse of `tx` (e.g. mixing with global `prisma`).  
- **Fix:** Use `tx: Prisma.TransactionClient` (or `TransactionClient` from Prisma) everywhere; align with patterns in `src/domains/provider/repositories/provider.repository.ts` and `src/domains/patient/repositories/patient.repository.ts`.

### 4. Readiness vs Env Validation Mismatch
- **Location:** `src/app/api/monitoring/ready/route.ts` lines 108–118  
- **Issue:** Readiness requires `LIFEFILE_USERNAME`, `LIFEFILE_PASSWORD` (among others), but `src/lib/config/env.ts` does not require these. App can start (env valid) while readiness fails, or vice versa.  
- **Risk:** Orchestrators may kill pods or mark deployment unhealthy based on ready check while app env is considered valid, causing confusion and rollout issues.  
- **Fix:** Align required vars between env schema and readiness: either add optional Lifefile vars to env schema and have ready use env, or document that ready is “full operational” and use a minimal ready (e.g. DB only) for k8s.

### 5. Debug / Test Endpoints in Production Surface
- **Locations:**  
  - `src/app/api/webhooks/heyflow-test/route.ts`: “Debug endpoint to test MedLink webhook without authentication”  
  - `src/app/api/test/send-email/route.ts`: guarded by `NODE_ENV === 'production'` but still present  
  - `src/app/api/v2/stripe/test-webhook/route.ts`, `test-customer/route.ts`, `test-payment/route.ts`  
- **Risk:** If any are ever invoked in production (wrong base URL, proxy), they can leak info or send test data.  
- **Fix:** Remove or strictly guard test/debug routes (e.g. feature flag + role); ensure they are not exposed on production URLs.

### 6. Idempotency Gaps on Critical Mutations
- **Issue:** Idempotency is implemented for Stripe payment intents and invoice creation (`paymentService.ts`, `stripe/invoices/route.ts`). Many other critical mutations (e.g. order creation, refill approval, patient creation via webhooks) do not use idempotency keys or duplicate detection.  
- **Risk:** Retries or duplicate webhooks can create duplicate orders, refills, or patient records.  
- **Fix:** Introduce idempotency keys (or unique event IDs) for order creation, refill actions, and key webhook handlers; persist and short-circuit on replay.

---

## C) 🟡 Medium-Risk Issues

### 1. Console Logging in Source
- **Evidence:** ~130+ files under `src/` contain `console.log` / `console.warn` / `console.error` / `console.info` / `console.debug`.  
- **Mitigation:** `next.config.js` uses `removeConsole` in production with `exclude: ['error', 'warn']`, so only error/warn reach production. Still, structured logging (logger + context) is preferred for traceability and correlation.  
- **Fix:** Replace console with `logger` and add request/correlation IDs where applicable; restrict console to dev-only paths.

### 2. Widespread `any` and `@ts-ignore`
- **Evidence:** Numerous `: any`, `as any`, and `@ts-ignore` usages across API routes, services, and lib (e.g. `src/app/api/health/route.ts` `error: any`, `src/app/api/users/[id]/route.ts` exports `as any`, `src/app/api/monitoring/ready/route.ts` `@ts-ignore`).  
- **Risk:** Type safety and refactor safety reduced; runtime bugs possible at boundaries.  
- **Fix:** Phase out `any` and `@ts-ignore` in critical paths (lib → services → API); track backlog; enforce “no new any” in PRs for sensitive modules.

### 3. HIPAA Audit Coverage Gaps
- **Evidence:** `hipaaAudit` / `logPHI` / hipaa-audit used in a limited set of routes (bloodwork, documents, patient service, soap-notes, prescriptions, etc.). Not every PHI read/write path is audited.  
- **Risk:** Incomplete audit trail for compliance and incident reconstruction.  
- **Fix:** Audit all PHI access (read/update/create/delete) and ensure each path logs via `hipaaAudit` with consistent action/resource types.

### 4. API Routes Without Centralized Auth Wrapper
- **Evidence:** Some routes use manual `verifyAuth(request)` + role check instead of `withAuth`/`withAdminAuth` (e.g. `src/app/api/admin/clinics/[id]/route.ts`). Behavior is correct but pattern is inconsistent.  
- **Risk:** New routes may forget auth or use inconsistent checks.  
- **Fix:** Prefer `withAuth`/`withAdminAuth`/`withClinicalAuth` everywhere; refactor manual verifyAuth routes to use the same wrappers.

### 5. Patient Portal Branding GET Without Auth
- **Location:** `src/app/api/patient-portal/branding/route.ts` — GET uses `relaxedRateLimiter(getBrandingHandler)` only.  
- **Context:** Likely intentional (public branding for login page).  
- **Risk:** If handler ever returns tenant-specific or sensitive data, it would be exposed.  
- **Fix:** Confirm that response is strictly public branding (colors, logo, name); add a short comment in code and, if needed, an explicit allowlist of returned fields.

### 6. No OpenAPI / Contract Documentation
- **Issue:** No single source of truth for API contracts (OpenAPI/Swagger). Docs exist in `docs/API_REFERENCE.md` and inline; no machine-readable schema for critical or v2 APIs.  
- **Risk:** Contract drift, harder integration testing and client codegen.  
- **Fix:** Introduce OpenAPI for v2 and critical webhooks; generate or maintain from code; use in CI for contract tests.

---

## D) 🟢 Low-Risk / Cosmetic Issues

- **CSP:** `script-src` includes `'unsafe-inline'` for Next.js; documented as TODO for nonce-based CSP.  
- **Logger:** In production, `logger.info` only adds Sentry breadcrumbs; no server-side log aggregation for info level unless Sentry is configured. Consider structured logs to stdout for a logging backend.  
- **Health check:** Full health runs many checks (DB, pool, Stripe, Twilio, Redis, OpenAI, Lifefile, Auth, API routes, encryption, migrations); response time can be high. Consider a lightweight “liveness” (e.g. DB only) and keep “full” for control center.  
- **Ready route:** Uses `any` in a few places and `@ts-ignore`; low impact but should be cleaned for consistency.

---

## E) ✅ Enterprise-Grade Strengths

1. **Auth and multi-tenant design**  
   - `withAuth`, `withAdminAuth`, `withClinicalAuth`, `withProviderAuth` used consistently across most API routes.  
   - Clinic context via AsyncLocalStorage; clinic-isolated models enumerated in `src/lib/db.ts`; role and clinic checks in handlers.

2. **Security headers and middleware**  
   - Strong CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy in `middleware.ts`.  
   - CORS restricted to allowed origins; request ID (`x-request-id`) added for tracing.

3. **Transactions**  
   - Critical multi-step operations use `prisma.$transaction` (orders, payments, tickets, patients, providers, refills, invoices, etc.).  
   - Some use `Prisma.TransactionClient` correctly; pattern is established.

4. **Centralized error handling**  
   - `handleApiError` and AppError hierarchy with Prisma/Zod mapping and 503 for schema/connection errors.  
   - Production hides internal messages for generic errors.

5. **Startup and schema validation**  
   - `instrumentation.ts` runs schema validation in production and fails fast.  
   - `src/lib/database/schema-validator.ts` defines critical tables/columns; `ALLOW_SCHEMA_ERRORS` can block startup.

6. **Env validation**  
   - `src/lib/config/env.ts` uses Zod; required vars (e.g. `DATABASE_URL`, `JWT_SECRET` length) validated at first import; production throws on invalid config.

7. **Webhook security**  
   - Stripe webhooks use `stripe.webhooks.constructEvent`.  
   - Lifefile uses signature verification; many intake webhooks check `x-webhook-secret` or equivalent; heyflow-intake-v2 rejects in production when secret is unset.

8. **PHI and compliance**  
   - PHI encryption utilities and repository patterns documented; HIPAA audit used on key PHI paths; logging rules (no PHI in logs) and cursor rules align with HIPAA.

9. **Health and readiness**  
   - `/api/health` (basic public, full for super_admin); `/api/monitoring/ready` for dependencies; DB, pool, migrations, and critical integrations covered.

10. **TypeScript and tooling**  
    - Strict mode, strictNullChecks, noImplicitAny; Zod used widely for request validation; lint-staged and validate scripts (type-check, lint, test).

---

## F) 📊 Enterprise Readiness Scorecard

| Dimension        | Score | Justification |
|-----------------|-------|----------------|
| **Correctness**  | 6/10  | Transactions used widely; idempotency only on payments/invoices; some webhooks and mutations can duplicate on retry; unsafe SQL pattern in one service. |
| **Safety**      | 6/10  | Auth and clinic isolation strong; session bypass and webhook “accept when no secret” (dev) are risks; JSON.parse and error handling inconsistencies. |
| **Stability**    | 6/10  | Schema and env validation at startup; safe JSON used in patient portal but not everywhere; many raw JSON.parse and console usage; type errors not blocking build. |
| **Security**    | 7/10  | Good headers, CORS, auth wrappers, webhook verification; one SQL risk; test endpoints and secret configuration need hardening. |
| **Maintainability** | 6/10 | handleApiError and domains exist but not universal; any/ts-ignore and mixed auth patterns; no OpenAPI. |
| **Scalability** | 7/10  | Connection pooling and serverless-aware DB config; AsyncLocalStorage for context; health/ready in place; no major hot-path or unbounded-work issues identified. |

**Overall (average):** ~6.3/10 — **Growth-stage with clear path to enterprise.**

---

## G) 🚦 Maturity Classification

**Classification: Growth-Stage**

- **Not Prototype:** Multi-tenant, auth, PHI, payments, and integrations are production-oriented.  
- **Not yet Enterprise-Grade:** Type-check not enforced at build, idempotency and audit coverage incomplete, some critical and high-risk items (webhook secrets, SQL, session bypass, JSON.parse) must be resolved.  
- **Growth-Stage:** Suitable for real users and revenue with active monitoring and a focused remediation plan; not yet “set and forget” for high liability or strict compliance without the P0/P1 fixes.

---

## H) 📋 Prioritized Remediation Plan

### P0 (Before Next Production Release)
| Item | Effort | Deployment risk |
|------|--------|------------------|
| Fix unsafe SQL in `affiliateCommissionService` (use Prisma or parameterized raw) | S | Low |
| Ensure Stripe/Lifefile/critical webhooks never accept when secret required but unset (incl. eonpro-intake) | S | Low |
| Add CI gate: `npm run type-check` must pass (keep ignoreBuildErrors if needed, document) | S | None |

### P1 (Within 4–6 Weeks)
| Item | Effort | Deployment risk |
|------|--------|------------------|
| Replace raw `JSON.parse` with safe helper in all webhook and API handlers | M | Low |
| Standardize API error handling (handleApiError + response shape) on all routes | M | Low |
| Fix session validation: require sessionId or enforce expiry + alert for tokens without sessionId | S–M | Low (test logout/token flows) |
| Add idempotency or duplicate detection to order creation and key webhook handlers | M | Medium (behavior change) |

### P2 (Next Quarter)
| Item | Effort | Deployment risk |
|------|--------|------------------|
| Remove or strictly guard test/debug API routes in production | S | Low |
| Align ready check required vars with env schema (or document and minimal ready) | S | Low |
| Replace `tx: any` with `Prisma.TransactionClient` in all transactions | S | None |
| Extend HIPAA audit to every PHI read/write path | M | Low |
| Reduce `any`/`@ts-ignore` in lib and API routes; add “no new any” policy | L | None |
| OpenAPI (or equivalent) for v2 and critical webhooks | M | None |

---

## I) 🧪 Verification Checklist

### Commands to Run
```bash
# Type safety (must pass in CI)
npm run type-check

# Lint
npm run lint
# or strict
npm run lint:strict

# Unit + integration tests
npm run test:coverage

# Security audit
npm run security:audit

# Full validate (type-check + lint + test)
npm run validate

# Build (currently allows type errors; confirm CI runs type-check separately)
npm run build

# Optional: secrets validation
npm run validate:secrets
```

### Manual Sanity Tests
- [ ] Login (provider/admin/patient) and one authenticated API call per role.  
- [ ] Patient list and patient detail (one clinic); switch clinic if multi-clinic enabled.  
- [ ] Documents tab load and one document view.  
- [ ] Create order or refill flow (if applicable).  
- [ ] Stripe payment or invoice creation (test mode).  
- [ ] Logout and confirm redirect and token invalidation.  
- [ ] Webhook: send one test event to a critical endpoint (e.g. intake) with valid secret; confirm 200 and no duplicate record on retry (when idempotency is implemented).

### Release Gating Criteria
- [ ] CI: `npm run type-check`, `npm run lint`, `npm run test:coverage` pass.  
- [ ] No P0 items open for the release branch.  
- [ ] Schema validation and migrations verified (e.g. `npm run db:migrate:status` / deploy pipeline).  
- [ ] Health and ready endpoints return expected status in target environment.  
- [ ] At least one full sanity run (auth, patient list, documents, order/payment, logout) on staging or production-like env.

---

*End of Enterprise Audit Report. For follow-up, see scratchpad “Remaining” and this doc’s Remediation Plan.*
