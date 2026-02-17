# Database Connection Pool Exhaustion Audit

**Date:** 2026-02-16  
**Auditor:** Automated (AI)  
**Scope:** Full production-grade audit of Prisma/PostgreSQL pool exhaustion vectors  
**Prior Incident:** Feb 12, 2026 — P2024 pool exhaustion on ot.eonpro.io (see `docs/INCIDENT_CONNECTION_POOL_FEB12.md`)  
**Status:** FIXES APPLIED (2026-02-17) — see "Applied Fixes" section below

---

## A) Pool Exhaustion Risk Score: **HIGH**

The platform has already experienced a production pool exhaustion incident (Feb 12, 2026) and several structural patterns remain that can recur under moderate load.

---

## B) Top 10 Most Dangerous Code Paths

| # | File | Lines | Risk | Description |
|---|------|-------|------|-------------|
| **1** | `src/lib/auth/middleware.ts` | 601, 640, 114, 785-803 | **CRITICAL** | Every authenticated request performs up to **4 DB calls**: subdomain clinic lookup (L601), session activity update (L640/L114), and clinic access check with `Promise.all` of 2 queries (L785-803). At 200 concurrent users, this is 400-800 connections just for auth. |
| **2** | `src/lib/auth/middleware-with-params.ts` | 47-58, 466 | **CRITICAL** | Same pattern as middleware.ts — `Promise.all` of 2 DB queries for clinic access (L47-58), plus subdomain lookup (L466). Doubles the middleware DB pressure since both wrappers are used. |
| **3** | `src/app/api/prescriptions/route.ts` | 116-194, 498-692 | **HIGH** | Before the transaction even starts: 4 sequential `basePrisma` lookups (provider L116, user L132, providerClinic L166, user L192). Then a `Serializable` transaction with multiple inner queries. **8-12 DB operations per request.** |
| **4** | `src/app/api/cron/affiliate-payouts/route.ts` | 38-57 | **HIGH** | Uses `pg_try_advisory_lock` which holds a DB session open for the entire cron duration. Combined with `runCronPerTenant` iterating clinics, this holds connections for minutes. |
| **5** | `src/services/affiliate/attributionService.ts` | 384-395, 529-545, 831-893 | **HIGH** | Three separate `Serializable` transactions across the module, each holding row-level locks. Under webhook bursts (intake form submissions), concurrent calls can cascade lock waits → pool starvation. |
| **6** | `src/lib/shipment-schedule/shipmentScheduleService.ts` | 239, 325, 436 | **HIGH** | Three transaction blocks creating shipments **inside loops** (iterating over dates). Each loop iteration performs DB writes within the transaction, extending lock duration proportional to shipment count. |
| **7** | `src/app/api/auth/login/route.ts` | 399-405 | **MEDIUM** | Transaction for `failedLoginAttempts` increment on **every failed login**. Under brute force attacks, this generates high transaction volume. |
| **8** | `src/domains/ticket/services/ticket.service.ts` | (10 $transaction calls) | **MEDIUM** | **10 separate `$transaction` usages** in a single service file. Ticket operations are frequent for support workflows and can create sustained pool pressure. |
| **9** | `src/services/billing/clinicInvoiceService.ts` | 245, 541, 615 | **MEDIUM** | Three transactions for invoice operations (create, update, void). Billing operations may cluster at month-end, creating burst patterns. |
| **10** | `src/app/api/stripe/refunds/route.ts` | 110, 380 | **MEDIUM** | Two `$transaction` blocks. Stripe webhook bursts (refund processing) can trigger many concurrent DB transactions. |

---

## C) Estimated Max Concurrent Safe Requests Before Exhaustion

### Without RDS Proxy (Direct to RDS)

```
Configuration:
  Vercel concurrency: ~200 function instances (estimated)
  connection_limit per instance: 1 (current serverless default)
  
  Max connections = 200 instances × 1 connection = 200 connections
  
  RDS db.t4g.xlarge max_connections ≈ 1,800

  BUT: Each middleware request can trigger 2-4 sequential DB operations
  that serialize on a single connection per instance.
  
  Effective throughput: ~200 concurrent requests
  Auth middleware alone: 2-4 queries per request (subdomain + session + access check)
  Main handler: 1-10 additional queries
  
  With connection_limit=1, queries serialize per-instance:
  - Auth: ~50ms (2 queries × 25ms avg)
  - Handler: ~75ms (3 queries avg × 25ms)
  - Total DB time per request: ~125ms
  
  At 200 concurrent requests with connection_limit=1:
  ✅ Won't exhaust pool (200 < 1800)
  ⚠️ BUT will be SLOW: queries serialize, no parallelism
```

### With RDS Proxy (Current Target Architecture)

```
Configuration:
  connection_limit per instance: 5 (serverless-pool.ts line 85)
  Vercel concurrency: ~200 function instances
  
  Max connections = 200 × 5 = 1,000 proxy connections
  RDS Proxy pools to ~900 real connections
  RDS max_connections ≈ 1,800
  
  ✅ 1,000 proxy connections < 1,800 max = OK
  ⚠️ If Vercel auto-scales beyond 360 instances:
     360 × 5 = 1,800 → EXHAUSTION
```

### Critical Exhaustion Threshold

| Scenario | Instances | Pool per Instance | Total Conns | Status |
|----------|-----------|-------------------|-------------|--------|
| No Proxy, limit=1 | 200 | 1 | 200 | ✅ Safe (but slow) |
| No Proxy, limit=10 (old config) | 200 | 10 | 2,000 | ❌ **EXHAUSTED** |
| RDS Proxy, limit=5 | 200 | 5 | 1,000 | ✅ Safe |
| RDS Proxy, limit=5, burst 400 | 400 | 5 | 2,000 | ❌ **EXHAUSTED** |
| Direct to RDS, limit=5 | 200 | 5 | 1,000 | ⚠️ Risky (no proxy buffering) |

**Safe ceiling with RDS Proxy: ~300 concurrent Vercel instances × 5 = 1,500 conns**  
**Safe ceiling without proxy: ~200 concurrent instances × 1 = 200 conns (slow)**

---

## D) PgBouncer or RDS Proxy: **REQUIRED**

**Verdict: YES, an external connection pooler is REQUIRED for production stability.**

Evidence:
1. **Feb 12 Incident** confirmed pool exhaustion at `connection_limit=10` without proxy.
2. The serverless-pool.ts code (line 354-358) already warns when running without a pooler.
3. With `connection_limit=1` (no proxy fallback), requests serialize all DB operations — tolerable for low traffic but degrades severely at scale.
4. The middleware performs 2-4 DB calls per authenticated request. At 200 concurrent users, that's 400-800 sequential DB operations competing for 200 connections.

---

## E) Exact Configuration Recommendations

### 1. Prisma Pool Size (`serverless-pool.ts`)

```
# With RDS Proxy (RECOMMENDED):
DATABASE_CONNECTION_LIMIT=3      # Down from 5; gives headroom for 600 instances
USE_RDS_PROXY=true

# Without proxy (EMERGENCY fallback only):
DATABASE_CONNECTION_LIMIT=1      # Already enforced in code
```

**Rationale:** Reducing from 5→3 per instance allows safe scaling to ~600 Vercel instances before hitting RDS limits (600×3=1800).

### 2. RDS Proxy Settings

```
Max connections to RDS:        900 (50% of RDS max_connections=1800)
Idle client timeout:           600 seconds (10 minutes)
Connection borrow timeout:     120 seconds
Max connections percent:       50%
Session pinning filters:       EXCLUDE_VARIABLE_SETS
Target connection pool max:    50%
```

### 3. RDS (db.t4g.xlarge) Settings

```
max_connections:               1800 (default for this instance)
Reserved connections:          ~3 for superuser operations
statement_timeout:             30s (already configured)
idle_in_transaction_session_timeout: 60s (ADD THIS — prevents hung transactions)
log_min_duration_statement:    100ms (for slow query detection)
```

### 4. Vercel Function Concurrency Cap

```
# vercel.json — per-function concurrency limits
{
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}

# Set Vercel project-level max instances (if available):
# Target: 300 max concurrent instances
# This caps total connections at 300 × 3 = 900
```

### 5. Connection Budget per Request

```
Target:    ≤ 5 DB operations per request
Auth:      ≤ 2 DB calls (subdomain cached, session via Redis)  
Handler:   ≤ 3 DB calls (main query + 1-2 related)
```

---

## F) Code-Level Fixes Ranked by Impact

### IMPACT 1 — Middleware DB Calls (Highest Impact)

**Problem:** `withAuth` performs up to 4 DB queries on EVERY request:
1. Subdomain clinic lookup (`basePrisma.clinic.findFirst` — L601)
2. Session activity update (`prisma.$executeRaw` — L114)
3. UserClinic access check (`basePrisma.userClinic.findFirst` — L786)
4. ProviderClinic access check (`basePrisma.providerClinic.findFirst` — L795)

**File:** `src/lib/auth/middleware.ts`

**Fix:**
1. **Cache subdomain→clinicId in Redis** (already partially done via `getClinicBySubdomainCache`), but the cache is request-scoped — make it a Redis cache with 5-minute TTL.
2. **Move session activity update to Redis only** — the `$executeRaw` UPDATE on `UserSession` should be replaced with a Redis-only write; a background job can sync to DB periodically.
3. **Cache UserClinic/ProviderClinic access in Redis** — `userId:clinicId→boolean` with 5-minute TTL. This eliminates 2 DB calls per request for non-super-admin users.

**Estimated savings:** -3 DB calls per request × 200 concurrent requests = **-600 connections/s**

### IMPACT 2 — Deduplicate Middleware Wrappers

**Problem:** `withAuth` and `withAuthParams` both independently resolve clinic context and perform DB lookups. Routes using `withAuthParams` get a completely separate code path with the same DB calls.

**Files:** `src/lib/auth/middleware.ts`, `src/lib/auth/middleware-with-params.ts`

**Fix:** Extract shared `resolveAuthContext()` that both wrappers delegate to. This ensures:
- Single cache layer (Redis) for subdomain and access checks
- No duplicate DB queries
- Consistent behavior

### IMPACT 3 — Add Timeouts to ALL Transactions

**Problem:** Of ~55 `$transaction` usages in `src/`, only ~12 specify explicit `timeout`. The default Prisma transaction timeout is **5 seconds**, which can still hold connections under contention.

**Grep result:** Most `$transaction` calls in the codebase have NO timeout or isolationLevel:

```
src/app/api/super-admin/affiliates/route.ts:256   → NO timeout
src/lib/auth/registration.ts:344                  → NO timeout  
src/lib/auth/registration.ts:573                  → NO timeout
src/domains/order/repositories/order.repository.ts:644 → NO timeout
src/services/stripe/invoiceService.ts:495          → NO timeout
src/services/stripe/paymentService.ts:180          → NO timeout
src/app/api/notifications/preferences/route.ts:230 → NO timeout
src/app/api/auth/login/route.ts:402                → NO timeout
src/services/pricing/pricingEngine.ts:416          → NO timeout
```

**Fix:** Add explicit `timeout: 15000` (15s) to ALL `$transaction` calls. For Serializable transactions, add `maxWait: 5000`.

### IMPACT 4 — Prescription Route Query Reduction

**Problem:** `src/app/api/prescriptions/route.ts` performs **8-12 DB operations** per POST request (4 pre-transaction lookups + transaction with multiple inner queries).

**Fix:**
1. Combine the 4 sequential pre-transaction lookups (`provider`, `user`, `providerClinic`, `user`) into a single query with `include` relations.
2. Move the provider authorization check into the transaction to avoid redundant lookups.

**Estimated savings:** -3 DB calls per prescription request.

### IMPACT 5 — Cron Advisory Lock Duration

**Problem:** `affiliate-payouts` cron uses `pg_try_advisory_lock` which holds a DB connection for the entire cron run (potentially minutes). It then iterates all clinics running DB operations per clinic.

**File:** `src/app/api/cron/affiliate-payouts/route.ts` (L36-57)

**Fix:**
1. Use Redis-based distributed lock instead of `pg_advisory_lock` to free the DB connection.
2. Process clinics with bounded concurrency (e.g., 3 at a time) using `p-limit`.

### IMPACT 6 — Fire-and-Forget Session Activity Update

**Problem:** `updateSessionActivity()` (middleware.ts L91-126) performs a `$executeRaw` UPDATE on every authenticated request. It's fire-and-forget (`.catch(() => {})`), meaning errors are swallowed but the DB connection is still consumed.

**Fix:**
1. Replace the `$executeRaw` with a Redis `HSET` for last-activity tracking.
2. Add a background cron (every 60s) that batch-syncs activity from Redis to PostgreSQL.

**Estimated savings:** -1 DB call per authenticated request.

### IMPACT 7 — Shipment Schedule Loop Transactions

**Problem:** `shipmentScheduleService.ts` creates shipments in a loop inside transactions (L239-269, L325-355, L436-476). Each iteration allocates DB writes within the transaction, extending lock duration.

**Fix:** Batch all shipment creates into a single `createMany` instead of iterating with individual `create` calls inside the transaction.

### IMPACT 8 — Unbounded N+1 in Cron Jobs

**Problem:** Cron jobs that iterate all clinics (`runCronPerTenant`) perform DB operations per clinic sequentially. With 10+ clinics, each holding connections for the loop duration, this creates sustained pool pressure during cron windows.

**Files:** All `src/app/api/cron/**/route.ts` files

**Fix:** Add `p-limit(3)` concurrency control to `runCronPerTenant` so at most 3 clinics are processed in parallel.

---

## G) Immediate Emergency Mitigations (If Under Active Risk)

### If P2024 is occurring RIGHT NOW:

1. **Kill idle connections immediately:**
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle' 
   AND state_change < NOW() - INTERVAL '5 minutes';
   ```

2. **Reduce connection limit to 1:**
   ```bash
   # Vercel Environment Variables
   DATABASE_CONNECTION_LIMIT=1
   ```

3. **Disable non-critical cron jobs temporarily:**
   - `affiliate-payouts` — holds advisory lock
   - `competition-scores` — iterates all clinics
   - `email-digest` — iterates all clinics
   - `platform-fees` — iterates all clinics

4. **Add `idle_in_transaction_session_timeout` to RDS:**
   ```sql
   ALTER DATABASE yourdb SET idle_in_transaction_session_timeout = '60s';
   ```
   This kills transactions that have been idle for >60s, freeing their connections.

5. **Monitor actively:**
   ```sql
   SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
   SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
   SELECT current_setting('max_connections');
   ```

---

## Detailed Findings by Audit Category

### 1. Prisma Client Instantiation — ✅ GOOD

- **Singleton pattern correctly implemented** in `src/lib/db.ts` (L371-372):
  ```
  const _rawBasePrisma = globalForPrisma.prisma ?? createPrismaClient();
  globalForPrisma.prisma = _rawBasePrisma;
  ```
- `globalThis` caching prevents multiple clients in serverless.
- **No accidental `new PrismaClient()` in src/**: All runtime code imports from `@/lib/db`.
- **Scripts correctly create separate clients** (30+ scripts in `scripts/`) — these run outside the app process and are non-issue.

### 2. Connection Pool Configuration — ⚠️ NEEDS ATTENTION

- **Serverless config is well-designed** (`src/lib/database/serverless-pool.ts`):
  - Without proxy: `connection_limit=1` on Vercel (L87-89)
  - With RDS Proxy: `connection_limit=5` on Vercel (L85)
  - Auto-detection of proxy via URL pattern (L63)
- **Risk:** `DATABASE_CONNECTION_LIMIT` env var can override to 10 (L74-79)
- **Risk:** Without `USE_RDS_PROXY=true` AND proxy hostname detection, defaults to limit=1, which is safe but slow.
- **Missing:** No `idle_in_transaction_session_timeout` on RDS — hung transactions hold connections indefinitely.

### 3. Long-Lived Transactions — ⚠️ HIGH RISK

- **55 total `$transaction` usages** across `src/`.
- **Only ~12 specify explicit timeouts** (search for `timeout:` near `$transaction`).
- **6 use `Serializable` isolation** — these acquire row-level locks and are the most dangerous for contention:
  - `patient.repository.ts`: create, update, delete (L509, L570, L758)
  - `prescriptions/route.ts`: order creation (L690)
  - `affiliate/withdraw/route.ts`: payout (L221)
  - `attributionService.ts`: patient attribution (L893)
  - `payoutService.ts`: commission payout (L438)
  - `affiliate/auth/onboarding/route.ts`: affiliate creation (L459)
- **No nested transactions detected** ✅
- **No non-DB async inside transactions detected** ✅ (external API calls are correctly placed outside transactions)

### 4. Unbounded Parallelism — ⚠️ MEDIUM RISK

- **Promise.all with DB calls in middleware:**
  - `middleware.ts` L785: `Promise.all([basePrisma.userClinic.findFirst, basePrisma.providerClinic.findFirst])`
  - `middleware-with-params.ts` L47: Same pattern
  - With `connection_limit=5`, this is safe per-instance. With `connection_limit=1`, the two queries serialize on the same connection (no parallelism risk, but slow).

- **Promise.all with DB calls in services:** Present in ~100+ files (see grep results). Most are bounded (2-5 concurrent calls). No truly unbounded arrays detected feeding into `Promise.all` with DB operations.

### 5. Missing Await / Dangling Promises — ⚠️ LOW RISK

- **Intentional fire-and-forget in middleware:**
  - `updateSessionActivity(user.id, ...).catch(() => {})` — L640 in middleware.ts
  - `clearAuthFailures(clientIP).catch(() => {})` — L447
- These are DB calls (one `$executeRaw` and one Redis operation). The `$executeRaw` for session activity is the concerning one — it consumes a DB connection even when the response is already sent.

### 6. Middleware DB Usage — ❌ CRITICAL

**`withAuth` (middleware.ts) — runs on EVERY authenticated request:**

| Operation | Line | DB Call | Connection Impact |
|-----------|------|---------|-------------------|
| Subdomain clinic lookup | 601 | `basePrisma.clinic.findFirst` | 1 connection, ~10ms |
| Session activity update | 114 | `prisma.$executeRaw` (fire-and-forget) | 1 connection, ~15ms |
| User clinic access | 786 | `basePrisma.userClinic.findFirst` | 1 connection, ~10ms |
| Provider clinic access | 795 | `basePrisma.providerClinic.findFirst` | 1 connection, ~10ms |

**Total per request: 2-4 DB calls** (subdomain is sometimes cached; access check only for non-default clinic).

**Impact at 200 concurrent requests:**
- Subdomain lookup: 200 × ~10ms = 2s aggregate DB time (if not cached)
- Session activity: 200 × ~15ms = 3s aggregate DB time
- Clinic access: 200 × 2 × ~10ms = 4s aggregate DB time
- **Total: ~9s of aggregate connection hold time per wave**

**`withAuthParams` (middleware-with-params.ts):**
- Same pattern, separately implemented (not sharing cache or code)
- Adds another 2-3 DB calls per request for routes using this wrapper

### 7. Background Jobs & Workers — ⚠️ MEDIUM RISK

**BullMQ Workers (`src/lib/queue/jobQueue.ts`):**
- Default concurrency: 5 workers per job type (L242)
- 15 job types × 5 concurrent = 75 potential parallel workers
- **Workers do NOT create new Prisma clients** ✅ — they import from `@/lib/db`
- **Risk:** If all workers run simultaneously with heavy DB operations, they compete with API traffic for the same pool.

**Cron Jobs (11 cron routes):**
- `health-monitor`: 1 `SELECT 1` query (low impact)
- `affiliate-payouts`: Advisory lock + multi-clinic iteration (HIGH impact)
- `process-scheduled-emails`: Iterates emails, sends per-clinic
- `reconcile-payments`: Payment matching per-clinic
- `affiliate-data-retention`: Data cleanup queries
- `competition-scores`: Per-clinic aggregation
- `email-digest`: Per-clinic notification aggregation
- `platform-fees`: Fee calculation per-clinic
- `refill-scheduler`: Refill date processing

**Combined cron + API pressure estimate:**
- Crons fire on Vercel as regular serverless functions
- If 3-4 crons overlap (e.g., 6 AM daily window) and each holds 1-3 connections for 10-30 seconds, that's ~12 additional connections during the cron window.
- **Low risk in isolation, but additive during peak traffic.**

### 8. Hot Path Analysis — ❌ HIGH RISK

**Routes with highest DB-operations-per-request:**

| Route | DB Operations | Frequency | Risk |
|-------|--------------|-----------|------|
| `POST /api/prescriptions` | 8-12 | Medium (clinical) | HIGH |
| `POST /api/patients/protected` | 5-7 | Medium (registration) | MEDIUM |
| `GET /api/internal/messages` | 3-5 (polled every 4-5s) | **VERY HIGH** | **CRITICAL** |
| `POST /api/auth/login` | 3-5 (with failed attempt tx) | High (auth) | MEDIUM |
| `POST /api/stripe/webhook` | 5-10 (webhook bursts) | Burst | HIGH |
| `GET /api/admin/patients` | 3-5 (list with joins) | Medium | MEDIUM |
| `POST /api/affiliate/withdraw` | 5-7 (Serializable tx) | Low | LOW |

**Polling amplification (`/api/internal/messages`):**
- InternalChat component polls every 4-5 seconds
- 20 active admin/staff users × 1 poll/5s = 4 requests/second
- Each poll hits auth middleware (2-4 DB calls) + handler query
- **Sustained load of ~12-24 DB calls/second just from chat polling**

### 9. Worst-Case Simulation Model

```
SCENARIO: 200 concurrent users hit /api/patients/[id] simultaneously
═══════════════════════════════════════════════════════════════════

Step 1: Auth Middleware (withAuth)
  ├─ Rate limit check (Redis, no DB)           = 0 DB calls
  ├─ JWT verification (in-memory)              = 0 DB calls
  ├─ Session validation (Redis)                = 0 DB calls
  ├─ Subdomain clinic lookup                   = 1 DB call  (if not cached)
  ├─ Session activity update (fire-and-forget) = 1 DB call
  └─ Clinic access check (if subdomain ≠ JWT) = 2 DB calls (Promise.all)
                                        SUBTOTAL: 2-4 DB calls

Step 2: Handler (patient lookup)
  ├─ Patient findUnique                        = 1 DB call
  └─ Related data (orders, prescriptions)      = 1-2 DB calls
                                        SUBTOTAL: 2-3 DB calls

TOTAL PER REQUEST:                     4-7 DB calls

CONNECTION ANALYSIS:
  With connection_limit=1 (no proxy):
    200 instances × 1 connection = 200 connections
    Queries serialize: 7 calls × 25ms = 175ms per request
    Throughput: 200 req / 175ms = ~1,143 req/s theoretical
    ✅ Safe (200 < 1800 max_connections)
    ⚠️ But tail latency suffers (serialized queries)

  With connection_limit=5 (RDS Proxy):
    200 instances × 5 connections = 1,000 proxy connections
    Parallel queries: ~75ms per request  
    ✅ Safe (1,000 < 1,800 max via proxy pooling)
    
  EXHAUSTION POINT (no proxy):
    If DATABASE_CONNECTION_LIMIT=10 (old incident config):
    200 instances × 10 = 2,000 > 1,800
    ❌ IMMEDIATE EXHAUSTION (matches Feb 12 incident)

  EXHAUSTION POINT (with proxy):
    Proxy can pool 1,000 → 900 real connections
    Safe up to ~360 Vercel instances (360 × 5 = 1,800)
    Beyond 360 instances: EXHAUSTION
```

---

## Summary of All Transaction Usages (with timeout status)

| File | Isolation | Timeout Set? | Risk |
|------|-----------|-------------|------|
| `patient.repository.ts` (create) | Serializable | ✅ 30s | Low |
| `patient.repository.ts` (update) | Serializable | ✅ 30s | Low |
| `patient.repository.ts` (delete) | Serializable | ✅ 30s | Low |
| `prescriptions/route.ts` | Serializable | ✅ 30s | Medium |
| `affiliate/withdraw/route.ts` | Serializable | ✅ 15s | Low |
| `attributionService.ts` | Serializable | ✅ 15s | Medium |
| `payoutService.ts` | Serializable | ❌ | **HIGH** |
| `affiliate/auth/onboarding/route.ts` | Serializable | ✅ 15s | Low |
| `affiliate/auth/reset-password/route.ts` | Serializable | ✅ 15s | Low |
| `tierService.ts` | Serializable | ❌ | **HIGH** |
| `bloodwork/service.ts` | ReadCommitted | ✅ 15s | Low |
| `patient-merge.service.ts` | Serializable | ✅ 30s | Low |
| `super-admin/affiliates/[id]/route.ts` (DELETE) | Default | ✅ 30s | Low |
| `super-admin/affiliates/route.ts` | Default | ❌ | Medium |
| `auth/registration.ts` (3 calls) | Default | ❌ | **HIGH** |
| `order.repository.ts` | Default | ❌ | **HIGH** |
| `stripe/invoiceService.ts` | Default | ❌ | Medium |
| `stripe/paymentService.ts` | Default | ❌ | Medium |
| `clinicInvoiceService.ts` (3 calls) | Default | ❌ | Medium |
| `notifications/preferences/route.ts` | Default | ❌ | Low |
| `auth/login/route.ts` | Default | ❌ | Medium |
| `pricing/pricingEngine.ts` (array form) | Default | ❌ | Low |
| `stripe/refunds/route.ts` (2 calls) | Default | ❌ | Medium |
| `intake-forms/service.ts` (3 calls) | Default | ❌ | Medium |
| `patients/protected/route.ts` | Default | ❌ | Medium |
| `shipmentScheduleService.ts` (3 calls) | Default | ❌ | **HIGH** |
| `admin/sales-reps/bulk-reassign/route.ts` | Default | ✅ 60s | ⚠️ Long |
| `ticket.service.ts` (10 calls) | Default | ❌ | **HIGH** |

**43+ transactions without explicit timeout = HIGH aggregate risk**

---

## WebSocket / Real-time Assessment

- `src/lib/realtime/websocket.ts` uses Socket.IO but does **not** directly perform DB operations.
- Authentication is handled via `verifyToken` (Redis-based session check).
- Presence tracking uses Redis (`cache` module), not PostgreSQL.
- **WebSocket layer is NOT a pool exhaustion vector.** ✅

---

## Applied Fixes (2026-02-17)

### ✅ P0: Connection Limit Reduced (5→3)
- **File:** `src/lib/database/serverless-pool.ts`
- Default RDS Proxy connection limit reduced from 5 to 3 per Vercel instance.
- Extends safe scaling ceiling from ~360 to ~600 Vercel instances.

### ✅ P1: Middleware DB Calls Eliminated via Redis Cache
- **New file:** `src/lib/auth/middleware-cache.ts` — shared cache layer
- **Modified:** `src/lib/auth/middleware.ts`, `src/lib/auth/middleware-with-params.ts`
- Subdomain→clinicId: now resolved via Redis (5 min TTL) instead of `basePrisma.clinic.findFirst` per request.
- Clinic access check: now cached in Redis (5 min TTL) instead of `Promise.all([userClinic, providerClinic])` per request.
- Session activity: now Redis-only (no more fire-and-forget `$executeRaw` UPDATE consuming a DB connection).
- **Impact:** Eliminates 3-4 DB calls per authenticated request.

### ✅ P1: Transaction Timeouts Added (~55 transactions)
- Added `{ timeout: 15000 }` to all callback-form `$transaction` calls that were missing timeouts.
- Serializable transactions also got `maxWait: 5000` where applicable.
- Array-form transactions (which don't support timeouts) were left unchanged.
- **Files modified (30+):** ticket.service.ts (10), provider.repository.ts (5), registration.ts (3), clinicInvoiceService.ts (3), shipmentScheduleService.ts (3), intake-forms/service.ts (3), and 20+ other files.

### Remaining Items

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | Add `idle_in_transaction_session_timeout=60s` to RDS (DBA task) | Prevents hung transactions holding connections | 5 min |
| **P0** | Verify `USE_RDS_PROXY=true` is set in production Vercel env (ops task) | Prevents direct-to-RDS at scale | 5 min |
| **P2** | Replace `/api/internal/messages` polling with WebSocket push | Eliminates 12-24 DB calls/s from chat | 16 hrs |
| **P2** | Add `p-limit(3)` to cron `runCronPerTenant` | Bounds cron DB concurrency | 2 hrs |
| **P3** | Optimize prescription route (combine 4 lookups into 1) | -3 DB calls per prescription POST | 4 hrs |
| **P3** | Batch shipment creates in `shipmentScheduleService.ts` | Reduces transaction duration | 3 hrs |
