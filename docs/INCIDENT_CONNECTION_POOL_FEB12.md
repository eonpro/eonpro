# Incident: Connection Pool Exhaustion – Feb 12, 2026

## Summary

**Error:** `Invalid 'prisma.provider.findUnique()' invocation: Timed out fetching a new connection from the connection pool`  
**Context:** `connection pool timeout: 15, connection limit: 10`  
**Impact:** Rx Queue, prescription flow, `/api/internal/messages` (notification polling), and other DB-dependent routes return 500.

---

## Root Cause

**Database connection pool exhaustion (Prisma P2024).** The app cannot obtain a DB connection within the 15s timeout. The `connection_limit: 10` indicates either:

1. **No RDS Proxy / PgBouncer** – Direct RDS connection with multiple serverless instances
2. **`DATABASE_CONNECTION_LIMIT=10`** – Explicitly set (not recommended on Vercel)
3. **High concurrency** – Many Vercel instances × connections = pool exhausted

---

## Immediate Mitigation

### 1. Verify connection configuration (run locally or from a working env)

```bash
curl -s https://app.eonpro.io/api/_health/db-check | jq '.connectionParams, .rootCause, .recommendations'
```

Check:
- `connection_limit` – should be `1` on Vercel
- `isRdsProxy` – should be `true` if using RDS Proxy
- `host` – should point to RDS Proxy (`.proxy-` in hostname) when available

### 2. Reduce connection usage

- Ensure `DATABASE_URL` includes `?connection_limit=1&pool_timeout=15`
- If `DATABASE_CONNECTION_LIMIT` is set (e.g. to 10), remove it or set to `1` for Vercel
- Avoid any env override that raises the connection limit on serverless

### 3. Lower Vercel function concurrency (short-term)

Vercel Dashboard → Project → Settings → Functions → set "Max Duration" and reduce concurrency if possible to limit simultaneous instances.

### 4. Long-term: RDS Proxy

See `docs/infrastructure/RDS_PROXY_SETUP.md`. RDS Proxy multiplexes many app connections into a smaller set of DB connections and prevents P2024 under burst load.

---

## Contributing Load

- **InternalChat** polls `/api/internal/messages?unreadOnly=true` every 4–5 seconds. With a stressed pool, these requests add load and return 500.
- **Rx Queue** loads provider and patient data via Prisma; these are among the first calls to fail when the pool is exhausted.

---

## Runbook Reference

Full steps: `docs/ENTERPRISE_DATABASE_HEALTH_INCIDENT_RUNBOOK.md`
