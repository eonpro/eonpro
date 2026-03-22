# EONPro Architecture Audit — March 22, 2026

**Prepared for:** Technical Due Diligence  
**Scope:** Full codebase reverse-engineering — current state only  
**Auditor stance:** Principal engineer, acquisition due diligence

---

## 1. SYSTEM OVERVIEW

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Admin/Staff   │  │ Provider     │  │ Patient Portal / Affiliate│   │
│  │ Super Admin   │  │ Dashboard    │  │ Mobile (Expo RN)         │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘   │
└─────────┼─────────────────┼───────────────────────┼─────────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NEXT.JS 16 (App Router)                           │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ Edge       │  │ React Server │  │ API Routes (~674 route.ts)   │ │
│  │ Middleware  │  │ Components   │  │   /api/auth, /api/patients,  │ │
│  │ (clinic,   │  │ (SSR pages)  │  │   /api/orders, /api/cron,    │ │
│  │  auth,CSP) │  │              │  │   /api/webhooks, /api/stripe │ │
│  └────────────┘  └──────────────┘  └──────────────┬───────────────┘ │
│                                                    │                 │
│  ┌────────────────────────────────────────────────┐│                 │
│  │ Domain Layer (src/domains/)                     ││                 │
│  │  patient, order, provider, ticket, clinic,      ││                 │
│  │  prescription, intake, subscription, webhook    ││                 │
│  │  [repositories + services + types]              ││                 │
│  └────────────────────────────────────────────────┘│                 │
│  ┌────────────────────────────────────────────────┐│                 │
│  │ Service Layer (src/services/)                   ││                 │
│  │  stripe, billing, affiliate, ai, analytics,     ││                 │
│  │  notification, reporting, refill, sales-rep     ││                 │
│  └────────────────────────────────────────────────┘│                 │
└────────────────────────────────────────────────────┼─────────────────┘
                                                     │
    ┌───────────────────────┬────────────────────────┼──────────┐
    ▼                       ▼                        ▼          ▼
┌────────┐          ┌─────────────┐          ┌──────────┐  ┌────────┐
│Postgres│          │ Redis       │          │ AWS      │  │External│
│(RDS)   │          │ (Upstash)   │          │ S3/SES   │  │APIs    │
│        │          │ Cache/Queue │          │ KMS      │  │Stripe  │
│ Prisma │          │ Sessions    │          │          │  │Twilio  │
│ ORM    │          │ Rate-limit  │          │          │  │LifeFile│
│        │          │             │          │          │  │Zoom    │
└────────┘          └─────────────┘          └──────────┘  └────────┘
```

### 1.2 Core Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js | 20.x |
| **Framework** | Next.js (App Router) | 16.1.6 |
| **Language** | TypeScript (strict mode) | 5.4+ |
| **UI** | React | 19.2.1 |
| **ORM** | Prisma | 6.19.0 |
| **Database** | PostgreSQL | 14-15 (RDS) |
| **Cache** | Redis / Upstash | 7 / REST |
| **CSS** | Tailwind CSS | 3.4.x |
| **State (client)** | TanStack React Query + Zustand + SWR + Context | Mixed |
| **Auth** | JWT (jose) + Redis sessions | HS256 |
| **Payments** | Stripe (multiple accounts) | SDK 20.0.0 |
| **Email** | AWS SES + Nodemailer | — |
| **SMS** | Twilio | 5.10.6 |
| **Telehealth** | Zoom SDK | — |
| **Pharmacy** | LifeFile API (Axios) | Custom |
| **AI** | OpenAI | 6.9.1 |
| **Monitoring** | Sentry | 10.27.0 |
| **Queue** | BullMQ (declared, partially used) | 5.0.0 |
| **Testing** | Vitest + Playwright | 4.0.14 / 1.57.0 |

### 1.3 Deployment Model

**Primary: Vercel (Serverless)**
- Next.js serverless functions with 30s `maxDuration`
- 17 Vercel Cron jobs (see Section 8)
- `vercel.json` with custom build command and function config
- Standalone output for Docker compatibility

**Secondary: Docker (Staging/Production alternative)**
- Multi-stage Dockerfile (deps → builder → runner)
- docker-compose with Postgres 15, Redis 7, PgBouncer, Nginx
- Infrastructure Docker configs under `infrastructure/docker/`
- Production compose includes worker service

**Database:** PostgreSQL on AWS RDS (connection via serverless-optimized URL builder with PgBouncer support)

---

## 2. REQUEST FLOW TRACE

### 2.1 Typical Authenticated Request: `GET /api/patients/123`

```
1. CLIENT
   └─ Browser sends GET /api/patients/123
      Headers: Cookie: auth-token=<JWT>, selected-clinic=<clinicId>

2. EDGE MIDDLEWARE (src/middleware.ts)
   ├─ Security headers injected (CSP, HSTS, X-Frame-Options)
   ├─ CORS validation for API routes
   ├─ Request ID generated (x-request-id)
   └─ clinicMiddleware(request) → resolves clinic from:
      a. Subdomain → SUBDOMAIN_CLINIC_ID_MAP (env)
      b. selected-clinic cookie
      c. JWT payload
      Sets: x-clinic-id header, x-clinic-subdomain header

3. API ROUTE HANDLER (src/app/api/patients/[id]/route.ts)
   └─ withAuth(handler, { roles: [...], requireClinic: true })

4. AUTH MIDDLEWARE (src/lib/auth/middleware.ts)
   ├─ Extract JWT from Cookie (auth-token) or Authorization header
   ├─ jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] })
   ├─ Rate limit check (isAuthBlocked)
   ├─ Session validation via Redis (validateSession)
   ├─ Role check against options.roles
   ├─ Permission check against options.permissions (RBAC)
   ├─ Clinic context resolution:
   │   a. JWT clinicId
   │   b. x-clinic-id header
   │   c. selected-clinic cookie
   │   d. resolveSubdomainClinicId (env → Redis → DB)
   ├─ hasClinicAccess(userId, clinicId) check (Redis → DB)
   └─ runWithClinicContext(clinicId, handler)
      └─ AsyncLocalStorage sets { clinicId } for request scope

5. BUSINESS LOGIC (handler function)
   ├─ Parse request params/query/body
   ├─ Call domain service or directly use prisma
   └─ e.g., prisma.patient.findUnique({ where: { id: 123 } })

6. DATA ACCESS (src/lib/db.ts — PrismaWithClinicFilter)
   ├─ Proxy intercepts .patient.findUnique()
   ├─ createModelProxy('patient') wraps method
   ├─ applyClinicFilter(where, 'patient'):
   │   └─ Reads clinicId from AsyncLocalStorage
   │   └─ Adds { clinicId: N } to WHERE clause
   │   └─ Throws TenantContextRequiredError if missing
   ├─ Executes query via raw PrismaClient
   ├─ $use middleware logs slow queries (>200ms)
   ├─ Result validation (defense-in-depth):
   │   └─ Filters out records where clinicId ≠ context
   │   └─ Logs CRITICAL security event if mismatch found
   └─ Returns result

7. PHI DECRYPTION (if applicable)
   └─ Repository or service calls decryptPHI() on:
      firstName, lastName, email, phone, dob, address fields
      (AES-256-GCM, key from AWS KMS or env)

8. RESPONSE
   ├─ NextResponse.json(data, { status: 200 })
   ├─ Error path → handleApiError() → normalized ErrorResponse
   └─ Session activity update (Redis, fire-and-forget)
```

### 2.2 Sync vs Async Operations

| Operation | Type | Location |
|-----------|------|----------|
| JWT verification | **Sync** (crypto) | Auth middleware |
| Redis session check | **Async** | Auth middleware |
| Prisma queries | **Async** | All DB access |
| PHI decrypt (AES-256-GCM) | **Sync** (Node crypto) | Repository layer |
| LifeFile API calls | **Async** (Axios, 45s timeout) | Service layer |
| Stripe API calls | **Async** | Service layer |
| Twilio SMS | **Async** | Service layer |
| Session activity tracking | **Async fire-and-forget** | Auth middleware |
| Sentry breadcrumbs | **Sync** | Logger |
| SearchIndex heal | **Async fire-and-forget** | Prisma $use |

### 2.3 Where Business Logic Executes

Business logic is **not centralized**. It lives across:

1. **API route handlers** — Significant logic directly in `route.ts` files (validation, orchestration, direct Prisma calls)
2. **Domain services** (`src/domains/*/services/`) — Some business logic (patient merge, subscription lifecycle, order management)
3. **Service layer** (`src/services/`) — Heavy business logic (billing, analytics, affiliate, stripe, reporting)
4. **Lib utilities** (`src/lib/`) — Cross-cutting logic (scheduling, bloodwork, intake-forms, shipment-schedule)

---

## 3. DOMAIN & BUSINESS LOGIC DISTRIBUTION

### 3.1 Domain Structure (`src/domains/`)

The domain layer follows a **partial** repository-service pattern. Coverage is uneven:

| Domain | Repository | Service | Notes |
|--------|-----------|---------|-------|
| `patient` | Yes | Yes | Most complete. Has patient-merge.service |
| `provider` | Yes | Yes | |
| `order` | Yes | Yes | Has cancel-order sub-service |
| `clinic` | Yes | **No** | Repository only |
| `ticket` | Yes | Yes | Plus ticket-automation, ticket-csat, ticket-notification |
| `auth` | **No** | Yes | Service only |
| `prescription` | **No** | Yes | Service + duplicate-rx-check |
| `appointment` | **No** | Yes | Service only |
| `billing` | **No** | Yes (invoice.service) | Types defined |
| `document` | **No** | Yes | Service only |
| `soap-note` | **No** | Yes | Service only |
| `subscription` | **No** | Yes | Service only |
| `intake` | **No** | Yes | Complex: form-engine, templates, store |
| `dosespot` | **No** | Yes (4 services) | E-prescribing integration |
| `webhook` | **No** | Yes | Service only |
| `affiliate` | **No** | Yes | Service only |
| `shared` | — | — | Errors (AppError hierarchy) + types |

### 3.2 Service Layer (`src/services/`)

A **parallel** service layer exists outside domains with 73 files across 14 directories:

- `affiliate/` — Commission, attribution, fraud detection, IP intel, leaderboard, payout, tier
- `ai/` — OpenAI assistant, SOAP note AI, patient assistant, knowledge base
- `analytics/` — Patient, revenue, subscription analytics
- `billing/` — Invoice management, platform fees, clinic invoices, custom fee rules, billing analytics
- `stripe/` — Customer, payment, subscription sync, card sync, invoice, payment matching
- `reporting/` — Report engine, prescription reports, data sources, exporters
- `refill/` — Refill queue, plan defaults
- `notification/` — Notification events, notification service
- `provider/` — Compensation, routing
- `sales-rep/` — Attribution, disposition, commission
- `invoices/` — OT and WellMedR invoice generation
- `subscription/` — Lifecycle service

### 3.3 Logic Duplication and Scatter

**Identified duplication:**
1. **Stripe client instantiation** — Was duplicated across patient-portal routes (fixed recently per scratchpad), but the pattern of local `getStripe()` vs shared `requireStripeClient()` still risks recurrence
2. **Patient dosing schedule** — Identical parsing logic in `patient-portal/medications/page.tsx` and `patient-portal/welcome-kit/page.tsx`
3. **Clinic-scoped queries** — Some routes apply `clinicId` manually despite the automatic `PrismaWithClinicFilter`; these duplicate the tenant filter
4. **Data fetching strategy** — RSC, useEffect+fetch, SWR, and React Query all used in different places (no single standard)
5. **PHI decryption** — Called inconsistently: sometimes in repositories, sometimes in API routes, sometimes in page components

**Logic scatter:**
- `src/lib/scheduling/` — Scheduling service lives in `lib`, not in a domain
- `src/lib/bloodwork/` — Bloodwork service in `lib`
- `src/lib/shipment-schedule/` — Shipment scheduling in `lib`
- `src/lib/intake-forms/` — Intake form service in `lib`
- `src/lib/billing/` — Superbill service in `lib`
- `src/lib/dosespot/` — DoseSpot client in `lib`, services in `domains/dosespot`

---

## 4. DATA ARCHITECTURE

### 4.1 Database Structure

**Engine:** PostgreSQL 14/15 on AWS RDS  
**ORM:** Prisma 6.19.0 with multi-file schema (`prisma/schema/` — 24 files)

**Model count:** ~120+ models  
**Enum count:** ~50+ enums  
**Migration count:** 100+

#### Core Model Groups

**Clinical:**
- `Patient` — Core entity. Has `clinicId`, `searchIndex`, encrypted PHI fields, `profileStatus` enum
- `Order` — Prescription orders. Links to Patient, Provider, Rx items. Status enum. `lifefileOrderId` for pharmacy
- `Rx` — Individual prescriptions within an Order
- `SOAPNote` — Clinical documentation. Status enum. AI-assisted
- `LabReport` / `LabReportResult` — Lab results
- `CarePlan` / `CarePlanGoal` / `CarePlanActivity` — Treatment plans
- `Appointment` — Scheduling with status management
- `TelehealthSession` — Zoom telehealth sessions

**Billing & Payments:**
- `Invoice` / `InvoiceItem` — Multi-type invoicing (pharmacy, platform, clinic)
- `Payment` — Linked to Stripe. Status enum
- `PaymentReconciliation` — Stripe-to-internal matching
- `PaymentMethod` — Stored payment methods
- `Subscription` / `SubscriptionAction` — Recurring billing
- `Product` / `ProductBundle` / `PricingRule` — Catalog
- `Superbill` / `SuperbillItem` / `BillingCode` — Medical billing codes

**Multi-Tenancy:**
- `Clinic` — Tenant entity. Branding, features, LifeFile config
- `UserClinic` — Junction: User ↔ Clinic (many-to-many)
- `ProviderClinic` — Junction: Provider ↔ Clinic (many-to-many)
- `ClinicInviteCode` — Clinic onboarding

**Auth & Audit:**
- `User` — Authentication entity. Role enum, status enum
- `UserSession` — Redis-backed session tracking
- `LoginAudit` — Login event log
- `AuditLog` / `UserAuditLog` / `ClinicAuditLog` — General audit
- `HIPAAAuditEntry` — PHI access audit (HIPAA compliance)
- `PatientAudit` / `ProviderAudit` / `OrderEvent` — Entity-specific audit

**Affiliate & Sales:**
- `Affiliate` / `AffiliateApplication` — Affiliate management
- `AffiliateRefCode` / `AffiliateTouch` — Attribution tracking
- `AffiliateCommission*` — Commission plans, events, payouts
- `PatientSalesRepAssignment` — Sales rep attribution
- `SalesRepCommission*` — Sales rep compensation

**Intake:**
- `IntakeFormTemplate` / `IntakeFormQuestion` — Form definitions
- `IntakeFormSubmission` / `IntakeFormResponse` — Form data
- `IntakeFormLink` — Public intake links

**Support:**
- `Ticket` / `TicketComment` / `TicketAssignment` — Help desk
- `TicketSLA` / `TicketEscalation` / `TicketStatusHistory` — SLA management
- `TicketAutomationRule` / `TicketMacro` — Automation

**Communication:**
- `InternalMessage` / `MessageReaction` — Staff messaging
- `PatientChatMessage` — Patient-provider chat
- `SmsLog` / `SmsOptOut` / `SmsQuietHours` / `SmsRateLimit` — SMS compliance
- `EmailLog` / `ScheduledEmail` — Email tracking
- `Notification` — Push/in-app notifications

### 4.2 Read vs Write Patterns

**Read-heavy paths (hot):**
- Patient detail page: 6+ parallel queries (patient + orders + documents + intake + audit + sales reps)
- Admin patient list: Paginated with PHI decryption loop
- Provider prescription queue: Multi-clinic join across Order + Rx + Patient
- Dashboard analytics: Aggregation queries across Payment, Order, Subscription
- Finance routes: GroupBy aggregations, cohort analysis

**Write-heavy paths:**
- Intake form submission: Transaction (Patient + Order + IntakeFormSubmission + IntakeFormResponse)
- Payment processing: Transaction (Order + Payment + Subscription + potentially LifeFile call after commit)
- Webhook processing: LifeFile status updates, Stripe events
- Cron jobs: Batch updates (refill queue, shipment tracking, invoice generation)

### 4.3 N+1 Risks and Heavy Query Patterns

**Known N+1 (identified in scratchpad):**
- `getAtRiskPatients` in `patientAnalytics.ts` — was N+1 per patient (fixed to batch groupBy)
- PHI decryption in list views — each patient requires per-field `decryptPHI()` in a loop
- Admin patient list — no cursor-based pagination visible; offset-based with decrypt loop

**Heavy query patterns:**
- Patient detail RSC (`src/app/patients/[id]/page.tsx`): Monolithic server component with `force-dynamic`, 6+ parallel queries, 20-25s wall clock time documented
- Finance patient analytics: Full table scans with complex aggregations
- Invoice generation: Cross-tenant queries requiring `withoutClinicFilter` or `basePrisma`
- Report engine: Dynamic query building with potential for unbounded result sets

**Missing indexes (documented in scratchpad):**
- `Provider` — Missing `@@index([clinicId])`
- `ProviderAvailability` — Missing `@@index([providerId, clinicId])`
- `Appointment` — Missing `@@index([clinicId, startTime])`
- `Order` — Missing `@@index([clinicId, createdAt])`

### 4.4 Caching

**Redis (Upstash REST):** `src/lib/cache/redis.ts`
- Tenant-scoped cache: `tenantGet/tenantSet/tenantDelete` with `clinic:{clinicId}:*` keys
- Middleware cache: Subdomain→clinicId (5 min TTL), clinic access (60s TTL)
- Finance cache: `finance:{clinicId}:{category}` with tiered TTLs (30s-300s)
- Session activity tracking (Redis-only, no DB)
- Rate limiting keys
- In-memory fallback when Redis unavailable

**In-memory (LRU):**
- `lru-cache` dependency present (v11.2.2)
- LifeFile client cache (`Map<string, AxiosInstance>`)
- KMS encryption key cache (5 min TTL)

**What is NOT cached:**
- Patient detail page data (`force-dynamic`, no caching)
- Most API route responses (no HTTP caching headers beyond `no-store`)
- PHI decryption results (re-decrypted on every access)
- Dashboard queries (except admin dashboard with React Query `staleTime: 30s`)

---

## 5. WORKFLOW & STATE MANAGEMENT

### 5.1 Status Fields and Enums

The system uses **enumerated status fields** on models — there is **no centralized workflow engine**.

**Key status enums:**

| Entity | Status Enum | Values |
|--------|-------------|--------|
| Patient | `ProfileStatus` | LEAD, INTAKE_STARTED, INTAKE_COMPLETED, ACTIVE, ON_HOLD, CHURNED, INACTIVE |
| Order | (status field) | pending, approved, processing, shipped, delivered, cancelled, error, declined |
| Rx | (status field) | queued, submitted, dispensed, cancelled |
| Invoice | `InvoiceStatus` | DRAFT, PENDING, SENT, PAID, OVERDUE, CANCELLED, VOID |
| Payment | `PaymentStatus` | PENDING, COMPLETED, FAILED, REFUNDED, DISPUTED |
| SOAPNote | `SOAPNoteStatus` | DRAFT, IN_REVIEW, SIGNED, AMENDED, LOCKED |
| Subscription | `SubscriptionStatus` | ACTIVE, PAUSED, CANCELLED, PAST_DUE, TRIAL |
| Ticket | `TicketStatus` | OPEN, IN_PROGRESS, WAITING_ON_CUSTOMER, WAITING_ON_INTERNAL, RESOLVED, CLOSED |
| Affiliate | `InfluencerStatus` | PENDING, ACTIVE, INACTIVE, BANNED |
| User | `UserStatus` | ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION |

### 5.2 Order Lifecycle (Core Entity)

```
                    ┌─────────┐
                    │  LEAD   │ (IntakeFormSubmission)
                    └────┬────┘
                         │ intake-processor / lead-transition.service
                         ▼
                    ┌─────────┐
                    │ PATIENT │ (Patient created/matched)
                    │ ACTIVE  │
                    └────┬────┘
                         │ Provider creates Rx
                         ▼
┌──────────┐       ┌─────────┐
│ Rx items │──────▶│  ORDER  │ status: 'pending'
│ (queued) │       │ created │
└──────────┘       └────┬────┘
                        │ Provider approves
                        ▼
                   ┌──────────┐
                   │ approved │ → LifeFile createFullOrder()
                   └────┬─────┘
                        │ LifeFile responds
                        ▼
                   ┌────────────┐
                   │ processing │ lifefileOrderId set
                   └────┬───────┘
                        │ LifeFile webhook / tracking
                        ▼
                   ┌──────────┐
                   │ shipped  │ FedEx tracking attached
                   └────┬─────┘
                        │ Delivery confirmation
                        ▼
                   ┌───────────┐
                   │ delivered │
                   └───────────┘

Error paths:
  pending → cancelled (manual cancel)
  pending → error (validation failure)
  pending → declined (provider decline)
  processing → error (LifeFile failure)
```

### 5.3 Patient Lifecycle

```
LEAD → INTAKE_STARTED → INTAKE_COMPLETED → ACTIVE → ON_HOLD/CHURNED/INACTIVE
                                              ↑
                                              │ (reactivation)
                                              │
                                           CHURNED
```

State transitions are managed by:
- `lead-transition.service.ts` — LEAD → ACTIVE conversion on intake completion
- Direct status updates in various API routes
- Subscription lifecycle events (ACTIVE → CHURNED on cancel)

### 5.4 No Centralized Workflow Engine

State transitions are scattered across:
1. API route handlers (direct `prisma.order.update({ status })`)
2. Domain services (e.g., `order.service.ts` cancel method)
3. Webhook handlers (LifeFile status updates, Stripe subscription events)
4. Cron jobs (refill escalation, subscription checks)

There is **no state machine library**, **no event bus**, and **no saga/orchestration pattern**. Transitions are imperative updates validated by business logic in each handler.

---

## 6. MULTI-TENANCY MODEL

### 6.1 Tenant Isolation Architecture

EONPro uses **row-level multi-tenancy** with `clinicId` as the tenant discriminator. Isolation is enforced at multiple layers:

```
Layer 1: Edge Middleware (src/middleware.ts + src/middleware/clinic.ts)
  └─ Resolves clinicId from subdomain/cookie/JWT
  └─ Sets x-clinic-id header

Layer 2: Auth Middleware (src/lib/auth/middleware.ts)
  └─ Validates user has access to clinic (hasClinicAccess)
  └─ Calls runWithClinicContext(clinicId, handler)
  └─ Sets AsyncLocalStorage context

Layer 3: Data Access (src/lib/db.ts — PrismaWithClinicFilter)
  └─ Proxy intercepts all model operations
  └─ Injects clinicId into WHERE (reads) and DATA (writes)
  └─ Throws TenantContextRequiredError if context missing
  └─ Defense-in-depth: validates result clinicIds match context

Layer 4: RBAC (src/lib/rbac/permissions.ts)
  └─ Verifies resource.clinicId === ctx.clinicId for clinic-scoped ops
```

### 6.2 Clinic Context Propagation

```typescript
// AsyncLocalStorage (preferred, thread-safe)
const clinicContextStorage = new AsyncLocalStorage<{
  clinicId?: number;
  bypassFilter?: boolean;  // for withoutClinicFilter
}>();

// Resolution order:
// 1. JWT payload clinicId
// 2. x-clinic-id header (set by Edge middleware)
// 3. selected-clinic cookie
// 4. resolveSubdomainClinicId(hostname) → env map → Redis → DB
```

### 6.3 Clinic-Isolated Models

`CLINIC_ISOLATED_MODELS` in `src/lib/db.ts` lists **92 models** that require clinicId filtering, including all core clinical, billing, and operational models.

### 6.4 basePrisma Allowlist

`BASE_PRISMA_ALLOWLIST` permits **36 models** to be accessed via the raw `basePrisma` (without automatic tenant filter). These are:
- Auth/system models (clinic, user, userClinic, providerClinic)
- Cross-tenant admin operations (affiliate aggregations, platform invoices)
- Cron/webhook lookups that need to resolve clinicId first (patient by phone, scheduledEmail)
- Models guarded by `withSuperAdminAuth` or `verifyCronAuth`

### 6.5 Areas Where Tenant Safety Could Break

1. **basePrisma allowlist is wide.** 36 models can bypass tenant filtering. If a non-super-admin route uses `basePrisma.patient` (allowlisted for webhook lookups), it could access cross-tenant patients without the security check being enforced at the Prisma level.

2. **Global deprecated fallback.** `globalForPrisma.currentClinicId` (global mutable state) is still the fallback when `AsyncLocalStorage` has no store. In concurrent serverless executions sharing a warm container, this could theoretically leak context between requests (though the ALS path should always be set by auth middleware).

3. **PrismaWithClinicFilter property getters.** Several models that ARE in `CLINIC_ISOLATED_MODELS` are returned from the wrapper **without** the proxy — they pass through to `this.client.*` directly:
   - `patientWaterLog`, `patientExerciseLog`, `patientSleepLog`, `patientNutritionLog`, `patientWeightLog`, `patientMedicationReminder` — Marked "isolated via Patient relationship" but no automatic clinicId filtering
   - `affiliate`, `affiliateApplication`, `affiliateRefCode`, etc. — Returned via `this.client.*` (no proxy), despite being in `CLINIC_ISOLATED_MODELS`
   - This means the fallback Proxy on the export catches these, but only for dynamic access — explicit typed access via getters bypasses the proxy

4. **$queryRaw and $executeRaw** — Pass through directly to the base PrismaClient with no tenant filtering. Any raw SQL must manually include `WHERE clinic_id = $1`.

5. **Transactions** — The `$transaction` method wraps the callback in a new `PrismaWithClinicFilter`, but relies on `AsyncLocalStorage` being propagated. If a transaction is started outside `runWithClinicContext`, the filter won't be applied.

---

## 7. INTEGRATIONS & EXTERNAL SYSTEMS

### 7.1 Integration Map

```
┌─────────────────────────────────────────────────────────────┐
│                     EONPro Platform                          │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ LifeFile    │  │ Stripe      │  │ Twilio              │ │
│  │ Pharmacy    │  │ Payments    │  │ SMS/Chat            │ │
│  │             │  │             │  │                     │ │
│  │ Axios       │  │ stripe SDK  │  │ twilio SDK          │ │
│  │ + circuit   │  │ multi-acct  │  │ + conversations     │ │
│  │   breaker   │  │ (EonMeds,   │  │                     │ │
│  │ 45s timeout │  │  OT, WMR,   │  │                     │ │
│  │             │  │  Connect)   │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────────────┘ │
│         │                │                │                 │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────────────┐ │
│  │ AWS S3      │  │ Zoom        │  │ OpenAI              │ │
│  │ Document    │  │ Telehealth  │  │ AI Services         │ │
│  │ storage     │  │ meeting     │  │ SOAP notes          │ │
│  │             │  │ provisioning│  │ Patient assistant   │ │
│  │ AWS SES     │  │             │  │                     │ │
│  │ Email       │  │             │  │                     │ │
│  │             │  │             │  │                     │ │
│  │ AWS KMS     │  │             │  │                     │ │
│  │ PHI encrypt │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ DoseSpot    │  │ Google      │  │ Terra API           │ │
│  │ e-Prescribe │  │ Maps/Cal    │  │ Wearables           │ │
│  │ 4 services  │  │ OAuth       │  │ health data         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ FedEx       │  │ SmartyStr.  │  │ Microsoft           │ │
│  │ Shipping    │  │ Address     │  │ Graph API           │ │
│  │ tracking    │  │ validation  │  │ (Azure MSAL)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Integration Detail

| Service | Files | Pattern | Sync/Async |
|---------|-------|---------|------------|
| **LifeFile** | `src/lib/lifefile.ts`, `src/lib/clinic-lifefile.ts`, webhook routes | Axios client with Basic Auth, circuit breaker, 45s timeout. Per-clinic credentials from DB or env. | Async (API calls), Webhooks for inbound |
| **Stripe** | `src/lib/stripe.ts`, `src/lib/stripe/config.ts`, `src/lib/stripe/connect.ts`, `src/services/stripe/*` | Multi-account: EONMEDS, OT, WellMedR, Connect. Shared `requireStripeClient()` + context-aware key resolution. | Async. Webhooks for events |
| **Twilio** | `src/lib/integrations/twilio/*` | SMS service, chat service, chat token service. Configurable timeouts. | Async |
| **AWS S3** | `src/lib/integrations/aws/*`, `src/app/api/v2/aws/s3/*` | Pre-signed URLs, document upload/download | Async |
| **AWS SES** | `src/app/api/v2/aws/ses/*` | Email sending via SES SDK | Async |
| **AWS KMS** | `src/lib/security/kms.ts` | PHI encryption key management. 5-min cache. | Async |
| **Zoom** | `src/lib/integrations/zoom/*` | Meeting provisioning, telehealth session management | Async |
| **OpenAI** | `src/services/ai/*` | SOAP note generation, patient assistant (Becca AI), knowledge base | Async |
| **DoseSpot** | `src/domains/dosespot/*` | E-prescribing: patient, prescription, provider, SSO services | Async |
| **Google** | `src/lib/integrations/` | Maps (address autocomplete), Calendar (provider calendar sync), OAuth | Async |
| **FedEx** | Cron-based tracking (`/api/cron/fedex-tracking`) | Shipment tracking polling | Async (cron) |
| **Terra** | `src/lib/integrations/terra/*` | Wearable device health data | Async |
| **SmartyStreets** | Referenced in env | Address validation | Async |

### 7.3 Webhook Handling

**Inbound webhooks:**
- `/api/webhooks/lifefile/inbound/[clinicSlug]` — LifeFile order status updates (Basic Auth)
- `/api/webhooks/lifefile-data-push` — LifeFile data push
- `/api/webhooks/stripe-connect` — Stripe Connect events
- `/api/webhooks/twilio/*` — Twilio message/call status
- `/api/webhooks/wellmedr-invoice` — WellMedR invoice events

**Outbound webhooks:**
- `WebhookConfig` + `WebhookDelivery` models for configurable outbound webhooks
- `IdempotencyRecord` model for deduplication

---

## 8. BACKGROUND PROCESSING

### 8.1 Vercel Cron Jobs

17 cron routes scheduled via `vercel.json`:

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/ping` | Every 5 min | Keep-alive |
| `/api/cron/health-monitor` | Every 5 min | System health check |
| `/api/cron/portal-health` | Every 5 min | Patient portal health |
| `/api/cron/process-message-queue` | Every 5 min | Message queue processing |
| `/api/cron/process-scheduled-emails` | Every 5 min | Send scheduled emails |
| `/api/cron/comms-health` | Every 15 min | Communications health |
| `/api/integrations/overtime/sync` | Every 15 min | OT clinic data sync |
| `/api/scheduling/reminders/process` | Every 10 min | Appointment reminders |
| `/api/cron/refill-scheduler` | Every hour | Prescription refill scheduling |
| `/api/cron/report-delivery` | Every hour | Scheduled report delivery |
| `/api/cron/fedex-tracking` | Every 3 hours | FedEx tracking updates |
| `/api/cron/refill-escalation` | Every 4 hours | Escalate overdue refills |
| `/api/cron/daily-queue-summary` | 1 PM daily | Daily queue summary email |
| `/api/cron/invoice-reminders` | 9 AM daily | Invoice payment reminders |
| `/api/cron/shipment-reminders` | 10 AM daily | Shipment update reminders |
| `/api/cron/email-digest` | 9 AM Mondays | Weekly email digest |
| `/api/cron/platform-fees` | Midnight Mondays | Platform fee processing |

Additional cron routes exist but may not be in `vercel.json`:
- `/api/cron/affiliate-data-retention`
- `/api/cron/affiliate-payouts`
- `/api/cron/competition-scores`
- `/api/cron/reconcile-payments`
- `/api/cron/process-eonpro-queue`

### 8.2 Queue System

**BullMQ (declared):** `src/lib/queue/jobQueue.ts`
- Queue class with Redis connection config
- Job types: SEND_EMAIL, SEND_SMS, GENERATE_REPORT, PROCESS_PAYMENT, etc.
- Worker processing with retry logic
- **Status: Defined but likely not actively used in Vercel serverless** (BullMQ requires persistent Redis workers)

**Dead Letter Queue:** `src/lib/queue/deadLetterQueue.ts`
- Upstash Redis-based DLQ for failed EONPro submissions

**Resilience queue:** `src/lib/resilience/message-queue.ts`
- Message queue with retry handling

### 8.3 Retry Handling and Idempotency

- `IdempotencyRecord` Prisma model exists for deduplication
- BullMQ configured with retry options (backoff strategies)
- LifeFile client has circuit breaker pattern (`src/lib/resilience/circuitBreaker.ts`)
- Webhook delivery includes retry infrastructure
- **Actual idempotency enforcement is route-specific, not universal**

---

## 9. ERROR HANDLING & LOGGING

### 9.1 Error Handling Strategy

**Centralized error hierarchy:** `src/domains/shared/errors/AppError.ts`

```
AppError (base)
├── BadRequestError (400)
├── ValidationError (400, with field details)
├── NotFoundError (404)
├── ForbiddenError (403)
├── ConflictError (409)
├── InternalError (500)
├── DatabaseError (500)
├── ExternalServiceError (502)
└── ServiceUnavailableError (503, with Retry-After)
```

**Error handling wrappers:**
1. `handleApiError(error, options)` — Normalizes any error to `AppError`, returns `NextResponse`
2. `withErrorHandler(handler)` — Wraps handler with try/catch → `handleApiError`
3. `withApiHandler(handler)` — Full wrapper with request ID, Sentry tracing, metrics

**Error normalization converts:**
- `ZodError` → `ValidationError` with field-level details
- Prisma errors → Appropriate status (P2002→409, P2025→404, P2024→503)
- `TenantContextRequiredError` → `ForbiddenError` (403)
- `DoseSpotError` → Mapped by status code
- Connection errors → `ServiceUnavailableError` (503) with `Retry-After`

### 9.2 Logging Strategy

**Logger:** `src/lib/logger.ts` — Singleton `Logger` class

| Method | Behavior (Dev) | Behavior (Prod) |
|--------|---------------|-----------------|
| `debug()` | Console output | Suppressed |
| `info()` | Console output | Sentry breadcrumb |
| `warn()` | Console output | Sentry `captureMessage` (warning) |
| `error()` | Console output | Sentry `captureException` |
| `api()` | Console output | Sentry breadcrumb (http) |
| `db()` | Console output | Sentry breadcrumb (query) |
| `webhook()` | Console output | Sentry breadcrumb |
| `security()` | **Always** console | **Always** Sentry warning |
| `requestSummary()` | Console output | Sentry breadcrumb |

**HIPAA compliance:** `LogContext` type encourages IDs-only logging. PHI fields are documented as forbidden.

### 9.3 Observability

- **Sentry:** Full integration with `@sentry/nextjs` v10.27.0
  - Client config: `sentry.client.config.ts`
  - Server config: `sentry.server.config.ts`
  - Tracing via `Sentry.startSpan` in `withApiHandler`
  - Error tracking, breadcrumbs, performance monitoring
  - Disabled on Vercel Edge runtime
- **Vercel Analytics:** `@vercel/analytics` v1.6.1
- **Vercel Speed Insights:** `@vercel/speed-insights` v1.3.1
- **Request metrics:** `emitRequestMetrics` in `withApiHandler` (route, method, status, duration)
- **Slow query logging:** Prisma `$use` middleware logs queries >200ms
- **No structured log aggregation** (no Datadog, CloudWatch, ELK in production path)

---

## 10. SECURITY & COMPLIANCE STRUCTURE

### 10.1 Authentication System

**JWT-based with Redis session validation:**

```
Token Flow:
1. Login → POST /api/auth/login
   └─ Verify credentials (bcrypt)
   └─ Create session in Redis
   └─ Issue JWT (HS256, 8h access, 7d refresh)
   └─ Set cookie (auth-token, HttpOnly, Secure, SameSite=Lax)

2. Request → Auth middleware
   └─ Extract JWT from cookie or Authorization header
   └─ jose.jwtVerify (HS256)
   └─ validateSession (Redis)
   └─ Rate limit check
   └─ Inject AuthUser into handler

3. Refresh → POST /api/auth/refresh-token
   └─ Verify refresh token
   └─ Issue new access + refresh tokens
```

**Cookie-based token storage:**
- `auth-token` — Primary admin/staff/provider session
- `patient-token` — Patient portal session
- `affiliate_session` — Affiliate dashboard (30-day)
- `selected-clinic` — Multi-clinic context
- Role-specific cookies: `admin-token`, `provider-token`, `staff-token`, `pharmacy_rep-token`, `sales_rep-token`

**Additional auth features:**
- 2FA via `speakeasy` (TOTP)
- Phone OTP verification
- Email verification tokens
- Password reset tokens
- Account lockout after failed attempts (`isAuthBlocked`)

### 10.2 Role-Based Access Control

**9 roles defined in `UserRole` type:**

| Role | Scope | Key Permissions |
|------|-------|----------------|
| `super_admin` | Cross-tenant | All permissions, `admin:cross-tenant` |
| `admin` | Single clinic | All permissions except cross-tenant |
| `provider` | Clinic + assigned patients | Clinical ops, order create, limited financial |
| `staff` | Single clinic | Patient view/edit, order view, message |
| `pharmacy_rep` | Single clinic | Order view, limited patient view |
| `support` | Single clinic | Ticket management, message, patient view |
| `sales_rep` | Clinic + assigned patients | Patient view/edit, order view/create, message |
| `patient` | Own data only | Self-view, billing, portal features |
| `affiliate` | Own affiliate data | Affiliate view, referral tracking |

**RBAC middleware wrappers:**
- `withAuth` — Base auth (any authenticated user)
- `withSuperAdminAuth` — `super_admin` only
- `withAdminAuth` — `super_admin`, `admin`
- `withProviderAuth` — `super_admin`, `admin`, `provider`
- `withClinicalAuth` — `super_admin`, `admin`, `provider`, `staff`, `pharmacy_rep`, `sales_rep`
- `withSupportAuth` — `super_admin`, `admin`, `support`
- `withPharmacyAccessAuth` — `super_admin`, `admin`, `pharmacy_rep`
- `withAffiliateAuth` — `affiliate`
- `withPatientAuth` — `patient`

### 10.3 PHI Handling

**Encryption at rest:**
- AES-256-GCM via `src/lib/security/phi-encryption.ts`
- Format: `base64(iv):base64(authTag):base64(ciphertext)`
- Fields: firstName, lastName, email, phone, dob, address1, address2, city, state, zip
- Key management: AWS KMS (production) or `ENCRYPTION_KEY` env (dev)
- Key rotation support via `reencryptPHI()`
- Searchable encryption via `src/lib/security/phi-search.ts`

**PHI anonymization:**
- `src/lib/security/phi-anonymization.ts` — For AI/third-party calls

**Audit trail:**
- `HIPAAAuditEntry` model for PHI access logging
- `hipaaAudit.log()` for recording access events
- `PatientAudit`, `ProviderAudit`, `OrderEvent` for entity-level changes
- `LoginAudit` for authentication events

**Security headers (Edge middleware):**
- Content-Security-Policy (strict)
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN
- Strict-Transport-Security (HSTS with preload)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy (camera, microphone restricted)

---

## 11. DEPENDENCY GRAPH

### 11.1 Module Dependencies

```
src/middleware.ts
  └─ src/middleware/clinic.ts

src/app/api/**/*.ts (API routes)
  ├─ src/lib/auth/middleware.ts (withAuth, etc.)
  │   ├─ src/lib/auth/config.ts (JWT_SECRET, AUTH_CONFIG)
  │   ├─ src/lib/auth/session-manager.ts
  │   ├─ src/lib/auth/middleware-cache.ts (Redis)
  │   ├─ src/lib/cache/redis.ts
  │   └─ src/lib/db.ts (prisma, basePrisma, runWithClinicContext)
  │       ├─ src/lib/database/serverless-pool.ts
  │       ├─ src/lib/database/connection-pool.ts
  │       └─ src/lib/logger.ts → @sentry/nextjs
  ├─ src/domains/shared/errors/handler.ts (handleApiError)
  │   └─ src/domains/shared/errors/AppError.ts
  ├─ src/domains/*/services/*.ts
  │   └─ src/domains/*/repositories/*.ts
  │       └─ src/lib/db.ts
  ├─ src/services/**/*.ts
  │   ├─ src/lib/db.ts
  │   ├─ src/lib/stripe.ts / src/lib/stripe/config.ts
  │   ├─ src/lib/integrations/**
  │   └─ src/lib/security/phi-encryption.ts
  └─ src/lib/**/*.ts (various utilities)

src/app/**/page.tsx (Pages)
  ├─ src/components/**/*.tsx
  │   ├─ src/hooks/*.ts
  │   ├─ src/lib/api/fetch.ts (client-side API calls)
  │   └─ src/lib/auth/AuthContext.tsx
  └─ src/lib/db.ts (for server components)
```

### 11.2 Tight Coupling Areas

1. **`src/lib/db.ts` is the most critical single file in the system.** Every data operation flows through it. The `PrismaWithClinicFilter` class, `CLINIC_ISOLATED_MODELS`, `BASE_PRISMA_ALLOWLIST`, and context management are all in this ~1,500 line file. Any change here affects the entire application.

2. **Auth middleware ↔ Database.** `src/lib/auth/middleware.ts` directly imports `prisma`, `basePrisma`, `runWithClinicContext` from `db.ts`, plus Redis cache, session manager, and HIPAA audit. It's a convergence point for auth, tenancy, caching, and database concerns.

3. **API routes ↔ Prisma (direct coupling).** Many API routes import `prisma` directly and execute queries inline instead of going through domain repositories/services. This creates tight coupling between the presentation layer and data access.

4. **LifeFile integration ↔ Order processing.** LifeFile calls are tightly coupled to order workflows. The pharmacy integration doesn't have a clean adapter interface — it's called directly from multiple API routes and services.

5. **Stripe multi-account ↔ Clinic context.** Stripe key resolution depends on `EONMEDS_STRIPE_*`, `OVERTIME_STRIPE_*`, `WELLMEDR_STRIPE_*`, and `STRIPE_*` env vars with a fallback chain. The logic for which Stripe account to use is spread across `src/lib/stripe/config.ts`, `src/lib/stripe/context.ts`, and individual API routes.

6. **Frontend ↔ Inline business logic.** Server components (`page.tsx`) contain significant data fetching and transformation logic, including PHI decryption, query orchestration, and business rules — all directly in the page file.

### 11.3 Circular / Hidden Dependencies

- `src/lib/db.ts` dynamically imports `@/lib/utils/search-index-heal` inside the Prisma `$use` middleware (via `import()`)
- `src/lib/db.ts` conditionally requires `@/lib/database/circuit-breaker/guardrails` and `@/lib/observability/metrics` at runtime
- `src/domains/shared/errors/handler.ts` imports `DoseSpotError` from `@/lib/dosespot` — domain error layer depends on integration library

---

## 12. BOTTLENECK HYPOTHESIS (Current State Only)

### B1: Patient Detail Page — Monolithic RSC with 20s+ Wall Clock

**File:** `src/app/patients/[id]/page.tsx`  
**Evidence:** Documented in scratchpad. 6+ parallel queries, PHI decryption, `force-dynamic`, no streaming. A 4-second reload safety timer in `loading.tsx` creates reload loops.  
**Impact:** Primary user-facing performance issue. Providers experience skeleton screens for 8-25 seconds.

### B2: Connection Pool Exhaustion Under Load

**Evidence:** Vercel serverless has 3 connections per instance. Patient detail runs 5+ concurrent `Promise.all` queries. Production P2024 errors documented. `getServerlessConfig()` acknowledges this with aggressive limits.  
**Impact:** Under concurrent traffic, queries queue behind pool exhaustion, cascading into timeouts across all routes.

### B3: PHI Decryption on Every Access

**Evidence:** `decryptPHI()` (AES-256-GCM) runs synchronously on up to 10 fields per patient, every time data is accessed. In list views, this happens in a loop. No caching of decrypted results.  
**Impact:** CPU-bound work in serverless functions. O(n) per patient in list views.

### B4: PrismaWithClinicFilter Proxy Overhead

**Evidence:** Every Prisma model operation goes through a JavaScript Proxy that: reads AsyncLocalStorage, modifies args, validates results. This adds per-query overhead.  
**Impact:** Overhead is small per-query but compounds across the 150+ files that use Prisma. Defense-in-depth result validation adds a post-query array filter on every `findMany`.

### B5: Inconsistent Data Fetching — No Single Cache Strategy

**Evidence:** RSC server components, `useEffect+fetch`, SWR, React Query all used in different areas. Only admin dashboard has `staleTime`. Patient portal uses a mix. Many routes set `Cache-Control: no-store`.  
**Impact:** Duplicate fetches, no request deduplication, no stale-while-revalidate for most data paths. Every navigation triggers fresh DB queries.

### B6: No Background Worker in Vercel

**Evidence:** BullMQ is declared (`src/lib/queue/jobQueue.ts`) but requires persistent Redis workers. Vercel serverless can't run persistent workers. All "background" processing happens via 17 cron routes with 30s max duration.  
**Impact:** Complex async workflows (invoice generation, report delivery, payment reconciliation) are constrained to 30-second HTTP request windows. No true async processing.

### B7: Large Prisma Schema (120+ Models)

**Evidence:** Schema spans 24 files, 6,464+ lines, 120+ models, 50+ enums. Prisma Client generation is significant. Build script runs `rm -rf node_modules/.prisma && prisma generate` on every build.  
**Impact:** Cold start time for serverless functions includes Prisma Client initialization. Build times are longer. Schema changes risk cascading migration complexity.

### B8: TypeScript Build Ignores Errors

**Evidence:** `next.config.js` has `typescript.ignoreBuildErrors: true`.  
**Impact:** Type errors can reach production undetected. This masks potential runtime failures, especially in the complex multi-tenant proxy system where type safety is critical.

### B9: Single Point of Failure — `src/lib/db.ts`

**Evidence:** 1,484 lines. Contains: PrismaClient creation, connection pooling, tenant isolation logic, model proxying, transaction wrapping, health monitoring, shutdown handlers, context management, and all data access exports.  
**Impact:** Any bug in this file affects the entire application. The file is too large and handles too many concerns to be safely modified.

### B10: Webhook Processing Reliability

**Evidence:** LifeFile webhooks, Stripe webhooks, and Twilio webhooks are processed synchronously in serverless functions with 30s timeout. No dead letter queue for webhook failures (except a DLQ for EONPRO submissions). Circuit breaker exists for outbound calls but not for inbound webhook processing.  
**Impact:** If webhook processing exceeds 30s or fails, the event may be lost (depending on the external service's retry policy).

---

*End of Architecture Audit — March 22, 2026*  
*This document represents the current state of the EONPro codebase as observed through static analysis. No recommendations for improvement are included per scope.*
