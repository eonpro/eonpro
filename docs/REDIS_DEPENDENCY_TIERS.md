# Redis Dependency Tiers and On-Call Matrix

## Tiering Model

### Tier A: Auth Controls
- Systems: session indexing, auth middleware cache, rate limiting
- Degradation mode: `fail_open` with explicit alerts
- Operator objective: preserve availability while monitoring security-risk amplification

### Tier B: Performance Cache
- Systems: dashboard/geo/general caches
- Degradation mode: `best_effort`
- Operator objective: accept temporary latency increase, avoid user-visible errors

### Tier C: Retry Pipeline
- Systems: DLQ metadata and retry orchestration
- Degradation mode: `fail_closed`
- Operator objective: protect retry durability and prevent silent loss

## Release Gate Policy

Deploy gate is controlled by `ENFORCE_REDIS_SLO_GATES`.

- If `false`:
  - Redis SLO breaches are warnings.
- If `true`:
  - pre-deploy check blocks deployment when Redis readiness reports `degraded`/`down` due to SLO breach.

Redis readiness SLO thresholds:
- `REDIS_READY_MAX_FALLBACK_RATE` (default `0.05`)
- `REDIS_READY_MAX_TIMEOUT_RATE` (default `0.01`)
- `REDIS_READY_MIN_GUARDED_CALLS` (default `20`)

## On-Call Matrix

- Tier A incident:
  - Owner: Auth/Security on-call
  - Immediate actions: review fallback surge, tighten temporary controls, monitor auth error ratio
- Tier B incident:
  - Owner: Platform performance on-call
  - Immediate actions: verify degraded-mode behavior, inspect DB latency, tune cache TTLs if needed
- Tier C incident:
  - Owner: Integrations/reliability on-call
  - Immediate actions: stop risky retries, verify DLQ durability path, trigger manual replay if needed

## Incident Triggers

- Redis fallback rate over threshold for 2 windows
- Redis timeout rate over threshold for 2 windows
- Tier C write/read failures impacting retry durability

## Safe Rollback

1. Set `ENFORCE_REDIS_SLO_GATES=false` if release is blocked due to transient Redis instability.
2. Redeploy previous stable build.
3. Keep feature flags conservative:
   - `ENCRYPT_SENSITIVE_CACHE=false`
   - `MINIMIZE_DASHBOARD_CACHE_PAYLOAD=false`
