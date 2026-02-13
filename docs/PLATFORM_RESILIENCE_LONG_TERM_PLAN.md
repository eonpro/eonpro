# Platform Resilience — Long-Term Plan for High-Scale Medical Platform

**Purpose:** Strategic plan to make EONPRO a highly reliable, HIPAA-compliant platform under heavy use.  
**Scope:** Auth, database, API, webhooks, cron, multi-tenant isolation, observability.  
**Target:** 99.9%+ uptime, < 1% error rate on critical paths, sub-15min MTTR.  
**Horizon:** 6–18 months, phased.

---

## 1. Strategic Context

### 1.1 Platform Profile

| Dimension | Current | Target (Heavy Use) |
|-----------|---------|--------------------|
| **Concurrent users** | Hundreds | Thousands |
| **Requests/min (peak)** | ~500–2K | 5K–20K |
| **DB connections** | Per-function (burst risk) | Pooled (RDS Proxy) |
| **Login success rate** | Variable (extension, 503, timeout) | ≥ 99% |
| **Critical path error rate** | 1–5% (anecdotal) | < 0.5% |
| **MTTR** | Variable | < 15 min |

### 1.2 Medical Platform Constraints

- **PHI:** No PHI in logs; encrypt at rest; audit all PHI access.
- **Availability:** Auth, prescriptions, intake = Tier 1 (RTO 1h, RPO 15m).
- **Compliance:** HIPAA, BAA with vendors, audit trail for access and changes.
- **Multi-tenant:** Strict clinic isolation; no cross-tenant data leakage.

---

## 2. Problem Areas (Prioritized)

### Tier 1 — Auth & Access

| Problem | Impact | Root Cause |
|---------|--------|------------|
| Login stuck / timeout | Users blocked | Extensions, cold start, DB pool, network |
| 503 on login | "Service busy" | P2024 pool exhausted |
| 401 after login | Session invalid | Session not created, refresh token missing |
| Clinic resolve 500 | Login page broken | DB or schema error |

### Tier 2 — Database & Connections

| Problem | Impact | Root Cause |
|---------|--------|------------|
| P2024 pool exhausted | Widespread 503 | Serverless × N connections > RDS limit |
| Slow queries | Timeouts, poor UX | N+1, missing indexes, heavy joins |
| Migration failures | Deploy blocked | Schema drift, lock contention |

### Tier 3 — API & Webhooks

| Problem | Impact | Root Cause |
|---------|--------|------------|
| Inconsistent error responses | Hard to diagnose | Ad-hoc error handling |
| Webhook retries / duplicates | Duplicate intakes | No idempotency, parse failures |
| Cron 500 | Background jobs fail | Schema mismatch, query errors |

### Tier 4 — Observability & Ops

| Problem | Impact | Root Cause |
|---------|--------|------------|
| Slow diagnosis | Long MTTR | Fragmented logs, no SLOs |
| Blind spots | Undetected degradation | No alerts, no dashboards |
| No runbooks | Inconsistent response | Manual, tribal knowledge |

---

## 3. Strategic Pillars

### Pillar 1 — Data Layer Resilience

**Goal:** DB never blocks auth or critical reads/writes; pool never exhausted.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **RDS Proxy** | Connection pooling; multiplex serverless connections. | High |
| **Connection limits** | `?connection_limit=3` per serverless instance. | Low |
| **Read replicas** | Offload read-heavy paths (reports, dashboards) from primary. | Medium |
| **Query optimization** | Index audit; eliminate N+1; time-box heavy queries. | Medium |
| **Migration safety** | Lock timeout, backfill scripts, rollback procedure. | Low |

### Pillar 2 — Auth & Session Resilience

**Goal:** Login and session flow reliable; clear UX when things fail.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **Pre-login health check** | Disable submit if DB down; show "System maintenance." | Low |
| **Client retry** | Auto-retry 5xx/AbortError once with backoff. | Low |
| **Clinic resolve fallback** | Don't block login if resolve fails (app.eonpro.io). | Low |
| **Session creation hardening** | Always create session on login; ensure refresh token stored. | Low |
| **Rate limiting tuning** | Avoid blocking legitimate bursts; progressive CAPTCHA. | Medium |
| **OAuth/Magic link (optional)** | Fallback for extension/network issues. | High |

### Pillar 3 — API & Webhook Hardening

**Goal:** Consistent errors; idempotency; no cascading failures.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **handleApiError everywhere** | All routes use shared handler; consistent shape. | Medium |
| **Webhook idempotency** | Dedupe by `submissionId` / `idempotencyKey`. | Medium |
| **Webhook parse safety** | try/catch on JSON; return 400 on invalid body. | Low |
| **Transaction coverage** | Multi-step writes in `$transaction`. | Medium |
| **Circuit breakers** | For external APIs (Lifefile, Stripe) to fail fast. | Medium |

### Pillar 4 — Observability & SLOs

**Goal:** Know when something is wrong; diagnose quickly.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **SLO definitions** | Auth 99.9%; API p95 < 2s; 503 < 0.1%. | Low |
| **Login metrics** | Attempts, success, failure by status/step. | Medium |
| **Error rate alerts** | Alert when login 503 > 1% or error rate > 5%. | Medium |
| **Dashboard** | Grafana/Vercel: login, API latency, 5xx, DB pool. | Medium |
| **Structured logging** | `step`, `requestId`, `duration` in all critical paths. | Low |
| **Diagnostic endpoints** | `/api/auth/login/diagnostic`, `/api/ready` (existing). | Low |

### Pillar 5 — HIPAA & Compliance

**Goal:** PHI safe; audit trail complete; BAA covered.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **PHI audit coverage** | Every PHI read/write logs via `hipaaAudit.log`. | Medium |
| **No PHI in logs** | Lint/audit; use IDs only. | Low |
| **Encryption audit** | PHI at rest; key rotation procedure. | Low |
| **BAA inventory** | Document all vendors with PHI; ensure BAA in place. | Low |

### Pillar 6 — Runbooks & Automation

**Goal:** Consistent incident response; automated checks.

| Initiative | Description | Effort |
|------------|-------------|--------|
| **Login-down runbook** | Health → logs → RDS Proxy → rollback. | Low |
| **DB-incident runbook** | Already exists; keep updated. | Low |
| **Pre-deploy smoke test** | Login, health, critical API in CI. | Medium |
| **Rollback tested** | App + DB rollback exercised in staging. | Low |

---

## 4. Phased Roadmap

### Phase 1 — Quick Wins (4–6 weeks)

**Focus:** Reduce immediate pain; set foundations.

| # | Item | Owner | Success Criteria |
|---|-----|-------|-------------------|
| 1 | Pre-login health check | FE | Submit disabled when `/api/ready` 503 |
| 2 | 503 retry UX | FE | Countdown + Retry button when `retryAfter` present |
| 3 | Clinic resolve non-blocking | FE/BE | Login works on app.eonpro.io if resolve fails |
| 4 | Connection limit `?connection_limit=3` | Ops | In DATABASE_URL for serverless |
| 5 | Cron schema audit | BE | All crons use `getClinicIdsForCron()`; no `isActive` on Clinic |
| 6 | Login-down runbook | Ops | Documented; linked from TROUBLESHOOTING |

**Exit:** Fewer "stuck login" reports; cron 500s resolved.

---

### Phase 2 — Data Layer (6–10 weeks)

**Focus:** DB and connection resilience.

| # | Item | Owner | Success Criteria |
|---|-----|-------|-------------------|
| 1 | RDS Proxy (or PgBouncer) | Ops | Production DATABASE_URL points to pooler |
| 2 | Read replica for reports | Ops | Optional; offload analytics/reporting queries |
| 3 | Query/index audit | BE | Top 10 slow queries optimized; critical indexes added |
| 4 | Migration rollback procedure | Ops | Documented; tested in staging |

**Exit:** No P2024 in production; sustained traffic without 503.

---

### Phase 3 — API & Observability (8–12 weeks)

**Focus:** Consistency, visibility, alerts.

| # | Item | Owner | Success Criteria |
|---|-----|-------|-------------------|
| 1 | handleApiError on all routes | BE | Convention enforced; remaining routes migrated |
| 2 | Login metrics + alerts | Ops | Login success rate, 503 rate; PagerDuty/Slack on breach |
| 3 | Dashboard | Ops | Login, API latency, 5xx, DB health |
| 4 | Webhook idempotency | BE | Intake webhooks dedupe by submissionId |
| 5 | SLO definitions | Ops | Documented; tracked in dashboard |

**Exit:** Clear SLOs; alerts fire before users complain.

---

### Phase 4 — Scale & Polish (12–18 weeks)

**Focus:** Handle heavy load; optional enhancements.

| # | Item | Owner | Success Criteria |
|---|-----|-------|-------------------|
| 1 | Client retry for login | FE | Auto-retry 5xx/AbortError once |
| 2 | Circuit breakers for external APIs | BE | Lifefile, Stripe (where applicable) |
| 3 | HIPAA audit coverage | BE | Every PHI path audited |
| 4 | Pre-deploy smoke test | CI | Login + health in deploy pipeline |
| 5 | OAuth/Magic link (optional) | FE/BE | Fallback auth for extension victims |

**Exit:** Platform withstands 2x–3x current peak load; compliance gaps closed.

---

## 5. Success Metrics (Target State)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Login success rate** | ≥ 99% | `success / (success + error)` |
| **Auth availability** | 99.9% | Uptime of `/api/auth/login` |
| **API p95 latency** | < 2s | Server-side; exclude cold start |
| **503 rate (critical paths)** | < 0.1% | Login, prescriptions, intake |
| **MTTR** | < 15 min | From alert to mitigation |
| **DB pool exhaustion** | 0 incidents | With RDS Proxy |
| **HIPAA audit coverage** | 100% PHI paths | Audit log verification |

---

## 6. Dependencies & Risks

### Dependencies

- **Ops/Platform:** RDS Proxy, monitoring stack, Vercel limits.
- **Vendor:** Stripe, Lifefile, Twilio, AWS — BAAs and SLAs.
- **Team:** 1–2 engineers for implementation; ops for infra.

### Risks

| Risk | Mitigation |
|------|------------|
| RDS Proxy complexity | Use managed pooler (Vercel Postgres, Neon) if simpler |
| Breaking change during migration | Feature flags; canary; staged rollout |
| Alert fatigue | Tune thresholds; consolidate; use severity tiers |
| Scope creep | Stick to phased plan; defer non-critical to backlog |

---

## 7. Document Relationships

| Document | Purpose |
|----------|---------|
| `ENTERPRISE_LOGIN_RESILIENCE_STRATEGY.md` | Deep dive on login; pillars, runbook |
| `LOGIN_EXTENSION_ERRORS_RESOLUTION.md` | User-facing extension issues |
| `TROUBLESHOOTING.md` | General runbooks; login, 503, DB |
| `ENTERPRISE_INFRASTRUCTURE.md` | Architecture; deployment options |
| `ENTERPRISE_READINESS_ROADMAP.md` | Code quality; API, TS, HIPAA |
| `ENTERPRISE_DATABASE_HEALTH_INCIDENT_RUNBOOK.md` | DB incidents |
| `RDS_PROXY_SETUP.md` | Connection pooling setup |
| `POL-007-BUSINESS-CONTINUITY.md` | RTO, RPO, SLAs |

---

## 8. Next Actions

1. **Stakeholder alignment** — Review Phase 1 with eng/ops; assign owners.
2. **Backlog refinement** — Break Phase 1 items into tickets; estimate.
3. **Kick off Phase 1** — Start with pre-login health check and connection limit.
4. **Quarterly review** — Reassess metrics; adjust roadmap.

---

*Last updated: February 12, 2026*
