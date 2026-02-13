# Enterprise Database Health Incident Runbook

## Overview

Use this runbook when the health endpoint reports:

- `status: unhealthy`
- `database: unhealthy`
- `responseTime: ~4000ms`

## Quick Diagnostics

### 1. Print DATABASE_URL connection parameters (password masked)

**Option A: CLI script**

```bash
npx tsx scripts/print-db-connection-params.ts
```

**Option B: API endpoint**

```bash
curl -s https://your-domain.com/api/_health/db-check | jq '.connectionParams'
```

Verify:

| Parameter | Expected (Vercel/RDS) | Problem Indicators |
|-----------|------------------------|---------------------|
| `connection_limit` | `1` | >1 on Vercel → pool exhaustion |
| `pool_timeout` | `15` | Too low → premature failures |
| `sslmode` | `require` (prod) | Missing → connection refused |
| `host` | RDS Proxy endpoint or direct RDS | Wrong host → P1001 |
| `isRdsProxy` | `true` (recommended) | `false` + many instances → P2024 |
| `isPgBouncer` | `true` (if using) | N/A |

### 2. Call the DB check endpoint

```bash
curl -s https://your-domain.com/api/_health/db-check
```

Response includes:

- `connectionParams` – host, limits, sslmode (Task 1)
- `select1` – `SELECT 1` result and latency (Task 2)
- `prismaError` – codes P1001, P1002, P2024 (Task 3)
- `pgStatActivity` – `count(*)` and `state, count(*)` (Task 4)
- `maxConnections` – RDS `max_connections` (Task 5)
- `rootCause` – classification
- `recommendations` – recommended actions
- `mitigationSteps` – immediate steps

### 3. RDS max_connections (if using RDS)

```sql
SELECT current_setting('max_connections');
```

Default RDS PostgreSQL: ~79–100 depending on instance class. Check AWS Console → RDS → Parameter Groups.

## Root Cause Classification

| Root Cause | Prisma Code | Symptoms | Next Step |
|------------|-------------|----------|-----------|
| **unreachable_host** | P1001 | Can't reach database server | Check host, firewall, security groups |
| **connection_timeout** | P1002 | Connection timed out | Check network, DB load, read replica lag |
| **pool_exhaustion** | P2024 | Timed out fetching connection | Add RDS Proxy, reduce connection_limit |
| **rds_connection_limit_near** | — | pg_stat_activity near max_connections | Reduce connections or add pooler |
| **pool_timeout_or_exhaustion** | — | Generic pool message | Treat as P2024 |

## Recommended Pool Configuration

### Vercel + RDS (Production)

```
DATABASE_URL="postgresql://user:***@eonpro-proxy.proxy-xxx.us-east-2.rds.amazonaws.com:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=15"
```

- Use **RDS Proxy** endpoint (host contains `.proxy-`), not direct RDS
- `connection_limit=1` per function instance
- `pool_timeout=15` (matches Prisma default)

### Vercel + Supabase/Neon

```
DATABASE_URL="postgresql://...@...supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"
```

- Use pooled URL (port 6543 for Supabase Transaction mode)
- `pgbouncer=true` for Prisma compatibility
- `connection_limit=1`

### Without pooler (temporary)

If RDS Proxy/PgBouncer is not yet deployed:

```
connection_limit=1
```

Keep Vercel function concurrency low until a pooler is in place.

## Immediate Mitigation Steps

### P1001 (Unreachable host)

1. Confirm `DATABASE_URL` host is correct.
2. Check AWS Security Groups allow inbound from app (Vercel IPs or NAT).
3. If using RDS Proxy: ensure proxy endpoint is in `DATABASE_URL`, not direct RDS.
4. Verify RDS instance is running and in the same region/VPC.

### P1002 (Connection timeout)

1. Run `GET /api/_health/db-check` when DB is reachable to get `pg_stat_activity`.
2. Add RDS Proxy for connection multiplexing.
3. Check for long-running queries (`pg_stat_activity` `state='active'`).

### P2024 (Pool exhaustion)

1. Add `?connection_limit=1` to `DATABASE_URL` if not set.
2. Deploy RDS Proxy and point `DATABASE_URL` to proxy endpoint.
3. Reduce Vercel function concurrency temporarily.
4. Inspect `pg_stat_activity` total vs `max_connections`.

### RDS connection limit exceeded

1. Deploy RDS Proxy (recommended).
2. Or lower `connection_limit` per instance.
3. Optionally increase `max_connections` in RDS parameter group (only with proper sizing).

## Opening Room on Database Requests

When connections are saturated and you need immediate headroom:

| Action | Where | Effect |
|--------|-------|--------|
| Enforce `connection_limit=1` | `DATABASE_URL` or app (auto on Vercel) | 1 connection per function instance |
| Reduce Vercel function concurrency | Vercel → Project → Settings → Functions | Fewer concurrent instances = fewer connections |
| Deploy RDS Proxy | AWS RDS → Proxies | Multiplex many app connections into fewer DB connections |
| Increase `max_connections` | RDS Parameter Group | More DB capacity (temporary; pooler preferred) |

### Reduce Vercel function concurrency (quick mitigation)

1. Vercel Dashboard → **Your project** → **Settings** → **Functions**
2. Find **Concurrency** or **Invocation concurrency** (Serverless Function Execution)
3. Lower from default (e.g. 1000) to 50–100 to reduce simultaneous DB connections
4. Revert after RDS Proxy is in place

### RDS Proxy setup

See [RDS Proxy Setup](./infrastructure/RDS_PROXY_SETUP.md). Once deployed, update `DATABASE_URL` to use the proxy endpoint (host contains `.proxy-`).

### Verify connection params

```bash
curl -s https://app.eonpro.io/api/_health/db-check | jq '.connectionParams, .pgStatActivity, .maxConnections'
```

## Useful Queries

```sql
-- Total connections
SELECT count(*) FROM pg_stat_activity;

-- By state
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- Long-running queries
SELECT pid, state, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;
```

## References

- [RDS Proxy Setup](./infrastructure/RDS_PROXY_SETUP.md)
- [Troubleshooting](./TROUBLESHOOTING.md) – Login 503, P2024
- [Production Env Template](./PRODUCTION_ENV_TEMPLATE.md)
