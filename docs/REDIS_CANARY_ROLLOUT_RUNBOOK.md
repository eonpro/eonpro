# Redis Canary Rollout Runbook

## Purpose
Safely roll out Redis guardrail and data-structure changes with measurable gates and fast rollback.

## Scope
- Guarded Redis execution (`cache.withClient`) adoption
- Session index set migration (`user_sessions_set:*`)
- DLQ paged hash scans
- DLQ durable fallback via WebhookLog (`DLQ_DURABLE_FALLBACK_ENABLED`)
- Cache privacy controls (payload minimization/encryption hooks)
- Redis SLO monitoring

## Pre-Deployment Checklist
1. `npm run test -- tests/unit/auth/session-store-index.test.ts tests/unit/queue/dead-letter-queue.test.ts`
2. `npm run test -- tests/unit/middleware/rate-limit.test.ts tests/unit/auth/auth-middleware.test.ts tests/unit/auth/middleware.test.ts`
3. Confirm production build passes.
4. Confirm health endpoints respond `200`:
   - `/api/ping`
   - `/api/monitoring/ready`
   - `/api/health`

## Canary Strategy
1. Deploy code to production.
2. Observe a 15-minute canary window.
3. Evaluate SLO gates below before broad traffic confidence sign-off.

## SLO Gates (must pass)
- **Redis fallback rate:** `< 5%` (from guardrail stats) after minimum 20 guarded calls.
- **Auth/session regression:** no increase in 401/403 anomalies from session lookups.
- **DLQ processing:** no spike in backlog growth due to read-path changes.
- **Latency:** no sustained increase in Redis health check latency above baseline.
- **Error budget:** no sustained increase in Redis timeout/failure logs.

## Key Signals to Watch
- `healthMonitor:checkRedisPing` status
- `healthMonitor:getRedisPrefixCounts` cardinality warnings
- `sessionStore:*` guardrail labels fallback/failure counts
- `deadLetterQueue:*` guardrail labels fallback/failure counts
- `enterpriseRateLimit:*` and `rateLimiterRedis:*` fallback rates

## Rollback Triggers
- Fallback rate exceeds threshold for 2 consecutive windows.
- Session retrieval inconsistency or logout/login anomalies.
- DLQ backlog spikes with no corresponding ingest spike.
- Health endpoint degradation linked to Redis operations.

## Rollback Actions
1. Redeploy previous stable build.
2. Keep legacy session list index read compatibility active (already dual-read).
3. Disable optional cache privacy flags if enabled:
   - `ENCRYPT_SENSITIVE_CACHE=false`
   - `MINIMIZE_DASHBOARD_CACHE_PAYLOAD=false`
4. Continue monitoring until fallback/error metrics normalize.

## Post-Canary Completion
1. Record metrics snapshot (fallback rate, error count, prefix cardinality).
2. Confirm no auth/session regression in operational logs.
3. Sign off rollout in deployment notes.
