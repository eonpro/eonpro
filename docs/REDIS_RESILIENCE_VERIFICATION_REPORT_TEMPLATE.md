# Redis Resilience Verification Report

## Deployment
- URL:
- Commit/Build:
- Date/Time (UTC):

## Config Snapshot
- ENFORCE_REDIS_SLO_GATES:
- REDIS_READY_MAX_FALLBACK_RATE:
- REDIS_READY_MAX_TIMEOUT_RATE:
- REDIS_READY_MIN_GUARDED_CALLS:
- DLQ_DURABLE_FALLBACK_ENABLED:
- REDIS_SCAN_MAX_KEYS:
- DLQ_SCAN_COUNT:
- DLQ_SCAN_MAX_ENTRIES:

## Verification Runs

### 1) Readiness/Health smoke
- `/api/ping`:
- `/api/monitoring/ready`:
- `/api/health`:

### 2) Redis SLO probe
- Command:
  - `API_URL=<url> REDIS_VERIFY_WINDOW_SECONDS=120 REDIS_VERIFY_INTERVAL_MS=5000 npm run verify:redis-resilience`
- Result:
- Summary JSON:

### 3) Pre-deploy gate check
- Command:
  - `API_URL=<url> ENFORCE_REDIS_SLO_GATES=true npm run db:validate`
- Result:

## Observed Risks
- 

## Pass/Fail Decision
- [ ] PASS
- [ ] FAIL
- Notes:
