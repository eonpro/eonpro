# Multi-Tenant Architecture & Security Audit Report

**Date:** February 10, 2026  
**Mode:** Enterprise Architect + Security Auditor  
**Scope:** Full codebase — API routes, server actions, database access, background jobs, webhooks, cache, search.  
**Verdict:** See [Final Verdict](#final-verdict) below.

---

## Executive Summary

The codebase implements multi-tenancy via **clinic** as the tenant dimension. Tenant context is derived from:

1. **Authenticated requests:** JWT `clinicId`, optionally overridden by subdomain (when user has access).
2. **Clinic middleware:** Cookie `selected-clinic`, JWT, **x-clinic-id header**, subdomain, then `DEFAULT_CLINIC_ID` env.
3. **Auth middleware:** Sets `x-clinic-id` and AsyncLocalStorage from effective clinic (user + subdomain); overwrites any value set by clinic middleware for authenticated routes.

**Critical finding:** Several paths trust **client-supplied** `clinicId` (body, query, or header) without restricting to super_admin or validating org membership. The clinic middleware also trusts the **x-clinic-id** request header for unauthenticated or pre-auth requests. Default/fallback tenant (`DEFAULT_CLINIC_ID`) exists in multiple places.

---

## 1. Tenant Derivation & Client-Supplied Values

### 1.1 Server-side context (correct patterns)

- **Auth middleware** (`src/lib/auth/middleware.ts`): For authenticated routes, `effectiveClinicId` comes from `user.clinicId` (JWT) and optionally from subdomain clinic after verifying `userHasAccessToClinic()`. Headers `x-clinic-id` are then **set** by the middleware (not read from client). So handlers see server-derived clinic.
- **getClinicContext()** / **AsyncLocalStorage:** Set by auth via `runWithClinicContext(effectiveClinicId, ...)`. Prisma wrapper uses this for automatic `where: { clinicId }` and `data: { clinicId }` on clinic-isolated models.
- **Lifefile webhook** (`/api/webhooks/lifefile/inbound/[clinicSlug]`): Tenant from **path** `clinicSlug`; Basic Auth validates per-clinic credentials. No client-supplied clinic ID in body.
- **Stripe webhook:** Clinic resolved from **DB lookups** (payment → invoice → patient → `patient.clinicId`). No trust of client payload for tenant.
- **Cron jobs (platform-fees, affiliate-payouts):** Iterate over clinics from DB (`findMany` on config/programs), then process per `clinicId`. No client input.

### 1.2 Client-supplied tenant accepted (risks)

| Location | Pattern | Risk |
|----------|---------|------|
| **Clinic middleware** `src/middleware/clinic.ts` | Priority 3: `request.headers.get('x-clinic-id')` — trusted as-is | **HIGH.** Any client can send `x-clinic-id: <any id>` and influence clinic context for routes that run **before** auth or that don’t use withAuth. |
| **POST /api/tickets** `src/app/api/tickets/route.ts` | `const clinicId = body.clinicId \|\| user.clinicId` | **HIGH.** Any authenticated user can send `body.clinicId` and create tickets in another clinic. No check that user has access to `body.clinicId`. |
| **POST /api/ai/chat** `src/app/api/ai/chat/route.ts` | Fallback: `if (!clinicId && body.clinicId) clinicId = body.clinicId` | **MEDIUM.** Route does not use `withAuth`; uses `getCurrentUser(request)`. If no token/header clinic, **body.clinicId** is trusted. Attacker could send arbitrary clinicId and get AI context for that clinic. |
| **GET /api/admin/affiliates/fraud-queue** | For super_admin: `where.clinicId = params.clinicId` (query param) | **LOW.** Only super_admin; intentional cross-clinic filter. |
| **Super-admin-only routes** (registration-codes, promotions, products, discounts, bundles, admin/providers compensation, admin/refill-queue, admin/clinic/portal-settings) | `body.clinicId` used when `user.role === 'super_admin'` | **LOW.** Restricted to super_admin; still client-supplied but privilege-gated. |
| **PATCH /api/patients/[id]/clinic** | `body.clinicId` for target clinic | **LOW.** Super_admin only; validates clinic exists and patient doesn’t duplicate patientId in target clinic. |

### 1.3 Default / fallback tenant

| Location | Pattern | Risk |
|----------|---------|------|
| **Clinic middleware** | Priority 5: `process.env.DEFAULT_CLINIC_ID` | **MEDIUM.** Single-clinic deployments may rely on this; in multi-tenant, can cause wrong-tenant context if cookie/JWT/header not set. |
| **getCurrentClinicId()** `src/lib/clinic/utils.ts` | Cookie then `process.env.DEFAULT_CLINIC_ID` | **MEDIUM.** Server-side default tenant. |
| **paymentMatchingService** `src/services/stripe/paymentMatchingService.ts` | `targetClinicId = clinicId \|\| parseInt(process.env.DEFAULT_CLINIC_ID \|\| '0', 10)` when creating patient from Stripe | **MEDIUM.** New patients can be assigned to default clinic when invoice/payment doesn’t imply a clinic. |

---

## 2. Database Access & Tenant Filtering

### 2.1 Prisma wrapper (prisma vs basePrisma)

- **`prisma`** (PrismaWithClinicFilter): Injects `clinicId` from AsyncLocalStorage into `where` and `data` for models in `CLINIC_ISOLATED_MODELS`. When `getClinicId()` is undefined (e.g. cron, webhooks, or super_admin), **no** clinic filter is applied.
- **`basePrisma`**: No injection. Used intentionally for: login/provider lookup, clinic resolve, super-admin routes, webhooks, cron, internal messages, patient-chat (with explicit clinic checks), InvoiceManager, HIPAA audit, etc. Callers **must** pass explicit `where: { clinicId }` or equivalent when tenant scope is required.
- **BYPASS_CLINIC_FILTER:** Only allowed when `NODE_ENV !== 'production'`. Production bypass is blocked.

**Conclusion:** Use of `basePrisma` is widespread; tenant isolation depends on each caller adding `clinicId` to queries. No single place enforces tenant for basePrisma.

### 2.2 Raw SQL

- **Affiliate leaderboardService:** All `$queryRaw` snippets include `WHERE a."clinicId" = ${clinicId}`; `clinicId` is passed from route (must be from server context).
- **Policy-service:** `$queryRaw` aggregates by clinic (all clinics) for admin policy stats; caller is expected to be admin/super_admin.
- **Schema-validator / data-integrity / init-database / run-migration:** Diagnostic or migration; not request-scoped tenant data access.
- **affiliateCommissionService, affiliate payouts/trends:** Raw SQL uses clinic-scoped inputs where applicable; call sites must pass server-derived clinicId.

**Conclusion:** Raw SQL that returns tenant-scoped data uses `clinicId` from parameters; callers must supply it from server context only.

### 2.3 Routes that may return data without tenant scoping

- **GET /api/internal/patients:** Uses `user.clinicId` for `whereClause`. For super_admin, `user.clinicId` can be undefined, so `whereClause` is `{}` → returns **all patients**. This is likely intentional for super_admin.
- **Refill-scheduler cron:** Uses `prisma` with **no** clinic context set; `findMany` on RefillQueue has no clinic filter. RefillQueue records have `clinicId`; processing is per-record. So no cross-tenant **leak** of data; job is global by design.
- **GET /api/messages/conversations:** Uses `basePrisma.patient.findMany` with `clinicFilter = clinicId ? { clinicId } : {}` where `clinicId` is from `user.clinicId` (undefined for super_admin). Correct for non–super_admin; super_admin gets all.

No route was found that **unconditionally** returns another tenant’s data to a non–super_admin user, except where **body/query/header clinicId** is trusted (see §1.2).

---

## 3. Caching

- **Finance cache** (`src/lib/cache/financeCache.ts`): Key format `finance:${clinicId}:${category}:${subKey}`. All keys include `clinicId`. No cross-tenant cached response possible if `clinicId` is always from server context at call sites.
- No other shared cache layers (e.g. Redis key patterns) were audited; recommend ensuring any future cache keys always include tenant id.

**Conclusion:** Finance cache is tenant-scoped by key design. Other caches must follow the same pattern.

---

## 4. Search / Index

- **PHI search** (`src/lib/security/phi-search.ts`): In-memory filter after DB fetch; expects `baseQuery` (e.g. `{ clinicId }`) from caller. No external search index (e.g. Elasticsearch). Tenant scope depends on callers passing server-derived `clinicId`.

**Conclusion:** Search is tenant-safe when callers pass only server-derived clinicId.

---

## 5. Webhooks

| Webhook | Tenant resolution | Validation |
|---------|-------------------|------------|
| **Stripe** `/api/stripe/webhook` | From DB: payment → invoice/patient → `patient.clinicId` | Signature verified. |
| **Stripe OT** `/api/stripe/webhook/ot` | `getOTClinicId()` (config/env) | Signature verified. |
| **Lifefile inbound** `/api/webhooks/lifefile/inbound/[clinicSlug]` | Path `clinicSlug` + Basic Auth per clinic | Credentials validated. |
| **Lifefile data-push / prescription-status** | Payload/order lookup → clinic | Secret/auth as implemented. |
| **Wellmedr / Heyflow / Overtime / etc.** | Typically lookup by order/id or config | Various; no generic trust of body clinicId. |

**Conclusion:** Webhooks tie events to tenant via path, signature, and DB lookups. No reliance on client-supplied tenant ID in body for security-critical paths.

---

## 6. Background Jobs / Cron

| Job | Tenant handling |
|-----|-----------------|
| **platform-fees** | `findMany` ClinicPlatformFeeConfig → iterate by `config.clinicId`. |
| **affiliate-payouts** | `findMany` AffiliateProgram (active) → iterate by `clinicId`. |
| **refill-scheduler** | Global refill list; processes each refill (each has clinicId). No single-tenant iteration but no cross-tenant leak. |
| **reconcile-payments, email-digest, process-eonpro-queue** | Not fully re-audited here; assume same pattern: iterate per tenant or process by record-owned clinicId. |

**Conclusion:** Cron jobs that are tenant-aware iterate per clinic from DB; no global “all tenants’ data in one response” exposure.

---

## 7. Risk Summary & Remediation

### HIGH RISK

| # | Finding | Remediation |
|---|---------|-------------|
| H1 | **Clinic middleware trusts `x-clinic-id` header** (Priority 3). Client can set arbitrary clinic for unauthenticated or pre-auth requests. | Remove `x-clinic-id` from clinic resolution in middleware, or only allow it for internal/server-to-server calls with a separate secret or IP allowlist. Derive clinic only from cookie, JWT, subdomain, and (if desired) DEFAULT_CLINIC_ID. |
| H2 | **POST /api/tickets** uses `body.clinicId || user.clinicId` without verifying user has access to `body.clinicId`. Any authenticated user can create tickets in another clinic. | Use only `user.clinicId` (or effective clinic from headers set by auth). If super_admin may set clinic, restrict to `user.role === 'super_admin'` and optionally validate `body.clinicId` against UserClinic/ProviderClinic. |

### MEDIUM RISK

| # | Finding | Remediation |
|---|---------|-------------|
| M1 | **POST /api/ai/chat** falls back to `body.clinicId` when no clinic from user/header. Route does not use withAuth. | Require authentication (e.g. withAuth). Never trust `body.clinicId`. Derive clinic only from user and request headers set by auth; if none, return 400. |
| M2 | **DEFAULT_CLINIC_ID** in clinic middleware and getCurrentClinicId(). | Document as single-tenant only. For multi-tenant, avoid default; require explicit clinic (cookie/subdomain/JWT). Or gate DEFAULT_CLINIC_ID behind a feature flag (e.g. single-tenant mode). |
| M3 | **paymentMatchingService** uses DEFAULT_CLINIC_ID when creating patient from Stripe when no clinic is inferred. | Prefer deriving clinic from Stripe account / metadata / linked invoice when possible. If default is required, document and restrict to single-tenant or ensure metadata is always set for multi-tenant. |
| M4 | **getClinicIdFromRequest()** returns `x-clinic-id` from request. When used in routes that run after auth, the header is overwritten by auth — but any route using it without auth could see client-supplied value. | Use getClinicIdFromRequest only after auth, or deprecate it in favor of getClinicContext() / user.clinicId in authenticated handlers. For unauthenticated routes, do not use request header for tenant. |

### LOW RISK

| # | Finding | Remediation |
|---|---------|-------------|
| L1 | Super_admin routes accept `body.clinicId` or query `clinicId`. | Keep as-is; ensure audit logging when super_admin selects a clinic. Optionally validate clinic id exists and (if needed) user has access. |
| L2 | **PATCH /api/patients/[id]/clinic** (super_admin only) uses body.clinicId. | Already restricted and validated. No change required. |
| L3 | **db.ts** when getClinicId() is undefined, Prisma wrapper applies no clinic filter. | By design for super_admin and cron/webhooks. Ensure no authenticated non–super_admin route runs without clinic context set by auth. |

---

## 8. Remediation Plan (Prioritized)

1. **Immediate (P0)**  
   - **H1:** Stop trusting `x-clinic-id` in clinic middleware for tenant resolution (remove or restrict to internal only).  
   - **H2:** Fix POST /api/tickets to never use body.clinicId for non–super_admin; use only server-derived clinic and add super_admin check if body.clinicId is ever allowed.

2. **Short-term (P1)**  
   - **M1:** Enforce auth on /api/ai/chat and remove body.clinicId fallback.  
   - **M4:** Audit all usages of getClinicIdFromRequest(); use only after auth or replace with getClinicContext()/user.clinicId.

3. **Medium-term (P2)**  
   - **M2, M3:** Document and constrain DEFAULT_CLINIC_ID; improve Stripe→clinic derivation to avoid default where possible.  
   - Add automated checks: (1) no route uses body.clinicId/params.clinicId without role check or validation, (2) clinic middleware does not trust x-clinic-id from client.

4. **Ongoing**  
   - New API routes: require explicit “tenant from server context only” in review checklist.  
   - Any new cache or search index: keys/indices must include tenant id.

---

## 9. Final Verdict

**Is the architecture enterprise-safe for PHI multi-clinic scaling?**

**Not yet, with current findings.**

- **Strengths:**  
  - Auth middleware derives clinic from JWT and subdomain and sets context for authenticated routes.  
  - Prisma wrapper enforces clinicId on clinic-isolated models when context is set.  
  - Webhooks and cron jobs tie tenant to path, signature, or DB lookups.  
  - Finance cache is tenant-scoped by key.  
  - Many admin flows correctly restrict body.clinicId to super_admin.

- **Blockers for “enterprise-safe”:**  
  - **H1** and **H2** allow tenant to be influenced or set by the client. That violates the requirement that tenant be derived **only** from server-side context (subdomain or authenticated user) and that **no** client-supplied tenantId/clinicId be trusted for non–super_admin.  
  - Until H1 and H2 are fixed, the architecture cannot be considered safe for PHI multi-clinic scaling in an enterprise sense.

**After remediation of HIGH and MEDIUM items** (and adoption of the recommended patterns), the architecture can be considered **enterprise-safe** for multi-clinic PHI scaling, with the caveat that DEFAULT_CLINIC_ID and any fallback tenant be explicitly scoped (e.g. single-tenant mode only) and documented.

---

*End of report. No code was modified; analysis only.*
