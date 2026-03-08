# Multi-Tenant Isolation Architecture Audit

**Classification:** CONFIDENTIAL — Internal Security Review  
**Audit Date:** March 7, 2026  
**Auditor Role:** Enterprise Architect + Security Auditor  
**Scope:** Full codebase — API routes, database layer, webhooks, cron jobs, caching, search  
**Platform:** EonPro Healthcare Platform (Next.js 14 / Prisma / PostgreSQL / Redis)  
**Intended Audience:** SOC 2 Auditor, HIPAA Auditor, Enterprise Clinic Partners, Legal Risk Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Tenant Resolution Flow](#3-tenant-resolution-flow)
4. [Request Lifecycle](#4-request-lifecycle)
5. [Database Schema Tenant Scoping](#5-database-schema-tenant-scoping)
6. [Security Enforcement Layers](#6-security-enforcement-layers)
7. [Cache Scoping Strategy](#7-cache-scoping-strategy)
8. [Webhook Scoping](#8-webhook-scoping)
9. [Background Job Scoping](#9-background-job-scoping)
10. [Failure Cases and Rejection Behavior](#10-failure-cases-and-rejection-behavior)
11. [Risk Report](#11-risk-report)
12. [Remediation Plan](#12-remediation-plan)
13. [Final Verdict](#13-final-verdict)

---

## 1. Executive Summary

The EonPro Healthcare Platform implements a **shared-database, application-enforced** multi-tenant architecture where tenant isolation is managed through a Prisma ORM wrapper layer rather than database-level Row-Level Security (RLS). Tenants are identified as "clinics" (`clinicId`).

### Architecture Grade: C+

The platform has invested significantly in tenant isolation infrastructure — an `AsyncLocalStorage`-based clinic context, automatic Prisma query interception for 90+ models, per-tenant cron job iteration, and production guards on direct database access. These are strong foundations.

However, the audit identified **37 distinct tenant isolation violations** across API routes, webhooks, caching, and background jobs. Of these, **11 are HIGH risk** (potential cross-tenant data exposure or modification), **14 are MEDIUM risk** (conditional bypass or weak scoping), and **12 are LOW risk** (properly mitigated or limited blast radius).

**The platform is NOT enterprise-safe for PHI multi-clinic scaling in its current state.** The violations identified can be remediated, but until they are, any SOC 2 or HIPAA audit would flag the architecture as non-compliant for multi-tenant PHI segregation.

---

## 2. Architecture Overview

### Tenancy Model

| Property | Value |
|----------|-------|
| **Tenancy Model** | Shared database, shared schema, application-enforced isolation |
| **Tenant Identifier** | `clinicId` (integer, FK to `Clinic` table) |
| **Isolation Mechanism** | Prisma ORM wrapper (`PrismaWithClinicFilter`) using `AsyncLocalStorage` |
| **Database-Level Isolation** | None (no RLS, no schemas-per-tenant, no DB-per-tenant) |
| **Tenant Count** | Variable (multi-clinic, multi-provider) |
| **Super-Tenant Role** | `super_admin` — bypasses all tenant scoping |

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Application** | Next.js 14 (App Router) |
| **ORM** | Prisma v5 |
| **Database** | PostgreSQL (Neon/Supabase-compatible) |
| **Cache** | Redis (Upstash REST) |
| **Auth** | JWT (HS256) + Redis sessions |
| **Runtime** | Vercel Serverless Functions |

### Tenant-Scoped Resources

The platform defines **90+ Prisma models** in `CLINIC_ISOLATED_MODELS` that require tenant context for all operations. The Prisma wrapper automatically injects `WHERE clinicId = ?` on reads and `clinicId` on writes for these models.

---

## 3. Tenant Resolution Flow

### Resolution Priority (Authenticated Requests)

Tenant context is resolved in the following order within `withAuth` middleware (`src/lib/auth/middleware.ts`):

```
1. JWT Token → user.clinicId (base context from authentication)
       │
       ▼
2. x-clinic-id Header → parsed integer
       │ (requires hasClinicAccess(userId, clinicId) verification)
       ▼
3. selected-clinic Cookie → parsed integer
       │ (requires hasClinicAccess(userId, clinicId) verification)
       ▼
4. Subdomain → resolveSubdomainClinicId(subdomain)
       │ (requires hasClinicAccess(userId, clinicId) verification)
       ▼
5. Final clinicId → set via runWithClinicContext(clinicId, handler)
```

### Clinic Access Verification

When a user attempts to switch to a different clinic (via header, cookie, or subdomain), the system verifies membership through:

- `UserClinic` junction table (user → clinic assignment)
- `ProviderClinic` junction table (provider → clinic assignment)
- Results cached in Redis for 5 minutes (`mw:clinic-access:<userId>:<clinicId>`)

### Subdomain Resolution

- Subdomain extracted from `Host` header or `x-clinic-subdomain`
- Mapped to `clinicId` via `SUBDOMAIN_CLINIC_ID_MAP` env var or DB lookup
- Cached in Redis for 5 minutes (`mw:subdomain:<subdomain>`)
- Returns `-1` sentinel for unknown subdomains (no fallback/default)

### Unauthenticated Requests

- Clinic middleware (`src/middleware/clinic.ts`) skips public routes (`/api/health`, `/api/auth/login`, `/api/webhooks/*`)
- If multi-clinic is enabled and no clinic context can be resolved: API routes receive `400 { error: 'No clinic context.' }`, pages redirect to `/clinic-select`
- **No default tenant is ever assigned**

---

## 4. Request Lifecycle

```
┌──────────────┐
│  HTTP Request │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Next.js Middleware (src/middleware.ts)            │
│  • Security headers (CSP, X-Frame-Options, etc.)  │
│  • Cache-Control: no-store for API routes          │
│  • Affiliate/Patient portal token presence check   │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Clinic Middleware (src/middleware/clinic.ts)      │
│  • Skip public routes (health, auth, webhooks)     │
│  • Resolve clinicId from cookie → JWT → subdomain  │
│  • Set x-clinic-id and x-clinic-subdomain headers  │
│  • Reject if no clinic context (400 / redirect)    │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  API Route Handler                                 │
│  • Auth wrapper (withAuth/withAdminAuth/etc.)      │
│    ├─ JWT verification (jose.jwtVerify, HS256)     │
│    ├─ Session validation (Redis lookup)            │
│    ├─ Role-based access control                    │
│    ├─ Clinic context resolution (priority chain)   │
│    └─ runWithClinicContext(clinicId, handler)       │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Business Logic (inside AsyncLocalStorage scope)   │
│  • prisma.model.findMany() → auto clinicId filter  │
│  • prisma.model.create() → auto clinicId injection  │
│  • basePrisma access blocked for isolated models    │
└──────────────────────────────────────────────────┘
```

---

## 5. Database Schema Tenant Scoping

### 5.1 Models with `clinicId` (Properly Scoped — 90+ Models)

All models listed in `CLINIC_ISOLATED_MODELS` (`src/lib/db.ts`) are automatically scoped. The wrapper:

- **Reads:** Injects `WHERE clinicId = <context>` for `findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy`
- **Writes:** Injects `clinicId: <context>` into `data` for `create`, `createMany`, `createManyAndReturn`
- **Updates/Deletes:** Injects `WHERE clinicId = <context>`
- **Upserts:** Filters `where`, injects `clinicId` into `create`, prevents `clinicId` change in `update`

### 5.2 Models Missing `clinicId` (PHI Risk)

| Model | Risk | PHI Content | Current Scoping |
|-------|------|-------------|-----------------|
| **IntakeFormSubmission** | HIGH | Patient answers, form data | Via Patient FK only |
| **IntakeFormResponse** | HIGH | Individual answers | Via IntakeFormSubmission FK only |
| **IntakeFormLink** | HIGH | patientEmail, patientPhone | Via IntakeFormTemplate FK only |
| **PatientWeightLog** | MEDIUM | Weight measurements | Via Patient FK only |
| **PatientMedicationReminder** | MEDIUM | Medication names | Via Patient FK only |
| **AIMessage** | MEDIUM | May contain PHI in conversation | Via AIConversation FK only |
| **ChallengeParticipant** | MEDIUM | Patient participation | Via Patient FK; Challenge has optional clinicId |
| **PatientPortalInvite** | MEDIUM | Patient token hash | Via Patient FK only |

**Risk:** Any query on these models that does not JOIN through a clinic-scoped parent can return data across tenants. There is no application-layer guard preventing direct queries without tenant filtering.

### 5.3 Optional `clinicId` on Core Models

The following critical models have `clinicId Int?` (optional) rather than `clinicId Int` (required):

- `Order`, `Invoice`, `Payment`, `PaymentMethod`, `PaymentReconciliation`
- `Subscription`, `SOAPNote`, `User`, `Appointment`, `Ticket`
- `PatientDocument`, `PatientChatMessage`, `SmsLog`
- `LoginAudit`, `AuditLog`, `HIPAAAuditEntry`

**Risk:** Records with `clinicId = NULL` bypass all tenant filtering. The Prisma wrapper adds `WHERE clinicId = <context>`, which will exclude `NULL` rows. This means:
1. Orphaned records (clinicId = NULL) are invisible to all clinics
2. A bug that fails to set clinicId on write creates data loss, not data leakage
3. However, raw SQL queries or `basePrisma` access could expose these records

### 5.4 Database-Level Protections

| Protection | Status |
|------------|--------|
| Row-Level Security (RLS) | **NOT IMPLEMENTED** |
| Schema-per-tenant | **NOT IMPLEMENTED** |
| Database-per-tenant | **NOT IMPLEMENTED** |
| Foreign key to Clinic | Present on most models |
| Unique constraints with clinicId | Some (PatientCounter); not systematic |
| Composite indexes with clinicId | Some; not comprehensive |

**Critical Gap:** The absence of PostgreSQL RLS means the ONLY barrier between tenants is the application-layer Prisma wrapper. Any bypass of this wrapper (raw SQL, basePrisma, ORM bug) results in cross-tenant data access with no database-level safety net.

---

## 6. Security Enforcement Layers

### 6.1 Layer 1: Next.js Middleware (Edge)

- Sets security headers on all responses
- Adds `Cache-Control: no-store, no-cache, must-revalidate` for API routes
- Checks token presence for protected route groups (affiliate, patient portal)
- Delegates clinic resolution to clinic middleware

### 6.2 Layer 2: Clinic Middleware (Edge)

- Resolves `clinicId` from cookie, JWT, or subdomain
- Sets `x-clinic-id` header for downstream consumption
- Rejects requests without clinic context (except public routes)
- **Does NOT validate clinic membership** — delegated to auth wrappers

### 6.3 Layer 3: Auth Wrappers (Server)

| Wrapper | Allowed Roles | Sets Clinic Context |
|---------|--------------|-------------------|
| `withAuth` | Configurable | Yes, via `runWithClinicContext` |
| `withSuperAdminAuth` | `super_admin` | Yes (may be undefined for cross-tenant) |
| `withAdminAuth` | `super_admin`, `admin` | Yes |
| `withProviderAuth` | `super_admin`, `admin`, `provider` | Yes |
| `withClinicalAuth` | `super_admin`, `admin`, `provider`, `staff` | Yes |
| `withSupportAuth` | `super_admin`, `admin`, `support`, `staff` | Yes |
| `withPharmacyAccessAuth` | `super_admin`, `admin`, `staff`, `pharmacy_rep` | Yes |
| `withAffiliateAuth` | `super_admin`, `admin`, `affiliate` | Yes |
| `withPatientAuth` | `super_admin`, `admin`, `provider`, `staff`, `patient` | Yes |

### 6.4 Layer 4: Prisma ORM Wrapper (Data Access)

- `PrismaWithClinicFilter` wraps all Prisma model access
- Reads `clinicId` from `AsyncLocalStorage` (set by `runWithClinicContext`)
- **Throws `TenantContextRequiredError`** if a clinic-isolated model is queried without context
- Prevents `clinicId` mutation in upsert update clauses
- Validates multi-clinic `{ in: [...] }` filters include the context clinic

### 6.5 Layer 5: basePrisma Guard (Production)

- In production, accessing clinic-isolated models via `basePrisma` throws unless the model is in `BASE_PRISMA_ALLOWLIST`
- Allowlisted models: `clinic`, `user`, `userClinic`, `providerClinic`, `provider`, `patient`, `hipaaAuditEntry`, and select affiliate/platform models
- `patient` is allowlisted for webhook/cron phone-number lookups to resolve `clinicId`

### 6.6 Layer 6: Clinic Access Verification

- `hasClinicAccess(userId, clinicId, providerId?)` validates user-clinic membership
- Queries `UserClinic` and `ProviderClinic` tables
- Cached in Redis (5-minute TTL)
- Called when clinic context differs from JWT's base `clinicId`

---

## 7. Cache Scoping Strategy

### 7.1 Cache Layer Assessment

| Cache Layer | Tenant-Scoped | Key Pattern | Risk |
|-------------|---------------|-------------|------|
| **Dashboard Cache** | YES | `prefix:clinicId:userId` | NONE |
| **Finance Cache** | YES | `finance:clinicId:category:subKey` | NONE |
| **Notification Cache** | YES | `clinicId:notifications:count:userId` | NONE |
| **Middleware Cache** (subdomain) | N/A | `mw:subdomain:subdomain` | NONE (public mapping) |
| **Middleware Cache** (access) | YES | `mw:clinic-access:userId:clinicId` | LOW (5-min stale) |
| **Request-Scoped Cache** | YES | Session-scoped | NONE |
| **WebSocket Presence** | YES | `clinicId:user:online:userId` | NONE |
| **Feature Flags** | N/A | `feature-flag:name` (global) | NONE (by design) |
| **Rate Limiter** (API) | YES | Includes `clinicId` when header present | LOW |
| **Rate Limiter** (Auth) | N/A | IP/email-based (correct for auth) | NONE |
| **Core RedisCache** | **CALLER-DEPENDENT** | `namespace:key` | **MEDIUM** |
| **@cacheable Decorator** | **NO** | `methodName:JSON.stringify(args)` | **HIGH** |
| **Query Optimizer** | **CALLER-DEPENDENT** | Caller-composed keys | **MEDIUM** |

### 7.2 Critical Cache Finding: `@cacheable` Decorator

The `@cacheable` decorator in `src/lib/cache/redis.ts` generates cache keys from `methodName` + `JSON.stringify(args)`. If a decorated method does not receive `clinicId` as a parameter, the cache key will be identical across tenants, causing **cross-tenant cache poisoning**.

```
Cache key: "getPatientStats:[]"  ← Same for ALL clinics
```

Any developer using `@cacheable` on a tenant-specific method without passing `clinicId` as an argument creates a cross-tenant data leak.

### 7.3 Response Caching

- All API routes: `Cache-Control: no-store, no-cache, must-revalidate` (set in middleware)
- Static assets: `public, max-age=31536000, immutable` (safe — no tenant data)
- CDN-cached routes: Affiliate landing pages (code-specific URL), logo assets (brand data)
- Document downloads: `private, max-age=3600` (private prevents CDN caching)

**Assessment:** Response caching is properly configured. No cross-tenant CDN leakage risk.

---

## 8. Webhook Scoping

### 8.1 Webhook Assessment Summary

| Webhook | Auth | Tenant Resolution | Risk |
|---------|------|-------------------|------|
| **Stripe (main)** | Signature verification | Connect: account→clinic DB lookup; Platform: metadata or DEFAULT_CLINIC_ID | LOW |
| **Stripe Connect** | Signature verification | account.id→Clinic.stripeAccountId | NONE |
| **Stripe OT** | Signature verification | Fixed: subdomain 'ot' | NONE |
| **Lifefile Inbound** | Basic Auth + HMAC + IP allowlist | URL path clinicSlug→clinic DB lookup | NONE |
| **Lifefile Prescription Status** | Basic Auth (password match) | Iterate clinics, match password | MEDIUM |
| **Lifefile Data Push** | Basic Auth (password match) | Iterate clinics, match password | MEDIUM |
| **Legacy Lifefile** | Basic Auth + IP + HMAC | **NONE — global order lookup** | **HIGH** |
| **Heyflow Intake V1** | Weak (logs on mismatch, continues) | **NONE** | **HIGH** |
| **Heyflow Intake V2** | Strong (rejects invalid) | **NONE — no clinicId to upsertPatientFromIntake** | **HIGH** |
| **MedLink Intake** | Weak (logs on mismatch, continues) | **NONE** | **HIGH** |
| **Unified Intake** | Per-source secrets | **payload.clinicId trusted directly** | **HIGH** |
| **Overtime Intake** | Secret validation | Fixed: subdomain 'ot' / OVERTIME_CLINIC_ID | NONE |
| **WeightLossIntake** | Secret validation | Fixed: subdomain 'eonmeds' | NONE |
| **WellMedR Invoice/Shipping** | Secret validation | Fixed: subdomain 'wellmedr' | NONE |
| **EonMeds Shipping** | Basic Auth | Fixed: subdomain 'eonmeds' | NONE |
| **Twilio Incoming SMS** | Twilio signature | Phone→Patient→clinicId | NONE |
| **Twilio V2** | Twilio signature | Phone→Patient→clinicId | NONE |
| **DoseSpot** | **NONE** | **NONE** | **HIGH** |
| **Zoom** | HMAC signature | Implementation-dependent | UNKNOWN |

### 8.2 Critical Webhook Findings

**WHOOK-1: Legacy Lifefile Webhook** (`src/app/api/lifefile-webhook/route.ts`)
- Performs global order lookup: `prisma.order.findFirst({ where: { lifefileOrderId } })` with NO `clinicId` filter
- A shared credential could be used to update any clinic's orders

**WHOOK-2: Heyflow/MedLink Intake Webhooks** (`src/app/api/webhooks/heyflow-intake/`, `heyflow-intake-v2/`, `medlink-intake/`)
- Call `upsertPatientFromIntake(normalized)` without `clinicId`
- Patient lookup searches globally across all clinics
- New patients may be created with undefined or wrong clinicId

**WHOOK-3: Unified Intake Webhook** (`src/app/api/webhooks/intake/route.ts`)
- Trusts `payload.clinicId` directly from the webhook body
- An attacker with a valid source secret can target any clinic

**WHOOK-4: DoseSpot Webhook** (`src/app/api/dosespot/webhook/route.ts`)
- No authentication or signature verification
- No tenant scoping in processing

---

## 9. Background Job Scoping

### 9.1 Cron Job Authentication

All cron routes use `verifyCronAuth(request)` which validates `CRON_SECRET` from Bearer token or `x-cron-secret` header. Vercel cron header (`x-vercel-cron: 1`) is also accepted. In non-production, if `CRON_SECRET` is unset, auth is skipped.

### 9.2 Per-Tenant Cron Jobs (Properly Scoped)

These jobs use `runCronPerTenant()` which iterates over all active clinics and executes work inside `runWithClinicContext(clinicId, ...)`:

| Job | File |
|-----|------|
| affiliate-payouts | `src/app/api/cron/affiliate-payouts/route.ts` |
| platform-fees | `src/app/api/cron/platform-fees/route.ts` |
| competition-scores | `src/app/api/cron/competition-scores/route.ts` |
| email-digest | `src/app/api/cron/email-digest/route.ts` |
| daily-queue-summary | `src/app/api/cron/daily-queue-summary/route.ts` |
| reconcile-payments | `src/app/api/cron/reconcile-payments/route.ts` |
| process-scheduled-emails | `src/app/api/cron/process-scheduled-emails/route.ts` |

### 9.3 Global Cron Jobs (Risk Assessment)

| Job | Tenant Isolation | Risk |
|-----|-----------------|------|
| **refill-scheduler** | **NONE — queries clinic-isolated model without context** | **CRITICAL** |
| **refill-escalation** | Global query; uses `refill.clinicId` for notifications | MEDIUM |
| **shipment-reminders** | Global query; `clinicId` parameter supported but not passed | LOW |
| **affiliate-data-retention** | Global UPDATE (intentional — data anonymization) | LOW |
| **health-monitor** | N/A — system health only | NONE |
| **portal-health** | N/A — health probe | NONE |
| **process-message-queue** | N/A — delivery payloads only | NONE |
| **process-eonpro-queue** | Global DLQ retry; webhooks enforce own isolation | LOW |

### 9.4 Critical Cron Finding

**CRON-1: refill-scheduler** (`src/app/api/cron/refill-scheduler/route.ts`)

This job queries `RefillQueue` (a clinic-isolated model) without `runWithClinicContext` or `runCronPerTenant`. In production, `prisma.refillQueue.findMany()` without clinic context will **throw `TenantContextRequiredError`**, causing the entire job to fail silently.

---

## 10. Failure Cases and Rejection Behavior

### 10.1 Missing Tenant Context

| Scenario | Behavior |
|----------|----------|
| API request without clinic context (multi-clinic enabled) | **400** `{ error: 'No clinic context.' }` |
| Page navigation without clinic context | **Redirect** to `/clinic-select` |
| Prisma query on isolated model without context | **Throws** `TenantContextRequiredError` |
| basePrisma access to non-allowlisted model (production) | **Throws** `basePrisma.${model} is not allowed in production` |
| `BYPASS_CLINIC_FILTER=true` in production | **BLOCKED** — logged as `CRITICAL` security event |

### 10.2 Invalid Tenant Context

| Scenario | Behavior |
|----------|----------|
| User tries to switch to unauthorized clinic | `hasClinicAccess` returns false; clinicId stays at JWT default |
| Unknown subdomain | Returns `-1` sentinel; cached; request gets 400 |
| Expired JWT | **401** Unauthorized |
| Missing Redis session | Request proceeds (logged as carve-out for parity) |

### 10.3 Cross-Tenant Violations Detected at Runtime

| Detection | Response |
|-----------|----------|
| Multi-clinic `{ in: [...] }` filter excludes context clinic | **Security log** `CLINIC_FILTER_MISMATCH` (warning, not rejection) |
| Clinic-isolated query without context | **Throws** `TenantContextRequiredError` |
| basePrisma on non-allowlisted model | **Throws** in production |

### 10.4 Gaps in Rejection

| Gap | Impact |
|-----|--------|
| `CLINIC_FILTER_MISMATCH` logs but does not reject | Multi-clinic queries that exclude the context clinic proceed |
| Session not found in Redis allows request to continue | Revoked sessions remain valid until JWT expiry |
| `hasClinicAccess` cached for 5 minutes | Revoked clinic access persists for up to 5 minutes |
| No runtime validation that `body.clinicId` matches `user.clinicId` | Multiple routes trust client-supplied clinicId |

---

## 11. Risk Report

### HIGH RISK (11 Findings)

| ID | Category | Finding | File(s) | Impact |
|----|----------|---------|---------|--------|
| **H-1** | API Route | Tickets route accepts `body.clinicId` from any authenticated user without access check | `src/app/api/tickets/route.ts:389` | Any user can create tickets in arbitrary clinics |
| **H-2** | API Route | Ticket stats routes accept `?clinicId=X` without role check | `src/app/api/tickets/stats/route.ts:42`, `tickets/stats/trends/route.ts:16` | Any user can read any clinic's ticket analytics |
| **H-3** | API Route | Scheduling routes accept `clinicId` from body/query without validation | `src/app/api/scheduling/appointments/route.ts:75,124,165`, `scheduling/availability/route.ts:45,55` | Any user can view/create appointments in arbitrary clinics |
| **H-4** | API Route | Billing superbills accepts `clinicId` from body | `src/app/api/billing/superbills/route.ts:132` | Admin can create superbills for another clinic |
| **H-5** | API Route | Billing codes accepts `clinicId` from body (admin) | `src/app/api/billing/codes/route.ts:89` | Admin can create billing codes for another clinic |
| **H-6** | API Route | Care plans accepts `clinicId` from query | `src/app/api/care-plans/route.ts:71,78` | Any user can read care plan templates from any clinic |
| **H-7** | API Route | 6+ finance routes bypass auth wrapper pipeline | `src/app/api/finance/subscriptions/`, `patients/`, `revenue/transactions/`, `payouts/`, `reconciliation/`, `sync-subscriptions/` | Clinic context filtering may not be active |
| **H-8** | Webhook | Heyflow/MedLink intake webhooks create patients without clinicId | `src/app/api/webhooks/heyflow-intake/`, `medlink-intake/` | Cross-tenant patient upsert; global patient search |
| **H-9** | Webhook | Unified intake webhook trusts `payload.clinicId` | `src/app/api/webhooks/intake/route.ts:213` | Attacker with source secret can target any clinic |
| **H-10** | Webhook | DoseSpot webhook has no authentication or tenant scoping | `src/app/api/dosespot/webhook/route.ts` | Unauthenticated; creates records without tenant |
| **H-11** | Cache | `@cacheable` decorator has no tenant awareness | `src/lib/cache/redis.ts:220` | Any use on tenant-specific method causes cross-tenant cache poisoning |

### MEDIUM RISK (14 Findings)

| ID | Category | Finding | File(s) | Impact |
|----|----------|---------|---------|--------|
| **M-1** | API Route | Users route accepts `?clinicId=X` without admin check | `src/app/api/users/route.ts:41` | User list exposure across tenants |
| **M-2** | API Route | Admin data-integrity backfill uses `body.clinicId` with basePrisma; admin (not just super_admin) can target any clinic | `src/app/api/admin/data-integrity/route.ts:238` | Cross-clinic patient data modification |
| **M-3** | API Route | Admin payment-reconciliation uses `body.clinicId ?? DEFAULT_CLINIC_ID` | `src/app/api/admin/payment-reconciliation` | Admin can target any clinic's payments |
| **M-4** | Raw SQL | Affiliate report/leaderboard raw SQL uses conditional clinic filter that falls through when clinicId is falsy | `src/app/api/admin/affiliates/reports/route.ts:182`, `leaderboard/route.ts:141` | Non-super-admin without clinicId sees all data |
| **M-5** | Webhook | Legacy Lifefile webhook does global order lookup without clinicId | `src/app/api/lifefile-webhook/route.ts:181` | Cross-tenant order modification |
| **M-6** | Webhook | Lifefile prescription-status/data-push use shared passwords across clinics | `src/app/api/webhooks/lifefile/prescription-status/`, `lifefile-data-push/` | Same password could match wrong clinic |
| **M-7** | Cron | refill-escalation processes all clinics globally | `src/app/api/cron/refill-escalation/route.ts` | Global query on clinic-isolated data |
| **M-8** | DB Schema | 8+ PHI-containing models lack direct `clinicId` field | See Section 5.2 | Direct queries bypass tenant scoping |
| **M-9** | DB Schema | Core models (Order, Invoice, Payment, etc.) have optional `clinicId Int?` | See Section 5.3 | NULL records escape all tenant filtering |
| **M-10** | DB Schema | No PostgreSQL RLS — single application-layer barrier | Database-wide | Any ORM bypass = full cross-tenant access |
| **M-11** | Cache | Core RedisCache has no automatic tenant prefixing | `src/lib/cache/redis.ts:59` | Caller must remember clinicId in key |
| **M-12** | Cache | PHISearchService doesn't validate clinicId in baseQuery | `src/lib/security/phi-search.ts` | Caller can pass empty baseQuery |
| **M-13** | Cache | Middleware clinic access cache (5-min TTL) delays revocation | `src/lib/auth/middleware-cache.ts` | Revoked access persists 5 minutes |
| **M-14** | Cron | refill-scheduler queries clinic-isolated model without tenant context | `src/app/api/cron/refill-scheduler/route.ts` | Job throws TenantContextRequiredError in production |

### LOW RISK (12 Findings)

| ID | Category | Finding | File(s) | Impact |
|----|----------|---------|---------|--------|
| **L-1** | API Route | Public clinic list endpoint reveals all tenant IDs/names | `src/app/api/clinics/route.ts`, `clinics/list/route.ts` | Information disclosure (tenant enumeration) |
| **L-2** | API Route | Notifications unread-count stub has no auth | `src/app/api/notifications/unread-count/route.ts` | Currently returns `{ count: 0 }`; future risk |
| **L-3** | API Route | Test/debug endpoints exist (heyflow-test, webhooks/test, debug-auth) | Various | Production guards present but fragile |
| **L-4** | API Route | setup-database route with shell exec | `src/app/api/setup-database/route.ts` | Guarded by secret + production check |
| **L-5** | Raw SQL | Prescription queue uses $queryRawUnsafe without explicit clinicId | `src/app/api/provider/prescription-queue/route.ts:345` | Upstream queries are clinic-scoped; defense-in-depth gap |
| **L-6** | Cron | shipment-reminders fetches all clinics' shipments | `src/app/api/cron/shipment-reminders/route.ts` | Service supports clinicId but not passed |
| **L-7** | Cron | affiliate-data-retention updates all clinics | `src/app/api/cron/affiliate-data-retention/route.ts` | Intentional for compliance; no data exposure |
| **L-8** | Cache | Query optimizer depends on caller-composed cache keys | `src/lib/database/query-optimizer.ts` | Footgun for developers |
| **L-9** | Auth | Session not found in Redis allows request to proceed | `src/lib/auth/middleware.ts` | Revoked sessions valid until JWT expiry |
| **L-10** | Auth | Demo tokens in non-production with hardcoded clinicId: 1 | `src/lib/auth/middleware-with-params.ts` | Dev-only; blocked in production |
| **L-11** | Search | searchIndex stores plaintext PHI (names, emails, phones) | `src/lib/utils/search.ts` | Accepted tradeoff; DB access controls apply |
| **L-12** | Admin | bulk-complete-tracked operates globally (super_admin only) | `src/app/api/admin/bulk-complete-tracked/route.ts` | Properly role-gated |

---

## 12. Remediation Plan

### Priority 1: CRITICAL (Immediate — Block Deployment)

| Finding | Remediation | Effort |
|---------|-------------|--------|
| **H-1** (Tickets clinicId) | Replace `body.clinicId \|\| user.clinicId` with `user.role === 'super_admin' ? (body.clinicId \|\| user.clinicId) : user.clinicId` | 1 hour |
| **H-2** (Ticket stats) | Add `if (clinicIdParam && user.role !== 'super_admin') return 403` | 1 hour |
| **H-3** (Scheduling) | Enforce `clinicId = user.clinicId` for non-super-admin; validate access for super_admin | 4 hours |
| **H-7** (Finance routes) | Wrap all finance route handlers with `withAdminAuth` + `runWithClinicContext` | 4 hours |
| **H-8** (Heyflow/MedLink intake) | Pass `clinicId` to `upsertPatientFromIntake`; add per-source clinic mapping config | 8 hours |
| **H-9** (Unified intake) | Replace `payload.clinicId` with source→clinic mapping; never trust payload | 4 hours |
| **H-10** (DoseSpot webhook) | Add signature/auth verification; scope processing by tenant | 4 hours |
| **M-14** (refill-scheduler) | Refactor to use `runCronPerTenant`; pass `clinicId` to `processDueRefills` | 4 hours |

### Priority 2: HIGH (Within 2 Weeks)

| Finding | Remediation | Effort |
|---------|-------------|--------|
| **H-4, H-5, H-6** (Billing/Care Plans) | Add `user.clinicId` enforcement for non-super-admin; access check for super_admin | 4 hours |
| **H-11** (@cacheable) | Deprecate or refactor to require `clinicId` as first arg; audit all usage | 4 hours |
| **M-1** (Users clinicId) | Restrict `?clinicId` to admin/super_admin roles | 1 hour |
| **M-2** (Data integrity) | Restrict backfill operations to `super_admin` role | 1 hour |
| **M-3** (Payment reconciliation) | Remove `DEFAULT_CLINIC_ID` fallback; require explicit clinicId for super_admin only | 2 hours |
| **M-4** (Raw SQL filters) | Change conditional to always include clinic filter for non-super-admin | 4 hours |
| **M-5** (Legacy Lifefile) | Add clinic resolution from auth credentials; scope order lookup by clinicId | 4 hours |
| **M-6** (Lifefile shared passwords) | Implement per-clinic credentials with unique usernames or path-based routing | 8 hours |
| **M-7** (refill-escalation) | Refactor to `runCronPerTenant` | 4 hours |

### Priority 3: MEDIUM (Within 1 Month)

| Finding | Remediation | Effort |
|---------|-------------|--------|
| **M-8** (Missing clinicId on PHI models) | Add `clinicId` to IntakeFormSubmission, IntakeFormResponse, IntakeFormLink; add to `CLINIC_ISOLATED_MODELS` | 16 hours |
| **M-9** (Optional clinicId) | Migration to make `clinicId` required on Order, Invoice, Payment, Subscription; backfill NULLs | 24 hours |
| **M-10** (No RLS) | Implement PostgreSQL RLS policies for all clinic-isolated tables as defense-in-depth | 40 hours |
| **M-11** (RedisCache) | Create `tenantGet`/`tenantSet` wrapper methods that auto-prefix with clinicId | 4 hours |
| **M-12** (PHISearchService) | Add runtime validation that `baseQuery` includes `clinicId` for non-super-admin | 2 hours |
| **M-13** (Cache TTL) | Reduce clinic access cache TTL to 60 seconds; add explicit invalidation on user removal | 4 hours |

### Priority 4: LOW (Ongoing Hardening)

| Finding | Remediation | Effort |
|---------|-------------|--------|
| **L-1** through **L-12** | Address per finding description; prioritize test/debug endpoint removal | 20 hours |
| Comprehensive audit test suite | Automated tests that verify every API route includes tenant scoping | 40 hours |
| Database-level tenant isolation tests | Integration tests that attempt cross-tenant queries and verify rejection | 16 hours |

**Total Estimated Remediation:** ~230 hours (Priority 1: 30h, Priority 2: 32h, Priority 3: 90h, Priority 4: 76h)

---

## 13. Final Verdict

### Is the architecture enterprise-safe for PHI multi-clinic scaling?

**NO — Not in its current state.**

### Strengths

1. **Strong architectural foundation.** The `PrismaWithClinicFilter` wrapper, `AsyncLocalStorage` context, `runWithClinicContext`, `runCronPerTenant`, and `TenantContextRequiredError` demonstrate intentional multi-tenant design.
2. **Production guards on basePrisma.** The allowlist proxy prevents accidental direct access to tenant-scoped data.
3. **Clinic access verification.** The `hasClinicAccess` check with `UserClinic`/`ProviderClinic` validation is well-implemented.
4. **No default tenant.** Missing clinic context results in rejection (400), not a fallback to a default clinic.
5. **Per-tenant cron infrastructure.** `runCronPerTenant` with error isolation per clinic is enterprise-grade.
6. **Response caching properly configured.** `no-store` on all API routes prevents CDN cross-tenant leakage.
7. **Most tenant-scoped caches are properly keyed** (dashboard, finance, notifications, WebSocket presence).

### Critical Weaknesses

1. **No database-level isolation.** The entire tenant boundary is a single application-layer Prisma wrapper. PostgreSQL RLS would provide defense-in-depth that is expected by enterprise auditors.
2. **Client-supplied clinicId trusted in 9+ routes.** Multiple API routes accept `body.clinicId` or `searchParams.clinicId` from any authenticated user without verifying clinic membership. This is the single largest class of vulnerability.
3. **Webhook tenant resolution is inconsistent.** High-volume intake webhooks (Heyflow, MedLink) perform global patient searches without any tenant scoping. The unified intake webhook trusts `payload.clinicId` from external callers.
4. **Finance routes bypass the auth wrapper pipeline.** Six routes handling financial data (revenue, subscriptions, payouts) use manual `getAuthUser()` instead of `withAuth`, meaning `runWithClinicContext` may not be established.
5. **@cacheable decorator is a cross-tenant cache poisoning vector.** It generates tenant-agnostic cache keys.
6. **Optional clinicId on core PHI models.** Order, Invoice, Payment, and other critical models allow `NULL` clinicId, which creates data that escapes all tenant filtering.

### Compliance Assessment

| Standard | Status | Blocking Issues |
|----------|--------|-----------------|
| **SOC 2 (CC6.1 — Logical Access)** | FAIL | Client-supplied tenant IDs trusted; no DB-level isolation |
| **SOC 2 (CC6.3 — Access Segregation)** | FAIL | Cross-tenant data accessible via 11 HIGH-risk routes |
| **HIPAA Security Rule (§164.312(a)(1))** | FAIL | PHI accessible across tenants via intake webhooks |
| **HIPAA Security Rule (§164.312(d))** | CONDITIONAL | Auth system is strong; session revocation gap exists |
| **Enterprise Clinic Partner Readiness** | FAIL | Any partner performing a penetration test would discover findings H-1 through H-3 within hours |

### Path to Enterprise Readiness

The platform can reach enterprise readiness with the following milestones:

1. **Milestone 1 (2 weeks):** Fix all Priority 1 findings. Zero client-supplied clinicId without access verification. All routes use auth wrappers. All webhooks have tenant resolution.
2. **Milestone 2 (1 month):** Fix all Priority 2 findings. All caches are tenant-scoped. All cron jobs use `runCronPerTenant`. Raw SQL includes clinic filters.
3. **Milestone 3 (2 months):** Implement PostgreSQL RLS on all clinic-isolated tables. Make `clinicId` required (non-nullable) on all tenant-scoped models. Add clinicId to PHI models currently missing it.
4. **Milestone 4 (3 months):** Comprehensive automated tenant isolation test suite. Penetration test by external security firm. SOC 2 Type II audit preparation.

---

*End of Audit Document*

*This document is based on static code analysis performed on March 7, 2026. Runtime behavior may differ. A penetration test is recommended to validate findings.*
