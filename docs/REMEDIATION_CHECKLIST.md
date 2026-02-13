# Enterprise Audit Remediation Checklist

**Source:** Enterprise Platform Audit Report (Feb 9, 2026)  
**Purpose:** Map every audit item to files, risk type, proposed fix, and verification.  
**Canonical patterns:** Reuse existing good patterns; minimal, reviewable diffs.

---

## Phase 0 — Canonical “Good Patterns” (Reuse These)

| Pattern | Location | Use for |
|--------|----------|--------|
| **Safe JSON parse** | `src/lib/utils/safe-json.ts` — `safeParseJsonString<T>(text)` | Any untrusted string (webhook body, localStorage, cache). Returns `T \| null`; no throw. |
| **API error handling** | `src/domains/shared/errors/handler.ts` — `handleApiError(error, options)` | All API route catch blocks. Returns NextResponse with `error`, `code`, `statusCode`, `timestamp`; maps Zod/Prisma to AppErrors. |
| **Transaction client type** | `Prisma.TransactionClient` from `@prisma/client` | Type for `tx` in `prisma.$transaction(async (tx) => ...)`. Example: `src/domains/provider/repositories/provider.repository.ts`, `src/domains/patient/repositories/patient.repository.ts`. |
| **Auth wrappers** | `src/lib/auth/middleware.ts` — `withAuth`, `withAdminAuth`, `withClinicalAuth` | All protected API routes. Prefer over manual `verifyAuth()` + role check. |
| **Webhook secret check** | Reject with 401 when secret required but unset (production and optionally all envs). | Intake/payment webhooks. Never “accept by default” when no secret. |
| **Parameterized raw SQL** | `Prisma.sql` + `Prisma.join` for dynamic fragments in `$queryRaw` | Dynamic WHERE clauses; avoid nested `$queryRaw` template literals. |

---

## A) Critical Production Blockers → Remediation Map

| # | Audit item | File(s) | Risk type | Proposed fix | Verification |
|---|------------|---------|-----------|--------------|--------------|
| A1 | Build ignores TypeScript errors | `next.config.js`; `.github/workflows/ci.yml` | Type safety / deploy | Keep `ignoreBuildErrors: true` for build (document in next.config). **CI:** Remove `continue-on-error: true` from type-check step so pipeline fails on type errors. | Run `npm run type-check`; CI must fail when type errors exist. |
| A2 | Webhook accept when secret unset (heyflow-intake-v2) | `src/app/api/webhooks/heyflow-intake-v2/route.ts` | Auth / injection | When `!configuredSecret`, always return `{ isValid: false }` (reject). Remove “accept in dev” path. | In dev with no secret, POST returns 401. With secret, 200 when valid. |
| A3 | Eonpro intake: no secret → accept | `src/app/api/webhooks/eonpro-intake/route.ts` | Auth / injection | When `!configuredSecret` and `NODE_ENV === 'production'`, return 401. In dev, keep accept with warning (optional: reject always). | Production: no secret → 401. Dev: document behavior. |
| A4 | Unsafe SQL (nested $queryRaw) | `src/services/affiliate/affiliateCommissionService.ts` | SQL injection | Replace daily breakdown query with `Prisma.sql` + `Prisma.join` for dynamic WHERE; single `$queryRaw` with bound params only. | Unit/integration test for getAffiliateCommissionStats; no raw string concat. |
| A5 | Session validation bypass (no sessionId) | `src/lib/auth/middleware.ts` | Session timeout bypass | In production, when `!user.sessionId` and `!options.skipSessionValidation`, return 401 (invalid session). In dev, keep allow + warn. | Login → use token with sessionId; revoke session → 401. Token without sessionId in prod → 401. |

---

## B) High-Risk → Remediation Map (P1)

| # | Audit item | File(s) | Risk type | Proposed fix | Verification |
|---|------------|---------|-----------|--------------|--------------|
| B1 | Unprotected JSON.parse | Many (webhooks, API, cache) | Crash / DoS | Replace with `safeParseJsonString()` or try/catch + 400. | No uncaught JSON.parse on untrusted input; tests. |
| B2 | Inconsistent API error handling | Many API routes | Observability / leakage | Use `handleApiError` in catch; consistent response shape. | Lint or convention; spot-check routes. |
| B3 | Transaction `tx: any` | users/route, create/route, protected/route, registration, intake-forms, super-admin | Type safety | Change to `tx: Prisma.TransactionClient`. | Type-check passes; no `any` in transaction callbacks. |
| B4 | Readiness vs env mismatch | `src/app/api/monitoring/ready/route.ts`, `src/lib/config/env.ts` | Deploy confusion | Align: minimal ready = DB only; or document ready as “full operational” and list optional vars. | Ready returns 200 when DB + required env (from env schema) present. |
| B5 | Debug/test endpoints | heyflow-test, test/send-email, v2/stripe/test-* | Info leak / test data | Guard with `NODE_ENV !== 'production'` or feature flag + role; or remove. | Production: test routes return 404 or 403. |
| B6 | Idempotency gaps | Order creation, refill approval, key webhooks | Duplicate records | Add idempotency key or event-id dedup; persist and short-circuit. | Retry same key → 200, no duplicate record. |

---

## C) Medium-Risk → Remediation Map (P2)

| # | Audit item | File(s) | Proposed fix | Verification |
|---|------------|---------|--------------|--------------|
| C1 | Console logging | ~130 files | Replace with `logger`; add context. | No console.log in critical paths (or removeConsole already strips in prod). |
| C2 | any / @ts-ignore | Many | Phase out in lib → services → API; “no new any” policy. | Type-check; track backlog. |
| C3 | HIPAA audit gaps | PHI read/write paths | Add hipaaAudit.log on every PHI access. | Audit log coverage checklist. |
| C4 | Routes without withAuth | admin/clinics/[id], etc. | Refactor to use withAuth/withAdminAuth. | All protected routes use wrapper. |
| C5 | Patient portal branding GET | patient-portal/branding/route.ts | Confirm public fields only; comment allowlist. | Review response shape. |
| C6 | No OpenAPI | — | Introduce OpenAPI for v2 + critical webhooks. | CI contract test. |

---

## D–I) Low-Risk / Scorecard / Maturity

- **D:** Cosmetic (CSP, logger backend, health latency, ready `any`).
- **E:** Strengths — leave as-is; reference in onboarding.
- **F–I:** Scorecard and maturity updated after each phase; final go/no-go after Phase 3.

---

---

## Phase 1 Implementation Status (P0 — Complete)

| P0 Item | File(s) changed | Done |
|---------|-----------------|------|
| CI type-check gate | `.github/workflows/ci.yml` | ✅ Removed `continue-on-error: true` from type-check step; next.config.js comment updated |
| Webhook eonpro-intake | `src/app/api/webhooks/eonpro-intake/route.ts` | ✅ Production: 401 when no secret; dev still accepts with warning |
| Webhook heyflow-intake-v2 | `src/app/api/webhooks/heyflow-intake-v2/route.ts` | ✅ Always reject when no secret (all envs) |
| Unsafe SQL | `src/services/affiliate/affiliateCommissionService.ts` | ✅ Replaced nested $queryRaw with Prisma.sql + Prisma.join |
| Session validation bypass | `src/lib/auth/middleware.ts` | ✅ Production: 401 when no sessionId; dev allows + warn |

*Last updated: Phase 0 + Phase 1 implementation.*
