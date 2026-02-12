# Invoice Creation Connection Pool Timeout — Deep Dive

**Incident:** Database connection pool timeout when creating an invoice on eonmeds.eonpro.io  
**Date:** 2026-02-12  
**Clinic:** EonMeds (eonmeds.eonpro.io)  
**User Action:** Create Invoice form — "Mark as Paid Externally" with "Paid on Stripe (not synced)"

---

## Executive Summary

The user received this error when clicking "Create Invoice":

```
Invalid 'prisma.invoice.findFirst()' invocation: 
Timed out fetching a new connection from the connection pool.

(Current connection pool timeout: 15, connection limit: 10)
More info: http://pris.ly/d/connection-pool
```

This indicates **connection pool exhaustion**: the API route could not obtain a database connection within 15 seconds. The failure occurred on the **first** Prisma call in the invoice creation flow (`invoice.findFirst` for duplicate prevention), suggesting the pool was already saturated before this request.

---

## Root Cause Analysis

### 1. Connection Pool Configuration

The error reports `connection_limit: 10` and `pool_timeout: 15`. This implies:

- **Likely deployment:** Non-Vercel (e.g., ECS, EC2, Docker), where `getServerlessConfig()` allows up to 10 connections when `DATABASE_CONNECTION_LIMIT=10` is set
- **`env.production.example`** explicitly sets `DATABASE_CONNECTION_LIMIT=10`, which is used in non-serverless environments

With 10 connections per instance and no RDS Proxy/PgBouncer in front:

- Concurrent requests from multiple users/tabs/background tasks exhaust the pool
- Each request holds a connection for the duration of its DB work
- The invoice route performs **many sequential DB calls** before completing, holding connections longer than necessary

### 2. Invoice Creation Flow — Why It’s Heavy

The `POST /api/stripe/invoices` handler (`src/app/api/stripe/invoices/route.ts`) performs a long sequence of Prisma calls **before** the main transaction:

| Step | Call | Purpose |
|------|------|---------|
| 1 | `invoice.findFirst` | Duplicate check: idempotency key (optional) |
| 2 | `invoice.findFirst` | Duplicate check: same order within 5 min (if `orderId`) |
| 3 | `invoice.findFirst` | Duplicate check: same amount within 2 min |
| 4 | `product.findMany` or N×`product.findUnique` | Build line items from `productIds` or validate per-item `productId` |
| 5 | `patient.findUnique` | Resolve `clinicId` for multi-tenant isolation |

Then, for the "Mark as Paid Externally" path:

| Step | Call | Purpose |
|------|------|---------|
| 6 | `prisma.$transaction` | Holds one connection for the entire transaction |
| 6a | `invoice.create` | Create invoice |
| 6b | N×`invoiceItem.create` | One per line item (loop) |
| 6c | `payment.create` | External payment record |

**Issues identified:**

1. **Sequential duplicate checks** — Up to 3 separate `findFirst` calls instead of a single combined query.
2. **N+1 on products** — If line items include `productId`, the code loops and calls `product.findUnique` per item (lines 164–170).
3. **JSON path query** — `metadata.path['idempotencyKey']` on `Invoice` can be slow without a GIN index on the `metadata` JSONB column.
4. **Long transaction** — The transaction includes a loop of `invoiceItem.create`, which keeps the connection busy.

### 3. Why the First `findFirst` Failed

The failure on the **first** `invoice.findFirst` means:

- The connection pool was already exhausted when this request arrived
- Other concurrent requests (other users, background jobs, polling) were using all 10 connections
- No connection became free within the 15-second pool timeout

So this incident is primarily an **infrastructure/load** problem, made worse by the fact that the invoice route is DB-heavy and holds connections for a long time.

---

## Affected Code Paths

### Primary route

- **API:** `POST /api/stripe/invoices`
- **Handler:** `createInvoiceHandler` in `src/app/api/stripe/invoices/route.ts`
- **Client:** `PatientBillingView.tsx` → `fetch('/api/stripe/invoices', { method: 'POST', ... })`

### Duplicate prevention (lines 50–136)

```typescript
// Three sequential findFirst calls - each acquires/releases connection
if (validatedData.idempotencyKey) {
  const existingByKey = await prisma.invoice.findFirst({...});  // ← Can time out here
}
if (validatedData.orderId) {
  const existingByOrder = await prisma.invoice.findFirst({...});
}
if (totalAmount > 0) {
  const existingByAmount = await prisma.invoice.findFirst({...});
}
```

### N+1 product lookup (lines 164–170)

```typescript
for (const item of lineItems) {
  if (item.productId) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    // ...
  }
}
```

---

## Recommendations

### Immediate (Reduce Pool Pressure)

1. **Verify RDS Proxy / PgBouncer**
   - Ensure `DATABASE_URL` points to a pooled endpoint (RDS Proxy or PgBouncer).
   - Docs: `docs/infrastructure/RDS_PROXY_SETUP.md`, `docs/ENTERPRISE_DATABASE_HEALTH_INCIDENT_RUNBOOK.md`.

2. **Lower `connection_limit` per instance**
   - If not using a pooler: reduce `DATABASE_CONNECTION_LIMIT` (e.g. 3–5) so fewer connections are used per app instance.
   - With RDS Proxy: `connection_limit=1` per instance is recommended.

3. **Check production config**
   ```bash
   curl -s https://app.eonpro.io/api/_health/db-check | jq '.connectionParams'
   ```
   Verify `connection_limit` and whether RDS Proxy is in use.

### Short-Term (Code Optimizations)

4. **Combine duplicate checks into one query**
   - Replace three `findFirst` calls with a single `findFirst` using an `OR` condition.
   - Fewer round-trips, shorter time holding connections.

5. **Batch product lookups**
   - Replace the per-item `product.findUnique` loop with a single `product.findMany({ where: { id: { in: productIds } } })`.
   - Eliminates N+1.

6. **Add retry for pool timeouts**
   - Wrap Prisma calls with `withRetry` for pool timeout (P2024) and transient errors.
   - Same pattern as in `src/app/api/auth/login/route.ts` and `docs/ENTERPRISE_LOGIN_RESILIENCE_STRATEGY.md`.

7. **Add indexes for duplicate checks**
   - Consider indexes on `Invoice(patientId, orderId, createdAt)` and `Invoice(patientId, amountDue, createdAt)` for the duplicate-prevention queries.
   - For idempotency, consider a GIN index on `metadata` if JSON path queries are slow (measure first).

### Long-Term (Infrastructure)

8. **RDS Proxy or PgBouncer**
   - Use connection pooling so many app instances share a smaller number of DB connections.
   - This is the main mitigation for P2024.

9. **Monitoring and alerting**
   - Alert on P2024 in logs.
   - Monitor `pg_stat_activity` and connection usage.
   - Add metrics for invoice creation latency and failure rate.

---

## Related Documentation

- `docs/ENTERPRISE_DATABASE_HEALTH_INCIDENT_RUNBOOK.md` — DB incident response
- `docs/ENTERPRISE_LOGIN_RESILIENCE_STRATEGY.md` — P2024 handling and retries
- `docs/infrastructure/RDS_PROXY_SETUP.md` — RDS Proxy setup
- `docs/TROUBLESHOOTING.md` — Login 503 / pool exhaustion
- `src/lib/database/serverless-pool.ts` — Connection pool configuration

---

## Implementation Status (2026-02-12)

The following enterprise-level fixes have been implemented:

1. **Combined duplicate check** — Three `findFirst` calls replaced with a single `findFirst` using `OR` conditions. One round-trip instead of up to three.

2. **Batched product lookup** — N+1 `product.findUnique` loop replaced with one `product.findMany({ where: { id: { in: productIds } } })`.

3. **withRetry on preflight** — Duplicate check, product fetch, and patient lookup wrapped in `withRetry` (max 2 retries) for P2024/connection pool errors.

4. **withRetry on transactions** — All `prisma.$transaction` and `prisma.invoice.create` calls wrapped in `withRetry` for transient pool exhaustion.

5. **P2024 → 503 with Retry-After** — Catch block detects pool exhaustion and returns 503 with `Retry-After: 10` (matches login resilience).

6. **Client retry on 503** — `PatientBillingView` retries once after `Retry-After` seconds when the API returns 503.

---

## Appendix: Invoice Schema (Relevant Fields)

```prisma
model Invoice {
  id           Int      @id @default(autoincrement())
  patientId    Int
  clinicId     Int?
  orderId      Int?
  amount       Int
  amountDue    Int
  amountPaid   Int
  status       InvoiceStatus @default(DRAFT)
  metadata     Json?
  createdAt    DateTime @default(now())
  // ...
}
```

Duplicate checks use: `patientId`, `orderId`, `amountDue`, `createdAt`, `metadata.path`, `status`.
