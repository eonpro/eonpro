# Enterprise Scale Enforcement & RBAC

## 1. Pagination enforcement

- **`src/lib/pagination.ts`**: `MAX_PAGE_SIZE = 100`, `DEFAULT_PAGE_SIZE = 20`, `AGGREGATION_TAKE = 10_000`, `normalizePagination()`, `withPagination()`.
- **Test**: `tests/tenant-isolation/pagination-enforcement.test.ts` **fails the build** when any `prisma.*.findMany` in `src/app/api` is unbounded (no `take` / `withPagination`), unless:
  - The query is bounded (`id: { in: [...] }` or `patientId: { in: [...] }`), or
  - The route path is in the allowlist: `cron/`, `webhooks/`, `auth/`, `init-database`, `test-webhook-log`, `white-label/test`, `super-admin/`, `internal/`, `patient-portal/`, `patient-progress/`.

### Routes updated with `take` or `withPagination`

- `src/app/api/admin/patients/route.ts` – aggregation take + sales rep assignments
- `src/app/api/admin/dashboard/route.ts` – aggregation take for payments, orders, invoices, subscriptions
- `src/app/api/admin/clinics/route.ts` – take: 100
- `src/app/api/admin/rx-queue/route.ts` – take: 100 on invoices, soapNotes, refills
- `src/app/api/admin/settings/route.ts` – take: 100 on systemSettings, developerTool
- `src/app/api/admin/api-keys/route.ts` – take: 100
- `src/app/api/user/clinics/route.ts` – take: 100
- `src/app/api/internal/users/route.ts` – take: 100 on userClinics and users
- `src/app/api/clinics/route.ts` – take: 100
- `src/app/api/admin/affiliates/[id]/ref-codes/route.ts` – take: 100
- `src/app/api/admin/clinic/users/route.ts` – take: 100
- `src/app/api/bundles/route.ts` – take: 100
- `src/app/api/admin/commission-plans/route.ts` – take: 100
- `src/app/api/discounts/route.ts` – take: 100
- `src/app/api/products/route.ts` – take: 100
- `src/app/api/admin/affiliates/code-performance/route.ts` – take: 100 (both findMany)
- `src/app/api/admin/affiliates/leaderboard/route.ts` – take: 100
- `src/app/api/calendar/subscriptions/route.ts` – take: 100
- `src/app/api/clinic/list/route.ts` – take: 100
- `src/app/api/clinics/list/route.ts` – take: 100
- `src/app/api/admin/influencers/route.ts` – take: 100
- `src/app/api/admin/registration-codes/route.ts` – take: 100
- `src/app/api/admin/sales-reps/route.ts` – take: 100
- `src/app/api/admin/competitions/route.ts` – take: 100 on activeAffiliates findMany

### Routes updated in pagination pass (all findMany bounded; test green)

| Route | findMany change |
|-------|-----------------|
| admin/intakes | payment + order: `take: AGGREGATION_TAKE` |
| admin/integrations | integration: `take: 100` |
| admin/payment-reconciliation | existingRecords: `take: AGGREGATION_TAKE` |
| admin/regenerate-pdf | 2× patientDocument: `take: 10` / `take: 100` |
| admin/sales-reps/[id]/patients | assignments: `take: AGGREGATION_TAKE`; allPatients: `take: AGGREGATION_TAKE` |
| admin/sales-reps/bulk-reassign | activeAssignments: `take: AGGREGATION_TAKE` |
| admin/shipment-schedule/patient/[patientId] | refillQueue: `take: 500` |
| affiliate/ref-codes | refCodes: `take: 100`; touchesWithRefCode: `take: AGGREGATION_TAKE` |
| affiliate/ref-codes/stats | refCodes: `take: 100` |
| affiliate/summary | refCodes: `take: 100` |
| affiliate/tax-documents | documents: `take: 100` |
| affiliate/traffic-sources | touches: `take: AGGREGATION_TAKE` |
| affiliate/withdraw | availableCommissions: `take: AGGREGATION_TAKE` |
| ai-scribe/generate-soap | soapNotes: `take: 100` |
| finance/metrics | activeSubscriptions + outstandingInvoices: `take: AGGREGATION_TAKE` |
| finance/payouts | recentPayments + monthlyPayments: `take: AGGREGATION_TAKE` |
| influencers/bank-accounts | bankAccounts: `take: 100` |
| integrations/reconciliation | eonproPatients + recentPatients: `take: AGGREGATION_TAKE` |
| patients/[id]/bloodwork | labReport: `take: 100` |
| patients/[id]/documents | patientDocument: `take: 100` |
| patients/[id]/shipping-updates | patientShippingUpdate: `take: 100` |
| patients/[id]/subscriptions | subscription: `take: 100` |
| patients/[id]/tracking | patientShippingUpdate + order: `take: 100` each |
| promotions | promotions: `take: 100` |
| provider/settings | userClinics: `take: 100` |
| providers/debug | allProviders: `take: 1000`; usersWithProviderRole: `take: 1000` |
| reports/export | patients + payments + subscriptions: `take: AGGREGATION_TAKE` |
| reports/patients | newPatients + activePatients + inactivePatients: `take: AGGREGATION_TAKE` |
| reports/payments | failedPayments + patientPayments: `take: 10000` (recent already had take) |
| reports/revenue | payments + subscriptions: `take: 10000` |
| reports/route | savedReport: `take: 100` |
| reports/subscriptions | activeSubscriptions + allSubscriptions: `take: 10000` |
| stripe/invoices | 2× invoice (patient list): `take: 100` |
| stripe/refunds | refundedPayments: `take: 100` |
| v2/invoices/summary | invoices: `take: 10_000` (recent/overdue already had take) |

**No routes were added to the allowlist.** The test `tests/tenant-isolation/pagination-enforcement.test.ts` passes with 0 violations.

---

## 2. Tenant response behavior (404 normalization)

- **`src/lib/tenant-response.ts`**:
  - **`tenantNotFoundResponse()`**: returns `NextResponse.json({ error: 'Not found' }, { status: 404 })`. Use when a tenant-scoped resource is not found or not in the current clinic.
  - **`ensureTenantResource(resource, currentClinicId)`**: returns `NextResponse` (404) if `resource` is null or `resource.clinicId` does not match `currentClinicId`; otherwise returns `null` (caller proceeds).

**Rule**: For any query filtered by `clinicId` that finds no record, **always return 404**. Never return 403/401 or different error shapes for “exists but not yours” vs “does not exist” (to prevent timing/response enumeration).

**Audit**: Orders, Invoices, Patients, Messages – ensure handlers use `tenantNotFoundResponse()` or `ensureTenantResource()` when the entity is missing or belongs to another tenant.

### Implemented: endpoints updated + tests

- **Patients**: `patients/[id]` (GET/PATCH catch NotFoundError → tenantNotFoundResponse), `patients/[id]/bloodwork`, `bloodwork/status`, `bloodwork/[reportId]`, `bloodwork/upload`, `patients/[id]/documents` (GET/POST), `documents/[documentId]` (GET/DELETE), `shipping-updates`, `tracking` (GET/POST), `subscriptions` — all use `ensureTenantResource(patient, clinicId)` or tenantNotFoundResponse; 403 for wrong clinic/own-patient replaced with 404 and body `{ error: 'Not found' }`.
- **Orders**: `orders/[id]/approve-and-send` — order not found and cross-clinic both return tenantNotFoundResponse().
- **Invoices**: `stripe/invoices/[id]` (GET/POST/PATCH/DELETE) — auth via getAuthUser; after fetch, `ensureTenantResource(invoice, user.clinicId)`. `invoices/[id]/sync` — not found → tenantNotFoundResponse().
- **Tests**: `tests/tenant-isolation/tenant-404-normalization.test.ts` — tenantNotFoundResponse() 404 + body; ensureTenantResource null/undefined/wrong-clinic; same body for nonexistent vs wrong-clinic.

---

## 3. RBAC – centralized permissions

- **`src/lib/rbac/permissions.ts`**:
  - **Permissions**: `patient:view`, `patient:edit`, `order:view`, `order:create`, `invoice:view`, `invoice:create`, `invoice:export`, `report:run`, `financial:view`, `admin:cross-tenant`, `message:view`, `message:send`, `affiliate:view`, `affiliate:manage`, `settings:manage`, `user:manage`.
  - **`hasPermission(ctx, permission, resource?)`**: returns whether the user has the permission (role + optional `clinicId` / `patientId` / `ownerId` on resource).
  - **`requirePermission(ctx, permission, resource?)`**: throws (403) if the user does not have the permission.
  - **`PERMISSION_MATRIX`**: role × permission table for documentation.

### Permission matrix (role × permission)

| Role        | patient:view | patient:edit | invoice:view | invoice:export | report:run | financial:view | admin:cross-tenant | message:view | message:send | affiliate:view | affiliate:manage | settings:manage | user:manage |
|------------|--------------|--------------|--------------|----------------|-----------|----------------|--------------------|--------------|--------------|---------------|-----------------|-----------------|-------------|
| super_admin | ✓            | ✓            | ✓            | ✓              | ✓         | ✓              | ✓                  | ✓            | ✓            | ✓             | ✓               | ✓               | ✓           |
| admin      | ✓            | ✓            | ✓            | ✓              | ✓         | ✓              | —                  | ✓            | ✓            | ✓             | ✓               | ✓               | ✓           |
| provider   | ✓            | ✓            | ✓            | —              | ✓         | —              | —                  | ✓            | ✓            | —             | —               | —               | —           |
| staff      | ✓            | —            | ✓            | —              | ✓         | —              | —                  | ✓            | ✓            | —             | —               | —               | —           |
| sales_rep   | ✓            | —            | —            | —              | ✓         | —              | —                  | —            | —            | —             | —               | —               | —           |
| patient    | ✓ (own)      | ✓ (own)      | —            | —              | —         | —              | —                  | —            | —            | —             | —               | —               | —           |
| affiliate  | —            | —            | —            | —              | —         | —              | —                  | —            | —            | ✓             | —               | —               | —           |

**Usage**: Replace inline role checks with `requirePermission(ctx, permission, resource)` where `ctx = toPermissionContext(user)` (user has `role`, `clinicId`, `patientId`, `providerId`). For provider-only access to “own” patients, pass `resource: { ownerId: providerId }` when applicable. Return 403 only for permission denial; cross-tenant remains 404. Helper: **`toPermissionContext(user)`** builds `PermissionContext` from auth user.

### RBAC Phase 1 — Endpoint → permission mapping (enforced)

| Endpoint | Method | Permission | Notes |
|----------|--------|------------|--------|
| `api/patients/[id]` | GET | `patient:view` | |
| `api/patients/[id]` | PATCH | `patient:edit` | |
| `api/orders` | GET | `order:view` | |
| `api/orders` | POST | `order:create` | |
| `api/orders/[id]` | GET | `order:view` | |
| `api/stripe/invoices` | POST | `invoice:create` | |
| `api/stripe/invoices` | GET | `invoice:view` | |
| `api/stripe/invoices/[id]` | GET | `invoice:view` | |
| `api/invoices` | GET | `invoice:view` | Dashboard list |
| `api/finance/metrics` | GET | `financial:view` | |
| `api/finance/payouts` | GET | `financial:view` | |
| `api/reports` | GET, POST | `report:run` | |
| `api/reports/patients` | GET | `report:run` | |
| `api/reports/revenue` | GET | `report:run` | |
| `api/reports/payments` | GET | `report:run` | |
| `api/reports/export` | GET | `report:run` | |
| `api/messages/conversations` | GET | `message:view` | |
| `api/messages/conversations/[patientId]` | GET | `message:view` | |
| `api/messages/send` | POST | `message:send` | |

### RBAC Phase 1 — Removed inline checks summary

- **patients/[id]**: Added `requirePermission(ctx, 'patient:view')` (GET), `requirePermission(ctx, 'patient:edit')` (PATCH). No prior inline role check in this route (access via service).
- **orders**: Removed `allowedRoles.includes(user.role)` for POST; added `requirePermission(ctx, 'order:create')`. List: added `requirePermission(ctx, 'order:view')`.
- **orders/[id]**: Added `requirePermission(ctx, 'order:view')` after verifyAuth.
- **stripe/invoices**: Removed `if (!['admin','super_admin','provider'].includes(user.role))` (POST) → `requirePermission(ctx, 'invoice:create')`. Removed `if (!['admin','super_admin','provider','staff'].includes(user.role))` (GET) → `requirePermission(ctx, 'invoice:view')`.
- **stripe/invoices/[id]**: Added `requirePermission(ctx, 'invoice:view')` (GET).
- **invoices** (dashboard): Removed `if (!['admin','super_admin','provider','staff'].includes(auth.user.role))` → `requirePermission(ctx, 'invoice:view')`.
- **finance/metrics**: Added `requirePermission(ctx, 'financial:view')` (kept verifyClinicAccess).
- **finance/payouts**: Added `requirePermission(ctx, 'financial:view')` (kept verifyClinicAccess).
- **reports**, **reports/patients**, **reports/revenue**, **reports/payments**, **reports/export**: Added `requirePermission(ctx, 'report:run')`.
- **messages/conversations**, **messages/conversations/[patientId]**: Added `requirePermission(ctx, 'message:view')`.
- **messages/send**: Added `requirePermission(ctx, 'message:send')`.

### Permissions added for Phase 1

- **order:view**, **order:create** — added to `Permission` and `ROLE_PERMISSIONS` (super_admin, admin, provider: both; staff, sales_rep: order:view only).
- **invoice:create** — already present; provider has it, staff does not.

### Tests (RBAC)

- **tests/security/rbac.security.test.ts**: Centralized RBAC block — provider cannot `invoice:export`; staff cannot `patient:edit`; sales_rep cannot `financial:view`; admin can perform admin-level actions (PERMISSION_MATRIX + requirePermission no throw); super_admin has all in matrix; toPermissionContext normalizes user shape.

---

## 4. Stripe webhook idempotency (tenant-safe)

At scale (Stripe retries, duplicate events, out-of-order delivery), idempotency must be **per tenant** so the same Stripe event ID for two different clinics is processed for both, and a retry for the same clinic returns 200 without double-processing.

### Implementation

- **Resolve tenant before any DB write**: `getClinicIdFromStripeEvent(event)` reads `event.data.object.metadata.clinicId` (payment_intent, charge, invoice, checkout.session). Returns `0` when missing so key is always defined.
- **Idempotency key format**: `stripe:${clinicId}:${eventId}`. Stored in **IdempotencyRecord** (key unique).
- **Flow**: After signature verification, resolve `clinicId` → build key → if `IdempotencyRecord` exists for key → return 200 with `{ duplicate: true }`. Else process event; on success create `IdempotencyRecord` and **WebhookLog** (with `clinicId` for audit).
- **File**: `src/app/api/stripe/webhook/route.ts`.

### Tests

- **tests/unit/api/stripe-webhook.test.ts** — "Tenant-safe idempotency": key format `stripe:${clinicId}:${eventId}`; same eventId + different clinicId → different keys; same eventId + same clinicId → same key (retry deduped); clinicId 0 when metadata missing.

### Enterprise rule: no tenant writes when clinicId = 0

When `getClinicIdFromStripeEvent` returns `0` (metadata.clinicId missing) and the event type is a critical payment event (`payment_intent.succeeded`, `charge.succeeded`, `checkout.session.completed`, `invoice.payment_succeeded`), the handler does **not** write any tenant-scoped records. It logs a warning, queues the event to the DLQ for manual review, and returns 200 with `processed: false`, `reason: 'clinic_unresolved'` so Stripe stops retrying.

---

## 5. Cron per-tenant isolation

Cron routes must not process "everything" globally; each clinic is processed inside `runWithClinicContext(clinicId, ...)` with per-tenant error isolation.

### Helper: `src/lib/cron/tenant-isolation.ts`

- **verifyCronAuth(request)** — Validates `Bearer CRON_SECRET` or `x-cron-secret` (or x-vercel-cron). Use at cron entrypoints.
- **getClinicIdsForCron()** — Returns active clinic IDs via `basePrisma.clinic.findMany` (allowlisted). Super_admin / system level only.
- **runCronPerTenant&lt;T&gt;(options)** — For each clinic ID, runs `perClinic(clinicId)` inside `runWithClinicContext(clinicId, ...)`. Collects results and errors per clinic; one clinic’s failure does not stop others. Optional `batchLimitPerClinic`, `timeboxMs`.
- **takeBatch(items, limit)** — Slices array to batch size (e.g. 500–2000 per clinic).

### Cron route → tenant loop pattern

| Route | Pattern | Notes |
|-------|--------|--------|
| **refill-scheduler** | `runCronPerTenant({ jobName: 'refill-scheduler', perClinic: async (clinicId) => { processDueRefills(clinicId); ... } })` | Batching 500 refills, 200 reminders per clinic; queue status aggregated from per-clinic groupBy. |
| **affiliate-payouts** | `runCronPerTenant` + `runWithClinicContext(clinicId, () => processClinicPayouts(clinicId))` | Approve commissions and process payouts per clinic. |
| **platform-fees** | `runCronPerTenant` + `runWithClinicContext`; `checkOverdueInvoicesForClinic(clinicId)` | Admin fee and overdue check per clinic. |
| **reconcile-payments** | `runCronPerTenant`; missing PIs grouped by metadata.clinic_id, process each in context | Stripe list once; per-clinic process. |
| **process-scheduled-emails** | `runCronPerTenant` + pass for clinicId null via `runWithClinicContext(undefined, ...)` | Pending emails scoped by clinicId. |
| **email-digest** | `runCronPerTenant` + `processDigestsForClinic(clinicId)` | Users with digest enabled per clinic. |
| **competition-scores** | `runCronPerTenant` + `updateActiveCompetitionScoresForClinic(clinicId)` | Leaderboard service per-clinic. |
| **process-eonpro-queue** | `verifyCronAuth` only; no runCronPerTenant | DLQ global; allowlisted. |

### Tests

- **tests/tenant-isolation/cron-tenant-isolation.test.ts**: `verifyCronAuth` (Bearer, x-cron-secret, reject wrong); `takeBatch`; `runCronPerTenant` (per-clinic result collection, error isolation so clinic A failure does not stop clinic B, empty clinicIds).

---

## 6. HIPAA PHI access audit (auditPhiAccess)

All PHI and financial access is auditable and provable via `auditPhiAccess`. Records are written **after** permission check and **before** response. No PHI content is stored—only identifiers and metadata (blocklisted keys stripped).

### Helper: `src/lib/audit/hipaa-audit.ts`

- **auditPhiAccess(request, options)** — Writes to `HIPAAAuditEntry` with: `clinicId`, `userId`, `action`, `patientId` (if applicable), `route`, `ip`, `requestId`, `timestamp`. Metadata is sanitized (no name, DOB, address, email, etc.).
- **buildAuditPhiOptions(request, user, action, opts)** — Builds options from request + user; use after auth for consistent `ip`, `requestId`, `route`.

### Endpoint → audit action mapping

| Method | Route | Audit action |
|--------|--------|---------------|
| GET | `/api/patients/[id]` | `patient:view` |
| PATCH | `/api/patients/[id]` | `patient:edit` |
| GET | `/api/stripe/invoices` (by patientId) | `invoice:view` |
| GET | `/api/stripe/invoices/[id]` | `invoice:view` |
| GET | `/api/invoices` | `invoice:view` |
| GET | `/api/reports/export` | `report:export` |
| GET | `/api/finance/metrics` | `financial:view` |
| POST | `/api/orders` | `order:create` |
| GET | `/api/messages/conversations` | `message:view` |
| GET | `/api/messages/conversations/[patientId]` | `message:view` |
| POST | `/api/messages/send` | `message:send` |

### Tests

- **tests/unit/audit/hipaa-audit-phi-access.test.ts**: Patient GET and report export trigger audit record; record contains `clinicId`, `userId`, `requestId`; no PHI fields stored in metadata; `buildAuditPhiOptions` extracts route and requestId from request.

---

## 7. Structured request logging (SOC2 / incident response)

Every authenticated API request logs a **request summary** (no PHI): `requestId`, `clinicId`, `userId`, `route`, `method`, `status`, `durationMs`.

- **Where**: `src/lib/auth/middleware.ts` — after handler execution and on error (503/500). Uses `logger.requestSummary(payload)` from `src/lib/logger.ts`.
- **Logger**: `logger.requestSummary({ requestId, clinicId?, userId?, route, method, status, durationMs })` — dev: console; production: Sentry breadcrumb.
- **Scope**: Routes using `withAuth`; cron/webhooks use their own requestId and logs.

---

## 8. Security regression guardrails

Tests enforce invariants (build fails on violation):

| Guardrail | Test | Location |
|-----------|------|----------|
| No API route uses `basePrisma` for clinic-scoped models unless allowlisted | Static scan of `src/app/api` for `basePrisma.<model>`; model must be in `BASE_PRISMA_ALLOWLIST` or path in allowlisted patterns (cron, webhooks, auth, super-admin, internal). | **tests/security/security-regression-guardrails.test.ts** |
| Prisma requires tenant context for clinic-scoped models | `prisma.patient.findMany` without context throws `TenantContextRequiredError`. | Same file. |
| prisma findUnique/findFirst only with tenant context | Static scan: files using `prisma.<tenantModel>.findUnique/findFirst` must contain `runWithClinicContext` or `withAuth`. | Same file. |
| Tenant mismatch returns 403/404 | Handlers use `ensureTenantResource` / `tenantNotFoundResponse`; see tenant-404-normalization tests. | **tests/tenant-isolation/tenant-404-normalization.test.ts** |
