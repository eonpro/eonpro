# Invoice 503 & Internal Messages 500 — Runbook

When production shows:
- **POST /api/stripe/invoices 503 (Service Unavailable)** — invoice creation fails
- **GET /api/internal/messages?unreadOnly=true 500 (Internal Server Error)** — unread count polling fails

---

## POST /api/stripe/invoices — 503 Root Cause

The 503 is returned when **database connection pool is exhausted** (Prisma P2024, "connection pool", or "timed out fetching"). This commonly happens on serverless (Vercel) under load.

### What Happens
- `withRetry` attempts the operation up to 2 times with backoff
- If all retries fail with pool-related errors → returns 503 with `Retry-After: 10` header
- Client (`PatientBillingView`) retries once after waiting; if still failing, user sees "Failed to create invoice"

### Mitigations (in order)

1. **RDS Proxy** — Route database connections through RDS Proxy to pool at the proxy layer. Recommended for Vercel.
   - See `docs/infrastructure/RDS_PROXY_SETUP.md`
   - Ensure `DATABASE_URL` points to RDS Proxy endpoint (port 5432 on proxy)

2. **Connection string parameters** — For direct RDS (no proxy), use:
   ```
   ?pgbouncer=true&connection_limit=1
   ```
   (Serverless-friendly; limit connections per function instance.)

3. **Increase RDS max_connections** — If using direct RDS and many concurrent requests:
   - Check current: `SHOW max_connections;`
   - Vercel serverless can spin many instances; each holding 1 connection still adds up.

4. **Retry on client** — Already implemented: user gets one retry after 10s. If transient, second attempt often succeeds.

---

## GET /api/internal/messages?unreadOnly=true — 500 Root Cause

The unread endpoint is polled by `InternalChat` for the notification badge. Previously, any DB failure (schema drift, connection issues, etc.) returned 500.

### Fix Applied (Feb 2026)
- **Resilience change:** When both primary and fallback queries fail for `unreadOnly=true`, the API now returns **200 with `messages: []`** instead of 500.
- Result: Unread badge may show 0 during backend issues, but no repeated 500s in console. UX degrades gracefully.

### If 500 Still Occurs
- Check that migration `20260206_add_message_reactions` is applied (MessageReaction table).
- Verify `InternalMessage` and `User` tables exist and relations are correct.
- Review server logs for Prisma error codes (P2025, P2003, P2024) and address accordingly.

---

## Quick Diagnostics

| Symptom | Check |
|---------|-------|
| Invoice 503 persists after retry | DB pool exhausted; add RDS Proxy or increase connection capacity |
| Messages 500 (repeated) | Should be fixed; if not, verify migrations and schema |
| Both at once | Likely database connectivity or pool exhaustion affecting multiple routes |

---

## Related Docs
- `docs/infrastructure/RDS_PROXY_SETUP.md` — RDS Proxy setup
- `docs/DOCUMENT_UPLOAD_503_RUNBOOK.md` — Document upload 503 (S3-related)
