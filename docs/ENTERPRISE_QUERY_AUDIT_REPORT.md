# ========================================
# EONPRO ENTERPRISE QUERY AUDIT REPORT
# ========================================
#
# Date: 2026-02-17
# Platform: EONpro Healthcare SaaS
# Runtime: Next.js 16 / Webpack / Vercel Serverless
# Database: PostgreSQL (Neon/RDS) via Prisma
# Connection Config: connection_limit=1 (no external pooler), =3 (with RDS Proxy)
# Tenant Model: PrismaWithClinicFilter (AsyncLocalStorage)
# Total API Routes Scanned: 484
# Total Prisma Queries Audited: 400+
# Scope: Full production architecture audit

---

## SECTION 1: Route Risk Matrix

> Severity Score: 1 (minimal) → 10 (will cause cascading 503s under production load)

| Route | Est. Query Count | Include Depth | Blob Risk | Super Admin Risk | Fan-Out Risk | Severity |
|-------|-----------------|---------------|-----------|-----------------|-------------|----------|
| `GET /api/provider/prescription-queue` | **7-10** | **4** | **YES** | No | **HIGH** | **10** |
| `GET /api/admin/dashboard` | **10+** | 2 | No | Yes | **HIGH** | **9** |
| `GET /api/admin/dashboard/geo` | **2** (unbounded) | 0 | No | Yes | **HIGH** | **9** |
| `GET /api/affiliate/earnings` | **7** (parallel) | 0 | No | No | **HIGH** | **8** |
| `GET /api/auth/login` (POST) | **5-8** | 2 | No | No | **MED** | **8** |
| `GET /api/patients/[id]/tracking` | **6** | 1 | No | No | **MED** | **7** |
| `GET /api/admin/patients` | **3+** | **3** | No | Yes | **HIGH** | **7** |
| `GET /api/admin/intakes` | **3+** | 1 | No | Yes | **MED** | **7** |
| `GET /api/super-admin/affiliates` | **6+** | 2 | No | Yes | **HIGH** | **7** |
| `GET /api/affiliate/commissions` | **3** (parallel) | 0 | No | No | **MED** | **6** |
| `GET /api/affiliate/withdraw` | **4** (parallel) | 0 | No | No | **MED** | **6** |
| `GET /api/affiliate/payouts` | **2** (parallel) | 0 | No | No | **LOW** | **5** |
| `GET /api/affiliate/dashboard` | **5+** | 1 | No | No | **MED** | **6** |
| `GET /api/affiliate/summary` | **4+** | 0 | No | No | **MED** | **6** |
| `GET /api/affiliate/competitions` | **2** | 2 | No | No | **LOW** | **5** |
| `GET /api/invoices` | **2** (parallel) | 1 | No | Yes | **LOW** | **5** |
| `GET /api/v2/invoices/summary` | **4+** | 1 | No | No | **MED** | **6** |
| `GET /api/orders/list` | **2** | 1 | No | Yes | **LOW** | **5** |
| `GET /api/patients/[id]/documents/[docId]` | **1** | 0 | **YES** | Yes | **LOW** | **6** |
| `GET /api/patients/[id]/documents` | **1** | 0 | No (select) | Yes | **LOW** | **4** |
| `POST /api/admin/regenerate-pdf` | **2** | 0 | **YES** | No | **LOW** | **5** |
| `POST /api/patients/[id]/documents/[docId]/regenerate` | **2** | 0 | **YES** | No | **LOW** | **5** |
| `GET /api/patients/[id]/documents/[docId]/download` | **1** | 0 | **YES** | No | **LOW** | **5** |
| `GET /api/patient-portal/tracking` | **2** (unbounded) | 0 | No | No | **MED** | **6** |
| `GET /api/super-admin/affiliates/analytics` | **6+** (parallel) | 1 | No | Yes | **HIGH** | **7** |
| `POST /api/cron/refill-scheduler` | **N×clinic** | 1 | No | N/A | **HIGH** | **8** |
| `POST /api/cron/reconcile-payments` | **batch** | 0 | No | N/A | **MED** | **7** |
| `GET /api/admin/payment-reconciliation` | **3+** | 1 | No | No | **MED** | **6** |
| `POST /api/provider/prescription-queue/[invoiceId]` | **4+** | **4** | No | No | **MED** | **7** |
| `GET /api/tickets` | **3** (parallel) | **3** | No | No | **MED** | **6** |
| `GET /api/finance/pending-profiles` | **5+** (parallel) | 1 | No | No | **MED** | **6** |
| `GET /api/reports/patients` | **3+** | 1 | No | Yes | **MED** | **6** |
| `GET /api/clinic/list` | **3+** | 1 | No | Yes | **MED** | **5** |
| `GET /api/super-admin/clinics` | **3+** | 1 | No | Yes | **MED** | **6** |
| `GET /api/admin/metrics` | **4+** | 0 | No | No | **MED** | **5** |
| Auth Middleware (every request) | **0-2** | 0 | No | No | **LOW** | **6** |

---

## SECTION 2: Top 15 Critical Risks (Ordered by Severity)

### RISK #1: Prescription Queue — Blob Loading + 10-Query Fan-Out (Severity: 10/10)

**File:** `src/app/api/provider/prescription-queue/route.ts`
**Lines:** 135-300 (data queries), 303-326 (counts), 787-802 (blob loading)

**Why it is dangerous:**
This single GET handler executes **7-10 sequential/parallel Prisma queries** including:
- Phase 1: 3 parallel `findMany` queries with include depth 4 (invoice→patient→intakeSubmissions/soapNotes)
- Phase 2: 3 parallel `count` queries
- Phase 3: 1 `patientDocument.findMany` loading **binary `data` blobs** for all patients in queue

The blob query at line 787 loads `patientDocument.data` (JSON intake forms, 10-100KB+ each) for every patient via `WHERE patientId IN (...)` on a potentially large array.

**Impact under connection_limit=1:**
With a single connection, all 7+ queries execute **sequentially** (even `Promise.all` blocks serialize). Estimated wall time: **2-5 seconds**. During this time, the connection is monopolized — every other serverless instance waiting for this connection will timeout.

**How it causes cascading 503s:**
Provider opens prescription queue → 5s connection hold → 3 other requests queue behind it → pool_timeout (15s) expires → P2024 errors → 503s cascade across all routes sharing the same Prisma instance.

**Enterprise fix:**
1. Replace blob loading with a **separate lazy-load endpoint** (`GET /api/patients/[id]/intake-form-data`)
2. Replace 3 parallel findMany + 3 counts with a **single SQL query** using `$queryRaw` with JOINs and window functions
3. Use a **read-optimized projection** (materialized view or denormalized table) for the queue
4. Add **cursor-based pagination** instead of offset

---

### RISK #2: Admin Dashboard Geo — Unbounded Full-Table Scan + In-Memory Aggregation (Severity: 9/10)

**File:** `src/app/api/admin/dashboard/geo/route.ts`
**Lines:** 50-59 (patient query), 80-109 (JS aggregation)

**Why it is dangerous:**
Loads **ALL patients** with state field via `findMany` with **no `take` limit**, then aggregates by state/clinic entirely in JavaScript using a `for` loop. As patient count grows, this query's cost grows linearly with zero bound.

**Impact under connection_limit=1:**
With 10,000 patients: ~1-3s query + ~500ms JS processing. With 100,000 patients: **10-30s query holding the single connection**. Every other request to this database will be blocked.

**How it causes cascading 503s:**
Super admin loads geo dashboard → unbounded query holds connection for 10+ seconds → all other serverless instances get P2024 pool timeout → 503s propagate.

**Enterprise fix:**
1. Replace with `prisma.patient.groupBy({ by: ['state', 'clinicId'], _count: true })` — single SQL query, no data transfer
2. Add **server-side caching** (Redis, 5-minute TTL) for the aggregated result
3. For super_admin: pre-compute nightly via cron job and serve from cache

---

### RISK #3: Admin Dashboard Main — 10+ Parallel Queries + In-Memory MRR Calculation (Severity: 9/10)

**File:** `src/lib/dashboard/admin-dashboard.ts` (called from `src/app/api/admin/dashboard/route.ts`)
**Lines:** 65-147 (9 parallel queries), 129-145 (MRR calculation)

**Why it is dangerous:**
Executes **9 parallel Prisma queries** in a single `Promise.all`:
1. `payment.groupBy` (distinct patients)
2. `order.groupBy` (distinct patients)
3. `patient.count`
4. `order.count`
5. `patient.count` (recent)
6. `order.count` (recent)
7. `invoice.aggregate` (total revenue)
8. `invoice.aggregate` (recent revenue)
9. `subscription.findMany` (up to **500 records**) + JS `.reduce()` for MRR

**Impact under connection_limit=1:**
All 9 queries serialize. Estimated wall time: **3-8 seconds**. The subscription query loads 500 full records just to sum amounts in JavaScript.

**Enterprise fix:**
1. Replace MRR calculation with `prisma.subscription.aggregate({ _sum: { amountCents: true }, where: { status: 'active' } })`
2. Consolidate patient/order counts into a single `$queryRaw` with multiple `COUNT(*)` in one statement
3. Add **dashboard cache** (Redis, 2-minute TTL) — dashboard data is not real-time critical
4. Consider pre-computed dashboard metrics table updated by background job

---

### RISK #4: Affiliate Earnings — 7 Parallel Queries per Request (Severity: 8/10)

**File:** `src/app/api/affiliate/earnings/route.ts`
**Lines:** 41-109 (7-query Promise.all)

**Why it is dangerous:**
Single handler fires **7 parallel Prisma queries**: 3 `aggregate` calls, 2 `findMany` calls, and 2 more `aggregate` calls. Under connection_limit=1, these serialize to ~1-3s total.

**Impact under connection_limit=1:**
If 10 affiliates load their earnings page simultaneously, that's **70 queries** serialized across serverless instances. Connection pool pressure spikes immediately.

**Enterprise fix:**
1. Consolidate into **2 SQL queries** using `$queryRaw`:
   - One for all aggregates (SUM with CASE WHEN for status filtering)
   - One for recent events (LIMIT 100)
2. Cache aggregate values in Redis (1-minute TTL)
3. Separate list endpoint from aggregate endpoint

---

### RISK #5: Login Route — 5-8 Queries with Sequential Fallback Chain (Severity: 8/10)

**File:** `src/app/api/auth/login/route.ts`
**Lines:** 203-533 (authentication chain)

**Why it is dangerous:**
The login handler performs a **sequential fallback chain** of queries:
1. `user.findUnique` with includes
2. Fallback queries (provider, patient, admin lookups)
3. `$transaction` with 2 updates
4. 2 parallel queries for primaryClinic + userClinic.findMany

Under high load (e.g., start of business day), login attempts spike and each holds the connection for 0.5-1s.

**Impact under connection_limit=1:**
50 concurrent logins × 6 queries each = **300 sequential queries** → connection contention → slow logins → users retry → amplification loop.

**Enterprise fix:**
1. Reduce to 2-3 queries by combining user+clinic lookup into a single `findUnique` with proper includes
2. Move session creation to a **background job** (fire-and-forget after returning token)
3. Add Redis session cache for repeat logins within TTL window
4. Consider JWT-only auth (eliminate session table dependency for login)

---

### RISK #6: Cron Refill Scheduler — Unbounded Per-Clinic Batch Processing (Severity: 8/10)

**File:** `src/app/api/cron/refill-scheduler/route.ts`
**Lines:** 91-124

**Why it is dangerous:**
Processes refill queue **per clinic sequentially**, loading up to **500 refills per clinic**. With N clinics, total queries = N × (findMany + groupBy + updates). A single cron execution can hold the database connection for **10-30 seconds**.

**Impact under connection_limit=1:**
Cron fires → holds connection for 30s → all user-facing requests during that window get P2024 → 503s for all users.

**Enterprise fix:**
1. Process in **small batches** (50 records) with explicit `await` between batches to yield the connection
2. Use a **dedicated connection** for cron jobs (separate DATABASE_URL with own pool)
3. Add **distributed locking** (Redis) to prevent overlapping cron executions
4. Consider moving to a **background job queue** (BullMQ/Inngest)

---

### RISK #7: Admin Patients — Deep Include (Depth 3) + 2000-Record Fallback (Severity: 7/10)

**File:** `src/app/api/admin/patients/route.ts`
**Lines:** 141-209 (select), 212-221 (parallel queries), 245-250 (MAX_FALLBACK=2000)

**Why it is dangerous:**
- Include depth 3: patient → payments → invoice → items → product
- Include depth 2: patient → orders → rxs, patient → salesRepAssignments → salesRep
- Fallback query loads up to **2,000 unindexed patients** into memory for in-memory search/filter
- Super admin bypasses clinic filter via `basePrisma`

**Impact under connection_limit=1:**
2000-record query with depth-3 includes generates massive result sets. Prisma translates this to multiple JOINs or subqueries. Estimated: **3-10s** for the fallback path.

**Enterprise fix:**
1. Replace fallback with **full-text search index** (PostgreSQL `tsvector` or Elasticsearch)
2. Reduce include depth to 1; load nested data via separate lightweight endpoints
3. Add hard `take: 100` cap regardless of fallback path
4. Implement proper **server-side search** instead of in-memory filtering

---

### RISK #8: Patient Tracking — 6 Sequential Queries (Severity: 7/10)

**File:** `src/app/api/patients/[id]/tracking/route.ts`
**Lines:** 84-168

**Why it is dangerous:**
Executes 6 sequential queries to build a tracking timeline: patient lookup, 2 findMany for shipping updates, 2 findMany for orders, 1 findFirst. None are parallelized.

**Impact under connection_limit=1:**
Each query ~100-200ms → total ~0.6-1.2s per request. Under concurrency, these queue behind each other.

**Enterprise fix:**
1. Combine into **2 queries** using SQL JOINs
2. Use `Promise.all` for independent lookups (shipping updates + orders can parallel)
3. Return a **denormalized tracking view** pre-computed on order status change

---

### RISK #9: Super Admin Affiliates — Cross-Tenant Fan-Out (Severity: 7/10)

**File:** `src/app/api/super-admin/affiliates/route.ts`
**Lines:** 35-135

**Why it is dangerous:**
`Promise.all` with 3 queries including `WHERE affiliateId IN (...)` on arrays up to 200 elements. Two `groupBy` queries with `IN` clauses follow. All queries bypass clinic filtering via `basePrisma`.

**Impact under connection_limit=1:**
3 serialized queries, each scanning across all clinics. No tenant isolation safety net.

**Enterprise fix:**
1. Use pagination to limit `IN` array sizes
2. Add explicit `take` limits on all groupBy queries
3. Consider materialized aggregate table updated on commission events

---

### RISK #10: Prescription Queue Detail — Depth 4 Include Chain (Severity: 7/10)

**File:** `src/app/api/provider/prescription-queue/[invoiceId]/route.ts`
**Lines:** 39-87

**Why it is dangerous:**
Include chain: invoice → patient → intakeSubmissions → responses → question (depth 4). Single invoice query hydrates the entire intake form question tree.

**Impact under connection_limit=1:**
Deep includes generate N+1-style subqueries internally in Prisma. A single invoice with 50 intake questions could generate 50+ internal queries.

**Enterprise fix:**
1. Load intake form data via a **separate endpoint** that returns a flat structure
2. Use `select` with explicit field projection to reduce payload
3. Consider a **read model** (denormalized intake summary) for the prescription UI

---

### RISK #11: Patient Portal Tracking — Unbounded Queries (Severity: 6/10)

**File:** `src/app/api/patient-portal/tracking/route.ts`
**Lines:** 80-96

**Why it is dangerous:**
Two `findMany` queries with **no `take` limit**. A patient with hundreds of orders/shipping updates loads everything.

**Enterprise fix:**
Add `take: 50` and cursor-based pagination.

---

### RISK #12: Patient Repository — Unbounded Unindexed Search (Severity: 6/10)

**File:** `src/domains/patient/repositories/patient.repository.ts`
**Lines:** 277-293, 374-393

**Why it is dangerous:**
Fallback search loads **all unindexed patients** without `take`, decrypts PHI in memory, and filters in JavaScript. This is the most dangerous pattern for memory and latency scaling.

**Enterprise fix:**
1. Index all patients immediately on creation (background job)
2. Add `take: 500` hard cap on fallback
3. Move search to **PostgreSQL full-text search** or external search service

---

### RISK #13: Provider/Clinic Repository — Unbounded List Methods (Severity: 6/10)

**Files:**
- `src/domains/provider/repositories/provider.repository.ts` lines 270, 303
- `src/domains/clinic/repositories/clinic.repository.ts` lines 291, 306

**Why it is dangerous:**
`list()` and `listAll()` methods have **no `take` limit**. As the platform grows, these return unbounded result sets.

**Enterprise fix:**
Add `take: 1000` hard caps and pagination support.

---

### RISK #14: Auth Middleware — Conditional DB Queries on Every Request (Severity: 6/10)

**File:** `src/lib/auth/middleware.ts`
**Lines:** 576-607 (subdomain resolution), 614-617 (session activity)

**Why it is dangerous:**
Previously performed 2-4 DB queries per authenticated request. **Now mitigated** via Redis caching (`resolveSubdomainClinicId`, `hasClinicAccess` in `middleware-cache.ts`). However, on cache miss (cold start, TTL expiry), DB queries still execute.

**Remaining risk:** Session activity update (`updateSessionActivity`) fires as fire-and-forget but still consumes a connection slot.

**Enterprise fix:**
1. Verify Redis cache hit rate in production (target >95%)
2. Move session activity to a **Redis-only** counter (batch flush to DB every 5 minutes)
3. Add circuit breaker for DB fallback on cache miss

---

### RISK #15: In-Memory Aggregation Across Multiple Routes (Severity: 5/10)

**Files:**
- `src/lib/dashboard/admin-dashboard.ts` lines 129-145 (MRR via JS reduce on 500 subscriptions)
- `src/app/api/admin/dashboard/geo/route.ts` lines 80-109 (patient aggregation by state)
- `src/domains/order/repositories/order.repository.ts` lines 591-595 (groupBy aggregation)
- 50+ routes using `.reduce()` for data aggregation

**Why it is dangerous:**
Loading hundreds/thousands of records into memory to compute aggregates that SQL can do natively. Wastes memory, connection time, and serverless function CPU.

**Enterprise fix:**
1. Replace all in-memory aggregations with `prisma.*.aggregate()` or `prisma.*.groupBy()`
2. For complex aggregations, use `$queryRaw` with proper SQL
3. Cache aggregation results in Redis for dashboard endpoints

---

## SECTION 3: Architecture Gaps

### Query Layer Maturity Assessment

| Dimension | Score (0-100) | Assessment |
|-----------|:---:|-----------|
| **Query Layer Architecture** | **32** | No centralized query layer. Queries scattered across 484 route files, 5 repositories, and 5 services. No read-model separation. No query planner. |
| **Tenant Isolation** | **72** | Strong `PrismaWithClinicFilter` proxy with AsyncLocalStorage. Production guard on `basePrisma`. However, ~50 files bypass via `basePrisma` (most intentional). Super admin bypass patterns lack audit trail in some routes. |
| **Data Loading Strategy** | **28** | No lazy-loading for blobs. Deep includes (depth 4) used instead of flat projections. No read-optimized views. In-memory filtering used as fallback for search. |
| **Blob Handling** | **20** | `patientDocument.data` stored as Prisma `Bytes` field in database, not external storage. Loaded in list context (prescription queue). No streaming. No size limits. |
| **Read-Model Separation** | **15** | No CQRS pattern. Write models and read models are identical. Dashboard queries perform complex joins on OLTP tables. No materialized views. No denormalized projections. |
| **Concurrency Safety** | **45** | AsyncLocalStorage prevents clinic context races. Query budget system tracks per-request query count (warn at 15, error at 30). However, `Promise.all` patterns under connection_limit=1 serialize instead of parallelize, creating false assumptions about latency. Connection pool configured correctly for serverless but no circuit breaker for DB overload. |
| **Pagination & Bounding** | **55** | Most list endpoints have `take` limits. Repositories use DEFAULT_LIMIT=100. But: fallback queries allow up to MAX_FALLBACK=2000, geo dashboard has no limit, provider/clinic list methods have no limit, patient portal tracking has no limit. |
| **Caching** | **40** | Redis caching added for auth middleware (subdomain, clinic access). No caching for dashboard data, aggregations, or read-heavy endpoints. No L1 (in-memory) cache for hot data. QueryOptimizer exists but appears underutilized. |
| **Error Resilience** | **55** | `safeQuery` wrapper with retry logic exists. `withRetry` for connection errors. Query timeout protection. But: no circuit breaker, no graceful degradation, no fallback responses for non-critical data. |
| **Observability** | **60** | Query timing middleware logs slow queries (>100ms). Query budget tracks per-request counts. Sentry integration for metrics. Connection pool health monitoring. Missing: per-route query profiles, p95/p99 latency tracking, automated alert thresholds. |

### **Overall Query Architecture Maturity: 38/100** (Pre-Enterprise)

The platform has **strong foundations** (tenant isolation, query budget, connection pool management) but lacks the **structural patterns** (read models, query layer abstraction, blob externalization, aggregation offloading) needed for enterprise-scale reliability.

---

## SECTION 4: Required Architectural Refactor

### 4.1 Proper Query Layer Structure

```
src/
├── lib/
│   └── database/
│       ├── db.ts                          # Existing: Prisma client, connection pool
│       ├── query-layer/
│       │   ├── index.ts                   # Query Layer facade
│       │   ├── query-executor.ts          # Centralized query execution with budget, timing, retry
│       │   ├── query-planner.ts           # Analyze query complexity before execution
│       │   ├── read-projections/          # Read-optimized query builders
│       │   │   ├── prescription-queue.projection.ts
│       │   │   ├── admin-dashboard.projection.ts
│       │   │   ├── patient-list.projection.ts
│       │   │   └── affiliate-earnings.projection.ts
│       │   ├── aggregations/              # SQL-native aggregation queries
│       │   │   ├── dashboard-metrics.sql.ts
│       │   │   ├── geo-distribution.sql.ts
│       │   │   └── affiliate-totals.sql.ts
│       │   └── blob-loader/               # Lazy blob loading service
│       │       ├── blob-loader.ts
│       │       └── blob-cache.ts
│       └── ...existing files
├── domains/
│   ├── patient/
│   │   └── repositories/
│   │       ├── patient.repository.ts       # Existing: write operations
│   │       └── patient.read-repository.ts  # NEW: read-optimized queries
│   └── ...
```

**Key principles:**
- **Every query goes through `query-executor.ts`** which enforces budget, timeout, and logging
- **Read operations use projections** (flat SQL, no deep includes)
- **Write operations use repositories** (Prisma models, transactions)
- **Aggregations use SQL** (not in-memory processing)
- **Blobs loaded lazily** via separate endpoint/service

### 4.2 Clinic Context Enforcement Redesign

Current: `PrismaWithClinicFilter` proxy intercepts all Prisma model calls and injects `clinicId`.

**Strengths to preserve:**
- AsyncLocalStorage for thread-safe context
- Automatic WHERE clause injection
- `TenantContextRequiredError` for missing context
- Production guard on basePrisma

**Redesign:**
1. **Audit trail for basePrisma usage**: Every `basePrisma` call should auto-log to `hipaaAuditEntry` with the caller file/line
2. **Typed basePrisma subset**: Instead of guarding at runtime, expose typed subsets:
   ```typescript
   basePrisma.crossTenant.clinic.findFirst(...)  // Clearly marked cross-tenant
   basePrisma.system.hipaaAuditEntry.create(...)  // System operations
   ```
3. **Remove runtime model allowlist**: Replace with compile-time typing
4. **Add per-model access policies**: Define which roles can access which models cross-tenant

### 4.3 Super Admin Safe Pattern

Current: Super admin sets `effectiveClinicId = undefined`, causing `PrismaWithClinicFilter` to skip WHERE injection.

**Problems:**
- No automatic pagination for cross-tenant queries
- No audit trail for which clinics' data was accessed
- Memory risk from loading all-clinic result sets

**Safe pattern:**
```typescript
// Instead of: findMany with no clinicId filter
// Use: explicit clinic iteration with bounded queries

async function superAdminListPatients(filters, pagination) {
  if (filters.clinicId) {
    // Scoped to specific clinic — safe
    return patientRepo.list({ ...filters, clinicId: filters.clinicId }, pagination);
  }
  // Cross-tenant: use SQL aggregation, never hydrate full objects
  return queryLayer.execute(
    patientListProjection.crossTenant(filters, pagination)
  );
}
```

### 4.4 Blob Lazy-Loading Strategy

**Current:** `patientDocument.data` (Bytes) stored in PostgreSQL, loaded via Prisma `select: { data: true }`.

**Target architecture:**
1. **Migration**: Move blob storage to **S3** (or compatible object storage with BAA for HIPAA)
2. **Schema change**: Replace `data Bytes` with `storageUrl String` and `storageBucket String`
3. **Access pattern**: Generate **pre-signed URLs** (15-minute TTL) instead of streaming through API
4. **Transition period**: Keep both fields; read from S3 first, fall back to DB
5. **Lazy endpoint**: `GET /api/patients/[id]/documents/[docId]/content` — separate from metadata

**For prescription queue specifically:**
- Remove blob loading from queue list endpoint entirely
- Add "View Intake Form" button that fetches data on demand
- Pre-render intake summary (text-only) during intake submission, store as separate field

### 4.5 Read-Optimized Projection Pattern

Replace deep Prisma includes with flat SQL projections.

**Example — Prescription Queue Projection:**
```sql
-- Single query replaces 7 Prisma queries
SELECT
  i.id as invoice_id,
  i.status,
  i."paidAt",
  c.id as clinic_id,
  c.name as clinic_name,
  c.subdomain,
  c."lifefileEnabled",
  p.id as patient_id,
  p."patientId" as patient_display_id,
  p."firstName",
  p."lastName",
  p.email,
  p.dob,
  (SELECT id FROM "IntakeFormSubmission" ifs
   WHERE ifs."patientId" = p.id AND ifs.status = 'completed'
   ORDER BY ifs."completedAt" DESC LIMIT 1) as latest_intake_id,
  (SELECT json_build_object('id', sn.id, 'status', sn.status, 'approvedAt', sn."approvedAt")
   FROM "SOAPNote" sn WHERE sn."patientId" = p.id
   ORDER BY sn."createdAt" DESC LIMIT 1) as latest_soap
FROM "Invoice" i
JOIN "Clinic" c ON c.id = i."clinicId"
JOIN "Patient" p ON p.id = i."patientId"
WHERE i."clinicId" = ANY($1)
  AND i.status = 'PAID'
  AND i."prescriptionProcessed" = false
  AND p."profileStatus" != 'PENDING_COMPLETION'
ORDER BY i."paidAt" ASC
LIMIT $2 OFFSET $3;
```

### 4.6 Aggregation via SQL Instead of Hydration

**Dashboard metrics — single query:**
```sql
SELECT
  COUNT(DISTINCT CASE WHEN p."createdAt" > NOW() - INTERVAL '30 days' THEN p.id END) as recent_patients,
  COUNT(DISTINCT p.id) as total_patients,
  COUNT(DISTINCT CASE WHEN o."createdAt" > NOW() - INTERVAL '30 days' THEN o.id END) as recent_orders,
  COUNT(DISTINCT o.id) as total_orders,
  COALESCE(SUM(CASE WHEN inv.status = 'PAID' THEN inv."amountCents" END), 0) as total_revenue,
  COALESCE(SUM(CASE WHEN inv.status = 'PAID' AND inv."paidAt" > NOW() - INTERVAL '30 days'
                THEN inv."amountCents" END), 0) as recent_revenue,
  COALESCE(SUM(CASE WHEN s.status = 'active' THEN s."amountCents" END), 0) as mrr
FROM "Patient" p
LEFT JOIN "Order" o ON o."clinicId" = p."clinicId"
LEFT JOIN "Invoice" inv ON inv."clinicId" = p."clinicId"
LEFT JOIN "Subscription" s ON s."clinicId" = p."clinicId"
WHERE p."clinicId" = $1;
```

**Geo distribution — single query:**
```sql
SELECT p.state, p."clinicId", c.name as clinic_name, c."primaryColor",
       COUNT(*) as patient_count
FROM "Patient" p
JOIN "Clinic" c ON c.id = p."clinicId"
WHERE p.state != ''
GROUP BY p.state, p."clinicId", c.name, c."primaryColor"
ORDER BY patient_count DESC;
```

### 4.7 Caching Boundaries

| Data Type | Cache Layer | TTL | Invalidation Strategy |
|-----------|------------|-----|----------------------|
| Dashboard metrics | Redis | 2 min | Time-based expiry |
| Geo distribution | Redis | 5 min | Time-based expiry |
| Clinic list (for dropdowns) | Redis + L1 | 10 min | Event-based (clinic created/updated) |
| Affiliate earnings aggregates | Redis | 1 min | Event-based (commission event) |
| Subdomain → clinicId | Redis | 5 min | Already implemented |
| User clinic access | Redis | 5 min | Already implemented |
| Patient search results | None | N/A | Real-time (search must be fresh) |
| Prescription queue | None | N/A | Real-time (clinical data) |
| Invoice list | Redis | 30 sec | Event-based (payment webhook) |

**L1 Cache (in-memory, per-instance):**
```typescript
// For data that changes rarely and is read frequently
const clinicCache = new Map<number, { data: Clinic; expiresAt: number }>();
```

**Cache invalidation pattern:**
```typescript
// Publish event on write
await redis.publish('cache:invalidate', JSON.stringify({ type: 'clinic', id: clinicId }));

// Subscribe in cache layer
redis.subscribe('cache:invalidate', (msg) => {
  const { type, id } = JSON.parse(msg);
  clinicCache.delete(id);
});
```

### 4.8 Parallel Query Elimination Strategy

Under `connection_limit=1`, `Promise.all([query1, query2, query3])` does **not** execute in parallel — queries serialize through the single connection. This creates:
1. **False latency assumptions** (developers think queries run in parallel)
2. **Hidden serialization** (3 queries that "should take 100ms" actually take 300ms)
3. **Connection monopolization** (the single connection is held for the full duration)

**Strategy:**
1. **Replace Promise.all with single SQL queries** where possible (see projections above)
2. **Where multiple queries are needed, make them explicit sequential** with comments:
   ```typescript
   // Sequential: connection_limit=1 means these serialize anyway
   const data = await queryLayer.findMany(...);
   const count = await queryLayer.count(...);
   ```
3. **For truly independent data needs, use separate endpoints** called from the client
4. **Budget enforcement**: Query budget system should flag routes with >5 queries as candidates for consolidation

---

## SECTION 5: Enterprise Remediation Roadmap

### Phase 1: Critical (Week 1-2) — Stop the Bleeding

**Objective:** Eliminate cascading 503 risk under current production load.

| # | Target | Refactor Strategy | Risk Level | Regression Risk | Deployment Safety |
|---|--------|------------------|-----------|----------------|------------------|
| 1.1 | Prescription queue blob loading | Remove `data: true` from queue list query (line 798). Add separate `GET /api/patients/[id]/intake-form-data` endpoint. UI loads intake data on click. | LOW | **LOW** — UI change only, no data model change | Feature flag: `LAZY_INTAKE_LOAD=true`. Roll back by setting to false. |
| 1.2 | Geo dashboard unbounded query | Replace `findMany` (line 50) with `groupBy` returning counts only. No patient records transferred. | LOW | **LOW** — Same data, different query method | Deploy behind cache flag. Compare output with current endpoint before switching. |
| 1.3 | Dashboard MRR in-memory aggregation | Replace subscription findMany + reduce with `aggregate({ _sum })`. | LOW | **LOW** — Identical result, fewer queries | Add integration test comparing old vs new MRR calculation. |
| 1.4 | Add `take` limits to all unbounded findMany | Provider repo `list()`: add `take: 500`. Clinic repo `listAll()`: add `take: 500`. Patient portal tracking: add `take: 50`. | LOW | **VERY LOW** — Adding safety caps | Gradual rollout. Log when cap is hit to identify if real users need higher limits. |
| 1.5 | Verify Redis cache hit rate for auth middleware | Add metrics for cache miss rate on `resolveSubdomainClinicId` and `hasClinicAccess`. Target: >95% hit rate. | NONE | **NONE** — Monitoring only | Deploy metrics first, action later. |

**Phase 1 Success Criteria:**
- No route exceeds 5 queries per request (enforced by query budget ERROR threshold reduction from 30→10)
- Zero blob fields loaded in list endpoints
- All findMany queries have explicit `take` limits
- Dashboard endpoints respond in <500ms at p99

---

### Phase 2: High Priority (Week 3-4) — Structural Query Reduction

**Objective:** Reduce average queries-per-request from 5-10 to 2-3.

| # | Target | Refactor Strategy | Risk Level | Regression Risk | Deployment Safety |
|---|--------|------------------|-----------|----------------|------------------|
| 2.1 | Prescription queue — SQL projection | Replace 3 parallel findMany + 3 counts with single `$queryRaw` (see Section 4.5). | MED | **MED** — New query logic, verify output matches current | Shadow mode: run both old and new queries, compare results for 24h before switching. |
| 2.2 | Admin dashboard — SQL aggregation | Replace 9 parallel queries with 1-2 raw SQL queries (see Section 4.6). | MED | **MED** — Aggregation logic changes | A/B test: serve both old and new endpoints, compare metrics. |
| 2.3 | Affiliate earnings — SQL consolidation | Replace 7 parallel queries with 2 SQL queries. | MED | **LOW** — Aggregate math is straightforward | Unit test all edge cases (zero balance, negative, etc.). |
| 2.4 | Login route — query reduction | Combine user+clinic into single findUnique with includes. Move session update to background. | MED | **HIGH** — Auth is critical path | Canary deploy to single clinic first. Full regression test of all auth flows. |
| 2.5 | Patient search — PostgreSQL FTS | Replace in-memory unindexed patient search with `tsvector` search column. Backfill existing patients. | HIGH | **MED** — Search behavior may differ | Run both search methods in parallel, compare result sets. Gradual migration with feature flag. |
| 2.6 | Dashboard cache layer | Add Redis cache (2-min TTL) for all dashboard and aggregation endpoints. | LOW | **LOW** — Data may be up to 2 min stale (acceptable for dashboards) | Add cache-control headers. Allow `?fresh=true` to bypass cache. |

**Phase 2 Success Criteria:**
- Average queries-per-request across all routes: <3
- Query budget WARN threshold (15) is never hit in production
- Dashboard endpoints respond in <200ms at p99 (cached)
- Login endpoint responds in <300ms at p99

---

### Phase 3: Structural (Week 5-8) — Architecture Patterns

**Objective:** Establish enterprise query architecture patterns for long-term scalability.

| # | Target | Refactor Strategy | Risk Level | Regression Risk | Deployment Safety |
|---|--------|------------------|-----------|----------------|------------------|
| 3.1 | Query Layer abstraction | Implement `query-executor.ts` and `read-projections/` directory structure. Migrate top-10 heaviest routes. | MED | **MED** — New abstraction layer | Gradual migration. Old and new coexist. Feature flags per route. |
| 3.2 | Read/Write repository split | Add `*.read-repository.ts` files for domains with heavy read patterns (patient, order, ticket). | MED | **LOW** — Additive change, no modifications to existing repos | New files only. Old repos continue to work. |
| 3.3 | Blob externalization to S3 | Add S3 storage for new documents. Dual-write period (DB + S3). Migration script for existing blobs. | HIGH | **HIGH** — Data migration, HIPAA compliance for S3 | Phase: (a) dual-write new docs, (b) migrate old docs to S3, (c) remove DB blobs. Each phase independently deployable. |
| 3.4 | Super admin query safety | Implement mandatory pagination for cross-tenant queries. Add audit logging for all basePrisma usage. | MED | **LOW** — Adding constraints | Deploy audit logging first (passive), then pagination enforcement. |
| 3.5 | Cron job isolation | Move cron jobs to separate DATABASE_URL with own pool. Add distributed locking via Redis. | MED | **LOW** — Infrastructure change, not code logic | Deploy new env var first, test with single cron job, then migrate all. |

**Phase 3 Success Criteria:**
- All top-20 routes use query layer abstraction
- Read and write repositories separated for patient, order, ticket domains
- New documents stored in S3
- Super admin queries all paginated and audited
- Cron jobs never contend with user-facing queries

---

### Phase 4: Optimization (Week 9-12) — Performance Hardening

**Objective:** Achieve deterministic sub-200ms response times for all read endpoints.

| # | Target | Refactor Strategy | Risk Level | Regression Risk | Deployment Safety |
|---|--------|------------------|-----------|----------------|------------------|
| 4.1 | Materialized views for dashboards | Create PostgreSQL materialized views for dashboard metrics, refreshed by cron every 2 minutes. | MED | **LOW** — Read-only, no write path changes | Deploy views alongside existing queries. Switch reads after validation. |
| 4.2 | Connection pool optimization | Deploy PgBouncer or RDS Proxy (if not already). Increase connection_limit to 3 with proxy. Add circuit breaker for pool exhaustion. | MED | **MED** — Infrastructure change | Blue-green deployment. Test with synthetic load before switching traffic. |
| 4.3 | Query plan analysis | Run `EXPLAIN ANALYZE` on all top-20 queries. Add missing indexes. Remove redundant indexes. | LOW | **LOW** — Index changes are low-risk | Add indexes in off-peak hours. Monitor query performance for regressions. |
| 4.4 | Response streaming for large lists | Implement `ReadableStream` responses for endpoints returning >100 items. | MED | **MED** — Client-side parsing changes | Feature flag per endpoint. Test with all frontend consumers. |
| 4.5 | L1 cache for hot data | Add in-memory cache (LRU, 1000 entries, 60s TTL) for clinic config, provider lists, and other hot read data. | LOW | **LOW** — Cache adds, doesn't modify | Monitor cache hit rate. Adjust TTL based on production patterns. |

**Phase 4 Success Criteria:**
- All read endpoints respond in <200ms at p99
- Connection pool utilization <60% under peak load
- Zero P2024 errors in production
- Query plans show index-only scans for top queries

---

### Phase 5: Scale Hardening (Week 13-16) — Enterprise Readiness

**Objective:** Prepare for 10x traffic growth with zero architecture changes.

| # | Target | Refactor Strategy | Risk Level | Regression Risk | Deployment Safety |
|---|--------|------------------|-----------|----------------|------------------|
| 5.1 | Read replicas | Route all read queries to PostgreSQL read replica. Write queries to primary. | HIGH | **HIGH** — Replication lag visible to users | Start with dashboard-only reads from replica. Expand after validation. |
| 5.2 | Event-driven cache invalidation | Replace time-based cache TTLs with event-driven invalidation (CDC or application events). | MED | **MED** — New infrastructure component | Deploy alongside TTL caching. Remove TTL after event system is validated. |
| 5.3 | Query performance regression CI | Add CI step that runs `EXPLAIN ANALYZE` on top queries against test database. Fail build if query cost exceeds threshold. | LOW | **NONE** — CI-only, no production impact | Add as warning first, then enforce after baseline established. |
| 5.4 | Load test suite | Create k6/Artillery load test that simulates 500 concurrent users across all critical routes. Run weekly. | LOW | **NONE** — Test-only | Start with read-only load test. Add write operations after data cleanup is automated. |
| 5.5 | Complete S3 migration | Remove `data Bytes` column from `PatientDocument`. All blobs served from S3. | HIGH | **HIGH** — Irreversible schema change | Only after 100% of documents migrated and verified. Backup column data before dropping. |

**Phase 5 Success Criteria:**
- Platform handles 500 concurrent users with <200ms p99 response times
- Zero manual intervention required for traffic spikes
- Automated performance regression detection in CI
- All blob data externalized to S3 with HIPAA-compliant access controls
- Read replica handles 80% of read traffic

---

## APPENDIX A: Key File Reference

| File | Role | Risk Level |
|------|------|-----------|
| `src/lib/db.ts` | Prisma client, PrismaWithClinicFilter, tenant isolation | Core infrastructure |
| `src/lib/database/serverless-pool.ts` | Connection limit configuration | Core infrastructure |
| `src/lib/database/query-budget.ts` | Per-request query tracking | Observability |
| `src/lib/database/connection-pool.ts` | Retry logic, health monitoring | Resilience |
| `src/lib/database/safe-query.ts` | Query wrappers with retry | Resilience |
| `src/lib/auth/middleware.ts` | Auth middleware, clinic context | Per-request overhead |
| `src/lib/auth/middleware-cache.ts` | Redis cache for auth queries | Cache layer |
| `src/app/api/provider/prescription-queue/route.ts` | Highest-risk route | **CRITICAL** |
| `src/app/api/admin/dashboard/geo/route.ts` | Unbounded full-table scan | **CRITICAL** |
| `src/lib/dashboard/admin-dashboard.ts` | Dashboard query orchestration | **HIGH** |
| `src/app/api/affiliate/earnings/route.ts` | 7-query fan-out | **HIGH** |
| `src/domains/patient/repositories/patient.repository.ts` | Unbounded fallback search | **HIGH** |

## APPENDIX B: Query Budget Thresholds (Current vs Recommended)

| Metric | Current | Recommended Phase 1 | Recommended Phase 3 |
|--------|---------|---------------------|---------------------|
| QUERY_WARN_THRESHOLD | 15 | 8 | 5 |
| QUERY_ERROR_THRESHOLD | 30 | 15 | 8 |
| CUMULATIVE_DB_TIME_WARN_MS | 3000 | 1500 | 500 |
| CUMULATIVE_DB_TIME_ERROR_MS | 5000 | 3000 | 1500 |
| MAX_INCLUDE_DEPTH | None | 3 | 2 |
| MAX_FINDMANY_TAKE | None | 500 | 200 |

## APPENDIX C: Connection Math Under Production Load

```
Current Configuration (no external pooler):
  connection_limit = 1 per Vercel instance
  Vercel instances: up to 1000 (auto-scale)
  PostgreSQL max_connections: ~300 (Neon) or ~1800 (RDS db.t4g.xlarge)

Scenario: 100 concurrent users, each loading prescription queue
  Queries per request: 10
  Time per query: 100ms average
  Total connection hold time per request: 1000ms (serialized)
  Requests per second per connection: 1
  Required connections: 100
  Available connections: 100 (100 instances × 1)
  Headroom: 0% ← DANGER ZONE

With Phase 2 fixes (2 queries per request):
  Total connection hold time per request: 200ms
  Requests per second per connection: 5
  Required connections: 20
  Available connections: 100
  Headroom: 80% ← SAFE

With RDS Proxy (connection_limit=3):
  Available connections: 300 (100 instances × 3, multiplexed)
  Headroom: 200% ← COMFORTABLE
```

---

**Report prepared by:** Enterprise Query Audit System
**Date:** 2026-02-17
**Classification:** Internal — Engineering Team
**Next review:** After Phase 1 completion
