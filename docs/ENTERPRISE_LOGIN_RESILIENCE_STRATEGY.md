# Enterprise Login Resilience Strategy

## Executive Summary

Login failures have recurring causes: browser extensions, database pool exhaustion, network timeouts, and infrastructure errors. This strategy defines a multi-pillar approach to reduce incidents, improve diagnostics, and provide a reliable login experience at enterprise scale.

---

## Part 1: Root Cause Taxonomy

| Category | Symptoms | Root Cause | Severity |
|----------|----------|------------|----------|
| **Client extensions** | "Logging in..." forever; console errors (`FrameDoesNotExistError`, `utils.js` not found) | Password managers, ad blockers injecting into page; request never completes or response corrupted | Medium (user recoverable) |
| **Network/timeout** | "Login is taking too long" in incognito | Slow API, cold start, firewall/VPN blocking | High |
| **DB pool (503)** | "Service is busy. Please try again in a moment." | Prisma P2024; serverless connections exhaust RDS limit | Critical |
| **Clinic resolve** | 500 on page load; login fails | DB error or schema mismatch in `/api/clinic/resolve` | High |
| **Cron/background** | 500 in Vercel logs (e.g. `process-scheduled-emails`) | Schema mismatch, cron query errors (e.g. `isActive` on Clinic) | Medium (doesn't block login but indicates fragility) |
| **Wrong clinic domain** | "This login page is for a different clinic" | User on wrong subdomain | Low (correctable) |
| **Rate limiting** | 429 with CAPTCHA/email verification | Too many failed attempts | Low (intended) |
| **Session/JWT** | 401 "Invalid session" after login | Session not created, refresh token missing | High |

---

## Part 2: Strategy Pillars

### Pillar A — Resilience (Server & Client)

**Objectives:** Reduce impact of transient failures; prevent cascading; graceful degradation.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **RDS Proxy** | Use RDS Proxy (or PgBouncer) for connection pooling. Eliminates P2024 under burst load. | High (ops) |
| **Login retry with backoff** | Client retries failed login (non-429, non-4xx) up to 2 times with exponential backoff. | Low |
| **Pre-login health check** | Login page pings `GET /api/ready` before enabling submit. If DB down, show "System maintenance" instead of allowing doomed attempts. | Low |
| **Clinic resolve fallback** | If `/api/clinic/resolve` fails, show default EONPRO branding and allow login (app.eonpro.io path). Don't block login on resolve. | Low |
| **Circuit breaker (optional)** | After N consecutive login failures (e.g. 5xx), temporarily show "Try again in 2 minutes" to avoid hammering. | Medium |

### Pillar B — Observability

**Objectives:** Detect issues early; correlate errors; support rapid diagnosis.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **Login metrics** | Emit login attempts, successes, failures (by status code, step, duration) to metrics/dashboards. | Medium |
| **Structured logging** | Ensure `step` is logged at each major phase (parse, rate-limit, user lookup, provider lookup, session, etc.). Already partially done. | Low |
| **Alerts** | Alert when login error rate > X% (e.g. 5%) or 503 rate spikes. | Medium |
| **Diagnostic endpoint** | `GET /api/auth/login/diagnostic` (public, no PHI): returns `{ dbConnected, lastErrorCode, uptime }` for support. | Low |
| **Sentry tagging** | Tag login errors with `prismaCode`, `step`, `statusCode` for grouping. Partially done. | Low |

### Pillar C — User Experience & Guidance

**Objectives:** Clear feedback; actionable next steps; avoid user confusion.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **Error taxonomy UI** | Map API error codes to user-facing messages and actions (e.g. 503 → "Service busy, retry in 10s" + Retry button). Partially done. | Low |
| **Timeout differentiation** | Distinguish AbortError (client timeout) vs server 504. Show "Check your network or try incognito" for AbortError. | Low |
| **Support link** | Always show "Having trouble? Contact support" with link; optionally include `?code=LOGIN_TIMEOUT` for support triage. | Low |
| **Pre-submit check** | If `/api/ready` returns 503, disable submit and show "System temporarily unavailable. We'll be back shortly." | Low |

### Pillar D — Infrastructure

**Objectives:** Stable database and API layer; proper timeouts and limits.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **RDS Proxy / Pooler** | Implement RDS Proxy or Vercel Postgres pooler per `docs/infrastructure/RDS_PROXY_SETUP.md`. | High |
| **Connection limit** | Set `?connection_limit=3` (or lower) in `DATABASE_URL` for serverless to avoid burst exhaustion. | Low |
| **Function timeout** | Ensure Vercel function timeout ≥ 30s for login (cold start + DB). | Low |
| **Cron hardening** | Audit all crons for schema mismatches (e.g. `isActive` vs `status` on Clinic). Use shared `getClinicIdsForCron()`. | Low (ongoing) |

### Pillar E — Runbooks & Automation

**Objectives:** Consistent response; self-service; fewer escalations.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **Login incident runbook** | Single runbook: "Login down" → check health → check logs → RDS Proxy → rollback. | Low |
| **Pre-deploy login smoke test** | In CI, after deploy: POST login (test user) and assert 200 or expected error. | Medium |
| **Dashboard** | Grafana/Vercel dashboard: login success rate, p95 latency, 503 count. | Medium |

---

## Part 3: Implementation Roadmap

### Phase 1 — Quick Wins (1–2 weeks)

1. **Pre-login health check** — Login page calls `GET /api/ready` on load. If 503, show "System temporarily unavailable" and disable submit.
2. **Retry button for 503** — When API returns 503 + `retryAfter`, show countdown and prominent "Retry" button.
3. **Error code mapping** — Consolidate error messages in `docs/TROUBLESHOOTING.md` and `docs/LOGIN_EXTENSION_ERRORS_RESOLUTION.md`; ensure login page uses code-specific copy.
4. **Clinic resolve non-blocking** — If resolve fails, still allow login with default branding (don't block on resolve for app.eonpro.io).

### Phase 2 — Resilience (2–4 weeks)

1. **Client retry** — For 5xx and AbortError, auto-retry once (2–3s delay) before showing final error.
2. **Diagnostic endpoint** — `GET /api/auth/login/diagnostic` returns `{ ok, dbConnected, message }` for support.
3. **Login metrics** — Log/login analytics: `login_attempt`, `login_success`, `login_error` with `statusCode`, `step`, `duration`.
4. **Connection limit** — Add `?connection_limit=3` to production `DATABASE_URL` if not using pooler.

### Phase 3 — Infrastructure (4–8 weeks)

1. **RDS Proxy** — Implement per `docs/infrastructure/RDS_PROXY_SETUP.md`; switch `DATABASE_URL` to proxy endpoint.
2. **Alerting** — Alert on login 503 spike, login error rate > 5%, or `/api/ready` 503.
3. **Pre-deploy smoke test** — Add login smoke test to deploy pipeline.

### Phase 4 — Ongoing

1. **Cron audit** — Quarterly review of cron jobs for schema/query correctness.
2. **Dashboard** — Build login-focused dashboard (success rate, latency, errors by code).
3. **OAuth/Magic link (optional)** — Consider OAuth or magic-link as fallback for users with persistent extension/network issues.

---

## Part 4: Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Login success rate | ≥ 99% | `login_success / (login_success + login_error)` |
| Login p95 latency | < 3s | Server-side timing |
| 503 rate | < 0.1% | Logs / metrics |
| Time to diagnose | < 15 min | Runbook + diagnostic endpoint |
| User recovery (extension) | Self-serve | Incognito + docs |

---

## Part 5: Runbook — "Login Down"

1. **Check health:** `curl -s https://app.eonpro.io/api/ready | jq`  
   - If 503 and `database: "down"` → DB or connection issue.  
   - If 200 → DB OK; check login-specific errors.

2. **Check Vercel logs:** Filter for `POST /api/auth/login` and `Login error`.  
   - Look for `prismaCode: 'P2024'` → pool exhausted.  
   - Look for `step` to see where it failed.

3. **Short-term mitigation:**  
   - Ask users to retry in 1–2 minutes.  
   - If P2024: scale down other traffic, or wait for pool to recover.

4. **Infrastructure fix:**  
   - Enable RDS Proxy or connection pooler.  
   - Reduce `connection_limit` per instance.  
   - Consider read replicas for heavy read paths if applicable.

5. **If clinic resolve 500:**  
   - Check `[CLINIC_RESOLVE_GET]` in logs.  
   - Verify migrations; check for missing columns.

6. **If incognito also fails:**  
   - Not extension-related. Focus on network, DB, or API.

---

## References

- `docs/PLATFORM_RESILIENCE_LONG_TERM_PLAN.md` — **Master plan** for high-scale medical platform (auth, DB, API, observability, phased roadmap)
- `docs/TROUBLESHOOTING.md` — Login stuck, 503, provider 503
- `docs/LOGIN_EXTENSION_ERRORS_RESOLUTION.md` — Extension-related issues
- `docs/FIX_LOGIN_500_405.md` — Clinic resolve 500, auth 405
- `docs/infrastructure/RDS_PROXY_SETUP.md` — Connection pooling
- `docs/ENTERPRISE_DATABASE_HEALTH_INCIDENT_RUNBOOK.md` — DB incidents
