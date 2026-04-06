# Redis Resilience Verification Report

## Deployment
- URL: `https://eonpro-9gcfabtex-eonpro1s-projects.vercel.app`
- Inspect: `https://vercel.com/eonpro1s-projects/eonpro/6rvrHyfNSwbWYYBRdzDKB4mk72j7`
- Date/Time (UTC): `2026-04-05T13:21:03.455Z`

## Config Snapshot
- `ENFORCE_REDIS_SLO_GATES`: `true`
- `REDIS_READY_MAX_FALLBACK_RATE`: `0.05`
- `REDIS_READY_MAX_TIMEOUT_RATE`: `0.01`
- `REDIS_READY_MIN_GUARDED_CALLS`: `20`
- `DLQ_DURABLE_FALLBACK_ENABLED`: `true`
- `REDIS_SCAN_MAX_KEYS`: `10000`
- `DLQ_SCAN_COUNT`: `200`
- `DLQ_SCAN_MAX_ENTRIES`: `5000`
- `MINIMIZE_DASHBOARD_CACHE_PAYLOAD`: `true`
- `ENCRYPT_SENSITIVE_CACHE`: `true`

## Verification Runs

### 1) Readiness/Health smoke
- `/api/ping`: `200`
- `/api/monitoring/ready`: `200`
- `/api/health`: `200`

### 2) Redis SLO probe
- Command:
  - `API_URL=https://eonpro-5d6j4cb97-eonpro1s-projects.vercel.app REDIS_VERIFY_WINDOW_SECONDS=45 REDIS_VERIFY_INTERVAL_MS=5000 npm run verify:redis-resilience`
- Result: `PASSED`
- Summary JSON:
```json
{
  "totalProbes": 9,
  "endpointErrors": 0,
  "endpointErrorRate": 0,
  "redisDegradedOrDown": 0,
  "avgLatencyMs": 367
}
```

### 3) Pre-deploy gate check
- Command:
  - `API_URL=https://eonpro-6fv8atlrz-eonpro1s-projects.vercel.app ENFORCE_REDIS_SLO_GATES=true npm run db:validate`
- Result: Redis/API gates passed; exit contained existing non-critical warning:
  - `17 patients with multiple active subscriptions`

## Observed Risks
- Existing domain-data warning remains outside Redis scope:
  - multiple active subscriptions for some patients
- Build still reports known upstream warnings (Prisma OpenTelemetry dynamic dependency, handlebars loader warning), but deployment completed successfully.

## Pass/Fail Decision
- [x] PASS
- [ ] FAIL
- Notes:
  - Redis resilience controls are live with healthy readiness status and passing SLO probe over the sampled window.
  - Continue periodic probe execution (e.g., every release and daily scheduled run) for trend detection.
