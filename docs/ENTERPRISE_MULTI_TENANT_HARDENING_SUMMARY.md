# Enterprise Multi-Tenant Hardening — Execution Summary

## Objective

Harden the system for **200+ clinic tenants**, **500k+ patients**, **PHI/HIPAA**, and **zero cross-tenant data leakage**. Non-negotiable: it must be **impossible** to read/write any tenant-scoped model without tenant context, except on explicit super-admin allow-listed routes.

---

## Phase A — Tenant Context Enforcement

### 1. `src/lib/db.ts`

- **`applyClinicFilter()`**  
  Never returns unmodified `where` when `clinicId` is missing. For every clinic-isolated model, throws **`TenantContextRequiredError`** if `getClinicId()` is missing. No default tenant or fallback (e.g. `DEFAULT_CLINIC_ID`, "first clinic") for protected routes.
- **`CLINIC_ISOLATED_MODELS`**  
  Complete list of all Prisma models that have `clinicId` (or tenant identifier); every such model is included. The default `prisma` export is wrapped in a **Proxy** so any property whose lowercase name is in `CLINIC_ISOLATED_MODELS` is served via the filtered delegate (all reads/writes get clinic filter and strict throw when context is missing).
- **Exports**  
  `CLINIC_ISOLATED_MODELS`, `getClinicContext()`, `runWithClinicContext()`, `withClinicContext()`.

### 2. `src/middleware/clinic.ts`

- Removed use of **`DEFAULT_CLINIC_ID`** and any “first clinic” fallback from `resolveClinic()`.

### 3. Tests

- **`tests/tenant-isolation/clinic-isolated-models.test.ts`**  
  Reads `prisma/schema.prisma`, parses every `model` block for `clinicId`, builds the list of camelCase model names, and **fails the build** if any model with `clinicId` is not in `CLINIC_ISOLATED_MODELS`.
- **`tests/tenant-isolation/tenant-context-required.test.ts`**  
  Asserts: (1) `TenantContextRequiredError` has `code: 'TENANT_CONTEXT_REQUIRED'`; (2) `prisma.patient.findMany()` without clinic context throws; (3) `prisma.patient.findMany()` inside `runWithClinicContext(1, ...)` does not throw.

---

## Phase B — basePrisma Bypass

### 4. `src/lib/db.ts`

- **`BASE_PRISMA_ALLOWLIST`**  
  Only these may be used with `basePrisma`: `clinic`, `user`, `userclinic`, `providerclinic`, `provider`, `patient` (for webhook/cron lookup by phone to resolve `clinicId` only), `hipaaauditentry`, `affiliate`, `affiliateapplication`, `affiliatecommissionplan`, `affiliateplanassignment`, `platformfeeevent`. All other tenant-scoped access must use `prisma` + `runWithClinicContext` or explicit `clinicId`.
- **Guarded basePrisma**  
  Raw client is `_rawBasePrisma`; **`createGuardedBasePrisma(client)`** returns a Proxy that in **production** throws if the accessed property is a clinic-isolated model and **not** in `BASE_PRISMA_ALLOWLIST`. **`export const basePrisma = createGuardedBasePrisma(_rawBasePrisma)`**.

### 5. Replacements (basePrisma → prisma or runWithClinicContext)

- **`src/services/billing/InvoiceManager.ts`**  
  Uses `prisma` (callers run with auth → clinic context set).
- **`src/app/api/orders/[id]/approve-and-send/route.ts`**  
  Uses `runWithClinicContext(cid, () => prisma.order.findUnique(...))` over provider clinic IDs until order is found.
- **`src/app/api/patient-chat/route.ts`**, **`src/app/api/messages/send/route.ts`**, **`src/app/api/messages/conversations/route.ts`**, **`src/app/api/internal/messages/route.ts`**, **`src/app/api/internal/messages/[id]/reactions/route.ts`**  
  All use `prisma` instead of `basePrisma`.
- **`src/app/api/webhooks/twilio/incoming-sms/route.ts`**  
  Keeps `basePrisma.patient.findFirst` (allow-listed) to resolve patient by phone; **patientChatMessage** find/create moved inside `runWithClinicContext(patient.clinicId, () => prisma.patientChatMessage...)`.
- **`src/lib/database/data-preloader.ts`**  
  Uses `basePrisma.patient.findUnique` only to get `clinicId` for preload; dashboard preload uses `runWithClinicContext(stub.clinicId, () => prisma...)`. `preloadProviderSchedule` now takes required **`clinicId`** and runs inside `runWithClinicContext(clinicId, ...)`.

---

## Phase C — Tenant Resolution Trust

### 6. `src/middleware/clinic.ts`

- **Stopped trusting `x-clinic-id` as isolation source.**  
  Removed priority-3 resolution from `x-clinic-id`.  
  Comment: `x-clinic-id` is not trusted for isolation; only JWT or subdomain/cookie set tenant. APIs that need `x-clinic-id` must validate in the auth layer (authenticated + clinic in user’s allowed clinics). Subdomain priority renumbered from 4 to 3.

---

## Phase D — Raw SQL Safety

### 7. `src/app/api/admin/data-integrity/route.ts`

- **Scope and context**  
  Resolve `scopeClinicId`: super_admin → first clinic from `basePrisma.clinic.findFirst()`; otherwise `auth.user.clinicId ?? getClinicContext()`. If missing, return 400.  
  Steps 2 (test critical queries) and 4 (get record counts) run inside **`runWithClinicContext(scopeClinicId, ...)`**.  
  **`checkDataIntegrity(clinicId?)`**: when `clinicId` is set (non–super_admin), all raw SQL uses **`clinicId` in WHERE** for Invoice, Payment, Subscription (orphan checks and duplicate subscriptions). Uses `Prisma.sql` fragments for parameterized filters. Super_admin passes `undefined` → global integrity check.

### 8. `src/lib/database/schema-validator.ts`

- **`validateDatabaseSchema(providedPrisma?, clinicId?)`**  
  Optional **`clinicId`** added. **`checkOrphanedRecords(db, clinicId?)`** uses `Prisma.sql` with `AND i."clinicId" = ${clinicId}` / `AND pay."clinicId" = ${clinicId}` when `clinicId` is provided, so orphan checks are tenant-scoped and do not leak cross-tenant counts.

### 9. `src/lib/policies/policy-service.ts`

- Comment added: cross-tenant aggregation by clinic is **super-admin only**; callers must enforce super_admin or filter to a single clinic.

### 10. Other raw SQL

- **Affiliate** (leaderboard, commission, trends, payouts): already scoped by `clinicId` / `affiliateId` in WHERE.  
- **Health/ready/monitoring**: `SELECT 1` or information_schema only (no tenant tables).  
- **Admin seed-eonmeds-products / run-migration**: already use `WHERE "clinicId" = ...` for Product and tenant-scoped tables.

---

## Phase E — Cache + Rate Limit Isolation

### 11. Notifications count — `src/app/api/notifications/count/route.ts`

- **Cache key**  
  Uses **`tenantCacheKey(clinicId, 'notifications', 'count', user.id)`** and namespace **`TENANT_NOTIFICATIONS_NAMESPACE`**.  
  **`getClinicContext()`** required; if missing, returns 400 (no cross-tenant cache).
- **`invalidateNotificationsCountCache(userId, clinicId?)`**  
  Uses same tenant key; `clinicId ?? getClinicContext()` so callers can omit when request has context.

### 12. Rate limiting — `src/lib/rateLimit.ts`

- **Default key generator**  
  When **`x-clinic-id`** is present, key is **`ratelimit:${clinicId}:ip:${ip}`**; otherwise **`ratelimit:ip:${ip}`**. Prevents one tenant from exhausting another’s rate limit bucket.

### 13. Finance cache — `src/lib/cache/financeCache.ts`

- Already uses **`finance:${clinicId}:${category}:${subKey}`**; no change.

### 14. WebSocket presence — `src/lib/realtime/websocket.ts`

- **Presence key**  
  When **`user.clinicId`** is present (from token), cache key is **`tenantCacheKey(clinicId, 'user', 'online', user.id)`** with namespace **`presence`**. On disconnect, same key is deleted. **`getUserStatus(userId, clinicId?)`** accepts optional **`clinicId`** and uses tenant-scoped key when provided. **`SocketUser`** extended with **`clinicId?: number`**.

---

## Phase F — Pagination / Scale

### 15. `src/lib/pagination.ts`

- **`MAX_PAGE_SIZE = 100`** and **`normalizePagination()`** / **`withPagination()`** already present; used where pagination is implemented.

### 16. Test — `tests/tenant-isolation/pagination-enforcement.test.ts`

- Asserts **`MAX_PAGE_SIZE` is 100** in the pagination module.
- Scans **`src/app/api`** for **`prisma.*.findMany(`** and reports (does not fail the build on) calls that do not include **`take`** or **`withPagination`**. Bounded queries (e.g. **`id: { in: ... }`**) are treated as allowed. Intended follow-up: add **`take`** (or **`withPagination`**) to list routes so the test can be tightened to fail on unbounded list endpoints.

---

## File Change Summary (PR-style)

| File | Change |
|------|--------|
| **src/lib/db.ts** | Strict tenant context (throw when missing), full `CLINIC_ISOLATED_MODELS`, Proxy for `prisma`, `BASE_PRISMA_ALLOWLIST`, guarded `basePrisma`. |
| **src/middleware/clinic.ts** | No default clinic; `x-clinic-id` not trusted for isolation. |
| **src/app/api/admin/data-integrity/route.ts** | Clinic-scoped integrity: `scopeClinicId`, raw SQL with `clinicId` WHERE, `runWithClinicContext` for query tests and counts. |
| **src/lib/database/schema-validator.ts** | `validateDatabaseSchema(_, clinicId?)`, `checkOrphanedRecords(_, clinicId?)` with tenant-scoped raw SQL. |
| **src/lib/policies/policy-service.ts** | Comment: policy acknowledgment report is super-admin only. |
| **src/app/api/notifications/count/route.ts** | Tenant cache key and namespace; require clinic context; invalidate with optional `clinicId`. |
| **src/lib/rateLimit.ts** | Default key includes `clinicId` when `x-clinic-id` present. |
| **src/lib/realtime/websocket.ts** | Tenant-scoped presence key, `SocketUser.clinicId`, `getUserStatus(userId, clinicId?)`. |
| **tests/tenant-isolation/clinic-isolated-models.test.ts** | Build fails if any model with `clinicId` is missing from `CLINIC_ISOLATED_MODELS`. |
| **tests/tenant-isolation/tenant-context-required.test.ts** | Throws without context; works with `runWithClinicContext`. |
| **tests/tenant-isolation/pagination-enforcement.test.ts** | Asserts `MAX_PAGE_SIZE`; reports unbounded `findMany` in API routes. |

(Additional files changed in prior work: InvoiceManager, orders approve-and-send, patient-chat, messages, internal messages, twilio webhook, data-preloader.)

---

## Tenant-Scoped Models (from `CLINIC_ISOLATED_MODELS`)

All models with `clinicId` in the schema are in this list (lowercase). The schema test ensures it stays complete.

- addressvalidationlog, affiliate*, aiconversation, apikey, appointment*, auditlog, billingcode, calendarsubscription, careplan*, challenge, clinicauditlog, clinicinvitecode, clinicplatform*, commission, discountcode, emaillog, financialmetrics, hipaaauditentry, influencer, intakeformtemplate, integration, internalmessage, invoice, labreport, notification, order, patient*, payment*, platformfeeevent, policyacknowledgment, pricingrule, product*, promotion, provider*, referraltracking, refillqueue, reportexport, retentionoffer, savedreport, scheduledemail, slapolicyconfig, sms*, soapnote, subscription, superbill, systemsettings, telehealthsession, ticket*, user, userclinic, webhookconfig, webhooklog.

(Full list: see **`CLINIC_ISOLATED_MODELS`** in **`src/lib/db.ts`**.)

---

## Proof Checks

### (a) basePrisma on tenant-scoped models

- **Grep**  
  `basePrisma` usage is only for: clinic, user, userClinic, providerClinic, provider, patient (allow-listed for lookup), hipaaauditentry, affiliate*, platformfeeevent. No other tenant-scoped model is accessed via `basePrisma`; production guard throws if one is used.

### (b) Missing tenant context throws

- **Tests**  
  **`tests/tenant-isolation/tenant-context-required.test.ts`**:  
  - `prisma.patient.findMany()` without clinic context throws **`TenantContextRequiredError`** (message contains “Tenant context is required”).  
  - Same call inside **`runWithClinicContext(1, ...)`** does not throw.

### (c) Cross-tenant IDs cannot be queried

- **Design**  
  All access through the default **`prisma`** Proxy adds **`clinicId`** to **`where`** (and to create/update data). So **`findUnique({ where: { id: X } })`** becomes **`findUnique({ where: { id: X, clinicId: <context> } })`**. The database therefore never returns rows from another clinic. Cross-tenant ID “cannot be read” because the query is always restricted to the current tenant.

---

## Follow-Up

1. **Pagination**  
   Add **`take`** / **`withPagination`** to the 132+ API route **`findMany`** calls reported by the pagination test; then optionally make the test fail when unbounded list routes remain.
2. **x-clinic-id**  
   Where an API needs to accept **`x-clinic-id`**, enforce in auth: request authenticated and **clinicId** in the user’s allowed clinics; otherwise ignore or 403.
