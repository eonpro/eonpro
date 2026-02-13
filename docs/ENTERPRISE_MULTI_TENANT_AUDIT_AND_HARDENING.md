# Enterprise Multi-Tenant Audit & Hardening

**Classification:** Principal SaaS Architect / SOC 2 / HIPAA / Multi-Tenant Review  
**Target scale:** 200+ clinic tenants, 500,000+ patients, Stripe-scale financial operations, zero cross-tenant leakage  
**Date:** February 2026

---

## PHASE 1 – STRUCTURAL AUDIT

### 1.1 System Map

| Layer | Location | Notes |
|-------|----------|--------|
| **API routes** | `src/app/api/**` | 200+ route files; many use `withAuth`/`withClinicalAuth`/`withAdminAuth`; webhooks and cron use API key or no auth |
| **Server actions** | N/A | No `'use server'` found; no Next server actions in scope |
| **Webhooks** | `src/app/api/webhooks/**`, `src/app/api/stripe/webhook/**`, `src/app/api/lifefile-webhook/**` | Lifefile (inbound by clinicSlug), Stripe OT, Stripe Connect, Heyflow, Wellmedr, Overtime, Twilio, SES bounce, etc. |
| **Background jobs** | `src/app/api/cron/**` | affiliate-payouts, email-digest, platform-fees, process-scheduled-emails, reconcile-payments, refill-scheduler, competition-scores, process-eonpro-queue |
| **DB / ORM** | `src/lib/db.ts`, `prisma/schema.prisma` | Prisma with wrapper `PrismaWithClinicFilter`; `basePrisma` exported and used in 20+ files |
| **Cache** | `src/lib/cache/redis.ts`, `src/lib/cache/financeCache.ts` | Redis (sessions, rate limit, notifications count, finance); keys not consistently tenant-prefixed |
| **Search** | `src/lib/security/phi-search.ts`, Prisma `findMany` | No dedicated search engine; Prisma + optional PHI search |
| **Queue** | `src/lib/queue/deadLetterQueue.ts` (Upstash), cron routes | No per-tenant queue isolation; DLQ is global |

### 1.2 Risk Map

#### CRITICAL – Cross-tenant data leakage

| # | Risk | Location | Detail |
|---|------|----------|--------|
| 1 | **Unscoped queries when context missing** | `src/lib/db.ts` | `PrismaWithClinicFilter.applyClinicFilter()` returns `where` unchanged when `getClinicId()` is undefined → **any route that doesn’t set clinic context can run unscoped findMany/findFirst** on clinic-isolated models. |
| 2 | **basePrisma bypass** | 20+ files | `basePrisma` is used for login, clinic resolve, auth middleware, **InvoiceManager** (findMany/count on Invoice), patient-chat, messages, internal messages, prescriptions, provider settings, super-admin. **InvoiceManager** and **messages/conversations** (findMany patients), **internal/messages** (findMany InternalMessage) can run **without clinic filter** if caller doesn’t pass clinicId. |
| 3 | **Tenant from client** | `src/middleware/clinic.ts` | Clinic resolved from: cookie `selected-clinic`, JWT, **x-clinic-id header**, subdomain (env map only). **x-clinic-id is client-supplied**; for unauthenticated or incorrectly secured routes, tenant could be spoofed. |
| 4 | **Raw SQL without tenant** | `src/app/api/admin/data-integrity/route.ts`, `src/lib/database/schema-validator.ts` | Orphan checks (Invoice, Payment, Subscription) run **global** COUNTs with no clinicId filter → cross-tenant visibility in results. |
| 5 | **Webhook tenant resolution** | Stripe OT, Lifefile | OT webhook uses hardcoded subdomain → OK. Generic Stripe webhook and others must resolve tenant from event metadata; **any lookup by subscription/customer without clinicId** risks wrong tenant. |

#### HIGH – Missing or inconsistent enforcement

| # | Risk | Location | Detail |
|---|------|----------|--------|
| 6 | **Missing auth on routes** | Various | Webhooks/cron use secrets or API key; some internal routes may rely only on network. **No single registry** of “always-auth” vs “webhook/cron” routes. |
| 7 | **Nullable clinicId** | `prisma/schema.prisma` | Many models have `clinicId Int?` (Order, Invoice, Payment, Subscription, SOAPNote, etc.). **NOT NULL not enforced** at DB for those → application must always set/filter; easier to miss. |
| 8 | **CLINIC_ISOLATED_MODELS incomplete** | `src/lib/db.ts` | Only ~25 models listed; schema has **80+ models with clinicId**. Models not in list **never get automatic filter** from the wrapper. |
| 9 | **getClinicContext() used without require** | Finance, reports, exports | Routes use `getClinicContext()` and proceed with `null` for super_admin; if a non–super_admin route forgets to check, **null context → no filter** (same as risk 1). |

#### MEDIUM – Indexes, performance, cache/queue

| # | Risk | Location | Detail |
|---|------|----------|--------|
| 10 | **Missing composite index** | Schema | Some high-cardinality queries filter by clinicId + status/createdAt; not all have composite indexes (e.g. Invoice.clinicId+status+createdAt). |
| 11 | **Unbounded queries** | API routes | Many list endpoints use `findMany` without `take`/`skip` or enforce a max page size → **risk of large result sets** at 500k patients. |
| 12 | **Cache keys without tenant** | `src/app/api/notifications/count/route.ts`, `src/lib/realtime/websocket.ts` | Notification count cache key `count:${user.id}`; **user online** `user:online:${user.id}`. For **multi-clinic users** (same userId, different clinics) count/online status can be shared across tenants. |
| 13 | **Rate limit keys** | `src/lib/security/rate-limiter.ts` | Rate limit by IP or user; **no tenant in key** → one tenant’s abuse can affect others on same IP/user. |
| 14 | **N+1 potential** | Various | List routes that load relations (e.g. patients with orders, invoices) may cause N+1 if not using `include`/`select` carefully. |

#### LOW – Operational / hygiene

| # | Risk | Location | Detail |
|---|------|----------|--------|
| 15 | **SELECT *** | Ad-hoc | No project-wide ban; some queries may select full models. |
| 16 | **Stripe idempotency** | Stripe webhooks | Idempotency by event ID; **per-tenant idempotency key** not consistently enforced (e.g. same event for two tenants). |
| 17 | **Queue workers** | Cron jobs | Cron routes process all tenants in one job; **no per-tenant batching** or isolation. |

---

## PHASE 2 – ENFORCEMENT ARCHITECTURE

### 2.1 Tenant resolution (single source per request)

- **Where:** Middleware (clinic) + auth middleware.
- **Current:** Clinic middleware sets `x-clinic-id` from cookie → JWT → x-clinic-id header → subdomain (env map) → DEFAULT_CLINIC_ID. Auth then sets `setClinicContext(user.clinicId)` from JWT.
- **Required:**
  - Resolve tenant **once** per request: either from **subdomain** (with DB or env map) or from **authenticated org** (JWT/clinicId).
  - Store in **request context** (AsyncLocalStorage) and **reject** (400/403) if route requires tenant and it is missing.
  - **Do not** trust `x-clinic-id` for tenant isolation unless it is validated against the authenticated user’s allowed clinics.

### 2.2 Mandatory tenant enforcement at the lowest layer

- **Option A – Prisma middleware (v5+):** In Prisma client, add middleware that, for clinic-isolated models, **injects clinicId** into every `where`/`data` and **throws** if context is missing and model is tenant-scoped (except super_admin).
- **Option B – Repository layer:** All DB access for tenant-scoped data goes through **tenant-aware repositories**; route handlers never use `prisma`/`basePrisma` directly for those models. Repositories **require** `clinicId` and throw if missing.

Recommended: **Keep existing Prisma wrapper** but make it **strict**: for any model in CLINIC_ISOLATED_MODELS, if `getClinicId()` is undefined and `BYPASS_CLINIC_FILTER` is not set, **throw** instead of returning unscoped query. Add **all** tenant-scoped models to CLINIC_ISOLATED_MODELS. Reduce **basePrisma** usage to a small allow-list (auth, clinic lookup, super-admin, HIPAA audit write).

### 2.3 Strict data-access pattern

- **No direct Prisma in route files** for tenant-scoped tables: use **services/repositories** that accept `clinicId` (or tenant context) and enforce it on every query.
- **Directory structure:** e.g. `src/domains/<domain>/repositories/`, `src/domains/<domain>/services/`; repositories use `prisma` (wrapped) with context set, or accept `clinicId` explicitly.

### 2.4 Schema and constraints

- **tenant_id NOT NULL:** For all tenant-scoped tables, make `clinicId` NOT NULL where business allows (e.g. Patient, Invoice for single-clinic invoices). Where nullable is required (e.g. shared providers), document and enforce in app layer.
- **Composite indexes:** Add (clinicId, primary_filter) for hot paths (e.g. Invoice: clinicId + status + createdAt).
- **Foreign keys:** Ensure FKs that reference tenant-scoped tables include clinic consistency (e.g. avoid Order → Clinic mismatch).

---

## PHASE 3 – PERFORMANCE HARDENING

### 3.1 Index recommendations

- **Patient:** `(clinicId, status)`, `(clinicId, createdAt DESC)` if not present.
- **Invoice:** `(clinicId, status, createdAt DESC)`.
- **Order:** `(clinicId, status)` (exists), add `(clinicId, createdAt DESC)` if used for lists.
- **Payment:** `(clinicId, createdAt DESC)`.
- **Subscription:** `(clinicId, status)`.
- **PatientDocument:** `(clinicId, patientId)`.
- **LabReport:** `(clinicId, patientId)`.
- **SOAPNote:** `(clinicId, patientId, createdAt DESC)`.
- **Ticket:** existing composites; ensure (clinicId, status, createdAt) for list views.

### 3.2 Pagination

- **Enforce** a maximum page size (e.g. 100) on all list APIs; default 20–50.
- **Require** cursor or offset in API contract; **no unbounded** findMany without take.

### 3.3 Rate limiting

- **Per-tenant** rate limit keys where possible: e.g. `ratelimit:${clinicId}:${userId}` or `ratelimit:${clinicId}:ip:${ip}`.
- **Global** limits for auth and public endpoints (already present); add tenant-scoped limits for heavy list/export endpoints.

### 3.4 Background jobs

- **Batch by tenant:** e.g. refill-scheduler, affiliate-payouts: group work by clinicId and process in chunks to avoid one tenant’s load affecting others.

### 3.5 Validation checklist

- **No SELECT *** on large tables:** Prefer `select` with explicit fields for list endpoints.
- **No unbounded search:** Search APIs must have limit and timeout.
- **Connection pooling:** Already configured (serverless pool, RDS Proxy–friendly); ensure pool size and timeouts are set for 200+ tenants.
- **Long-running processes:** Cron/workers should not hold large arrays in memory; stream or batch.

---

## PHASE 4 – CACHE + QUEUE ISOLATION

### 4.1 Cache keys

- **Include tenant in key** for any cache that stores tenant-specific data: e.g. `notifications:count:${clinicId}:${userId}`, `user:online:${clinicId}:${userId}` if online is clinic-scoped.
- **Namespaces:** Keep namespaces (session, ratelimit, finance) but ensure **key body** includes clinicId where the value is tenant-specific.
- **FinanceCache:** Already uses clinicId in getOrCompute; keep and document.

### 4.2 Queue

- **Workers:** Prefer processing jobs that are **tagged with clinicId**; when processing, set clinic context so any DB access is tenant-scoped.
- **DLQ:** Store tenant (clinicId) with each message so replay is per-tenant.

### 4.3 Stripe webhooks

- **Map event → tenant:** Use metadata (e.g. clinicId) or Stripe Connect account to resolve clinic; **never** rely on global subscription/customer lookup without tenant.
- **Idempotency key:** Include clinicId: e.g. `stripe:${clinicId}:${eventId}`.
- **Validate:** All webhook handlers that touch payments/subscriptions must resolve and verify tenant before applying changes.

---

## PHASE 5 – SECURITY HARDENING

### 5.1 RBAC

- **Centralized RBAC layer:** Single module that defines roles and permissions per resource (e.g. patient:view, patient:edit, invoice:view, report:export). Routes call `requirePermission(user, resource, action)`.
- **Per-tenant:** Permission checks must consider **clinicId** (user’s clinic or multi-clinic list) and optionally **patientId** for patient-scoped actions.

### 5.2 Audit logging

- **Who accessed which patient:** Every PHI read/write (already partially via HIPAA audit) must log: userId, clinicId, patientId, action, timestamp, IP. Store in HIPAAAuditEntry or equivalent; no PHI in log message.
- **Structured logging:** Include tenant (clinicId) and requestId in all structured logs; no PHI in logs.

### 5.3 Input validation

- **Enforce Zod (or similar)** on all API inputs; reject invalid payloads with 400. No raw `req.json()` without schema.

### 5.4 Error boundary

- **Global API error handler:** e.g. `handleApiError` used consistently; never leak stack or internal errors to client in production; log with requestId and tenant.

---

## PHASE 6 – DELIVERABLES SUMMARY

### 6.1 Refactored architecture (target state)

- **Request pipeline:** Clinic middleware (subdomain/cookie) → Auth middleware (JWT, set clinic from user) → **Require tenant** for protected routes (400 if missing).
- **Data layer:** Tenant-aware repositories/services; Prisma wrapper **strict** (throw if no context for clinic-isolated model). basePrisma only for allow-listed use cases.
- **Cache/queue:** All tenant-scoped keys include clinicId; queue jobs carry clinicId; Stripe webhooks resolve and verify tenant, idempotency per tenant.

### 6.2 Directory structure recommendations

```
src/
  lib/
    db.ts                      # prisma + strict wrapper; export basePrisma only for allow-list
    tenant-context.ts          # getTenantRequire(), getTenant(), runWithTenant()  [IMPLEMENTED]
    pagination.ts              # normalizePagination(), MAX_PAGE_SIZE               [IMPLEMENTED]
    cache/
      redis.ts
      tenant-cache-keys.ts     # tenantCacheKey() for tenant-scoped keys           [IMPLEMENTED]
  domains/
    patient/                   # repositories, services
    order/
    invoice/
    ...
  middleware/                  # clinic (tenant) resolution
  app/api/                     # thin handlers → services
docs/
  ENTERPRISE_INDEX_RECOMMENDATIONS.md   # composite indexes, pagination, pooling   [ADDED]
```

### 6.3 Tenant isolation enforcement layer (implementation)

**Implemented:**

- **`src/lib/tenant-context.ts`** – `getTenantRequire(route?)` throws `TenantContextRequiredError` if tenant missing; `getTenant()`, `runWithTenant()` for webhooks/cron.
- **`src/lib/db.ts`** – Strict mode: when `STRICT_TENANT_ENFORCEMENT=true`, any read/write/groupBy on a clinic-isolated model without tenant context throws `TenantContextRequiredError`. `applyClinicFilter`/`applyClinicToData`/`applyClinicToGroupBy` accept `modelName` and enforce. CLINIC_ISOLATED_MODELS expanded (labreport, patientshippingupdate, financialmetrics, savedreport, reportexport, providerroutingconfig, providercompensationplan, providercompensationevent, clinicplatformfeeconfig, platformfeeevent, clinicplatforminvoice, patientprescriptioncycle).
- **`src/lib/pagination.ts`** – `normalizePagination()`, `DEFAULT_PAGE_SIZE` (20), `MAX_PAGE_SIZE` (100), `withPagination()` for Prisma findMany.
- **`src/lib/cache/tenant-cache-keys.ts`** – `tenantCacheKey(clinicId, ...parts)` for tenant-scoped cache keys; namespaces for notifications and rate limit.

**To do:**

- **Repository pattern:** Add a base `TenantScopedRepository` that takes clinicId in constructor and applies it to all queries (optional; strict wrapper covers prisma usage when context is set).
- Enable **STRICT_TENANT_ENFORCEMENT=true** in production after all routes set clinic context (or use runWithClinicContext) for tenant-scoped access.

### 6.4 Index and schema improvements

- See Phase 3.1 for index list.
- Migration: add NOT NULL for clinicId where business allows; add composite indexes; add FK checks if needed.

### 6.5 Performance bottleneck report

- **Connection pool:** Single pool for all tenants; under 200+ concurrent clinics, ensure RDS Proxy or PgBouncer and per-instance limit (e.g. 1–3 in serverless).
- **Large lists:** Main bottleneck risk is unbounded findMany on Patient, Order, Invoice; enforce pagination and indexes.
- **N+1:** Audit list endpoints that load relations; use include/select and batch where needed.

### 6.6 Enterprise readiness score: **64 / 100** (post Phase 2–4 implementation)

| Area | Score | Notes |
|------|--------|------|
| Tenant isolation | 55 | Strict throw when STRICT_TENANT_ENFORCEMENT=true; getTenantRequire(); basePrisma still used in 20+ files; raw SQL unscoped |
| Auth & RBAC | 65 | withAuth used widely; no centralized RBAC; role checks scattered |
| PHI / HIPAA | 70 | Audit and encryption in place; gaps in coverage and no PHI in logs enforced everywhere |
| Performance & scale | 55 | Pagination util and index doc added; cache key helper; unbounded lists still in many routes |
| Security (input, error, audit) | 55 | handleApiError used in many places; input validation and audit not universal |
| Stripe / financial | 60 | OT webhook tenant OK; generic flow and idempotency need hardening |

### 6.7 Critical blockers list

1. **Strict tenant enforcement in DB layer** – Prisma wrapper must throw when context missing for clinic-isolated models; remove or tightly allow-list basePrisma for tenant-scoped data.
2. **Eliminate unscoped basePrisma usage** – InvoiceManager, messages, internal messages, patient-chat, etc. must use tenant context or explicit clinicId in every query.
3. **Tenant resolution trust** – Do not trust x-clinic-id for isolation; validate against JWT/clinic access; require tenant for all protected routes.
4. **Raw SQL** – All raw queries that touch tenant-scoped tables must include clinicId in WHERE (or be explicitly super-admin only).
5. **Cache/queue keys** – Add clinicId to notification count, user-online, and any other tenant-scoped cache/queue keys.
6. **Pagination** – Enforce max page size and required pagination on all list endpoints.
7. **Schema** – NOT NULL clinicId and composite indexes for hot paths; expand CLINIC_ISOLATED_MODELS to full list.

---

*End of Enterprise Multi-Tenant Audit & Hardening document.*
