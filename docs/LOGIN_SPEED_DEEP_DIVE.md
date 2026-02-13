# Login Speed Deep Dive — Making Login Easy and Smooth

**Purpose:** Identify bottlenecks and improvements for fast, smooth login.  
**Scope:** Page load → POST /api/auth/login → redirect.

---

## 1. Current Flow Timeline

### A) Page Load (Before User Clicks Login)

| Step | Operation | Typical Time | Blocking? |
|------|-----------|--------------|-----------|
| 1 | `/api/ready` fetch (health check) | 50–500ms | No (runs in parallel) |
| 2 | `/api/clinic/resolve?domain=...` fetch | app.eonpro.io: ~20ms (short-circuit, no DB); clinic subdomain: 100–300ms | No (parallel) |
| 3 | React hydration | 100–300ms | N/A |

For `app.eonpro.io`, clinic resolve skips DB and returns default payload immediately.

### B) POST /api/auth/login — Server-Side (Provider Path)

| # | Operation | Type | Est. Time | Blocking Response? |
|---|-----------|------|-----------|--------------------|
| 1 | Parse body, Zod validation | CPU | ~1ms | Yes |
| 2 | Rate limit check (`authRateLimiter.checkAndRecord`) | In-memory/Redis | 5–50ms | Yes |
| 3 | `prisma.user.findUnique` (include provider, influencer, patient) | DB | 30–150ms | Yes |
| 4 | Possibly: `basePrisma.provider.findFirst` (if user not found) | DB | 30–150ms | Yes |
| 5 | Possibly: `prisma.user.findFirst` (admin fallback) | DB | 30–150ms | Yes |
| 6 | **bcrypt.compare(password, hash)** | **CPU** | **100–350ms** | **Yes** |
| 7 | Rate limit clear | Fast | ~5ms | Yes |
| 8 | `prisma.clinic.findUnique` (primary clinic) | DB | 30–100ms | Yes |
| 9 | `prisma.userClinic.findMany` (multi-clinic) | DB | 30–150ms | Yes |
| 10 | Provider path: `basePrisma.provider.findFirst` + `providerClinic.findMany` | DB | 50–200ms | Yes |
| 11 | `basePrisma.clinic.findFirst` (subdomain resolution) | DB | 30–100ms | Yes |
| 12 | `createSessionRecord` (Redis + auditLog) | Redis + audit | 20–80ms | Yes |
| 13 | Provider fallback: `providerByEmail findFirst` | DB | 30–100ms | Yes |
| 14 | JWT sign (access + refresh) | CPU | ~5ms | Yes |
| 15 | **lastLogin update (user)** | DB | 30–100ms | **Yes** |
| 16 | **provider lastLogin update** | DB | 30–100ms | **Yes** |
| 17 | **userAuditLog.create** | DB | 30–100ms | **Yes** |
| 18 | **userSession.create** | DB | 30–100ms | **Yes** |
| 19 | **providerClinics findMany** | DB | 30–100ms | **Yes** |
| 20 | Build response, set cookies | CPU | ~2ms | Yes |

**Total:** 500ms–2.5s under normal conditions. Cold start adds 1–5s on first request.

---

## 2. Root Causes of Slowness

### Primary Bottlenecks

| Bottleneck | Impact | Cause |
|------------|--------|-------|
| **bcrypt.compare** | 100–350ms | Password verification is intentionally CPU-heavy (security). bcrypt rounds determine cost. |
| **Sequential DB queries** | 300–800ms+ | 10–15 queries run one after another; no batching or parallelization. |
| **Post-auth updates block response** | 120–400ms | lastLogin, audit log, userSession, providerClinics all awaited before returning. |
| **Cold start (Vercel)** | 1–5s | First request to a serverless function boots Node, loads deps, connects to DB. |
| **Provider path complexity** | +2–4 queries | Extra lookups for ProviderClinic, provider fallback, subdomain clinic. |

### Secondary Factors

- **Browser extensions** — Can intercept/modify requests; `ERR_FILE_NOT_FOUND` for extension scripts doesn't slow the app directly but can cause perceived slowness if extensions block the response.
- **Network latency** — User ↔ Vercel ↔ DB; cross-region adds 50–200ms.
- **Connection pool** — Under load, P2024 (pool exhausted) causes 503 and retries.

---

## 3. Optimization Roadmap

### Tier 1 — Quick Wins (1–2 days)

| Initiative | Change | Expected Gain |
|------------|--------|---------------|
| **Defer post-auth writes** | Move lastLogin, audit, userSession, providerClinics to fire-and-forget (don't await before response). Return tokens immediately; run updates in background. | **120–400ms** |
| **Reduce bcrypt rounds (if safe)** | Check current rounds; if 12+, consider 10 for faster verify (with security review). Default bcryptjs is 10. | **50–150ms** (if rounds were high) |
| **Preconnect / prefetch** | Add `<link rel="preconnect" href="https://app.eonpro.io" />` and optionally prefetch `/api/ready` on HTML load. | **20–50ms** perceived |
| **Optimistic UI** | Show "Redirecting..." immediately on 200, before full client processing. | Perceived faster |

### Tier 2 — Medium Effort (1–2 weeks)

| Initiative | Change | Expected Gain |
|------------|--------|---------------|
| **Parallelize independent queries** | Run user + rate-limit; clinic + userClinics; provider lookups in parallel where order allows. | **100–300ms** |
| **Combine user + clinic lookup** | Single query with includes/joins for user + primary clinic instead of separate findUnique. | **30–100ms** |
| **Cache clinic resolve** | For app.eonpro.io, response is static; short TTL cache (e.g. 60s) at edge. | **20–50ms** on repeat loads |
| **Keep-alive / warmer** | Vercel cron or external ping to hit login route periodically to reduce cold starts. | **1–5s** on first real request |

### Tier 3 — Larger Changes (4–8 weeks)

| Initiative | Change | Expected Gain |
|------------|--------|---------------|
| **RDS Proxy / connection pooler** | Reduces connection setup time and P2024 risk. | Variable; stability + fewer 503s |
| **Edge / regional deployment** | Deploy closer to users; reduce network RTT. | **50–150ms** |
| **Faster password verify** | Consider Argon2id with lower iterations for new users (requires migration). | **50–100ms** (long-term) |
| **Streaming / early flush** | Return HTTP 200 + headers early; stream JSON body when ready. | Complex; marginal gain |

---

## 4. Recommended Implementation Order

### Phase 1 — Parallelize Post-Auth Writes (DONE ✅)

**Implemented:** Run post-auth writes (lastLogin, audit, userSession) **in parallel** with providerClinics fetch. Previously sequential (~200–400ms); now `max(writes, providerClinics)` (~100–150ms typical).

**Code:** `src/app/api/auth/login/route.ts` — `Promise.all([providerClinicsPromise, postAuthWritesPromise])`.

**Client-side:** Optimistic "Redirecting..." UI — as soon as login succeeds, button text changes from "Logging in..." to "Redirecting..." before navigation. Keeps loading state until nav completes.

### Phase 2 — Parallelize Independent Queries

**Example:** After user is found, we need: primary clinic (if user.clinicId), userClinics, and for provider: ProviderClinic. Some of these can run in parallel:

```typescript
const [primaryClinic, userClinics] = await Promise.all([
  user.clinicId ? prisma.clinic.findUnique({ where: { id: user.clinicId }, ... }) : null,
  prisma.userClinic.findMany({ where: { userId: user.id, isActive: true }, ... }),
]);
```

### Phase 3 — Keep-Alive Warmer

Add a Vercel cron (e.g. every 5 min) that hits `GET /api/health` or a lightweight `GET /api/auth/login` OPTIONS to keep functions warm. Reduces cold-start on first real login.

---

## 5. Client-Side Perceived Performance

| Technique | Implementation |
|-----------|-----------------|
| **Optimistic redirect** | On 200, set loading state to "Redirecting...", then `router.push` or `window.location` immediately. |
| **Skeleton / instant feedback** | Show a success checkmark and "Welcome back" for 200–300ms before redirect. |
| **Reduce layout shift** | Ensure spinner doesn't cause form to jump. |
| **Prefetch** | On password focus or form valid, prefetch `/api/ready` so health is already done when they submit. |

---

## 6. Metrics to Track

| Metric | Target | How |
|--------|--------|-----|
| Login p50 | < 800ms | Server-side timing in login route |
| Login p95 | < 2s | Same |
| Cold start impact | < 10% of requests | Log cold vs warm; correlate with first request after idle |
| 503 rate | < 0.1% | Vercel logs / metrics |

---

## 7. References

- `src/app/api/auth/login/route.ts` — Main login handler
- `src/app/login/page.tsx` — Client login UI
- `docs/ENTERPRISE_LOGIN_RESILIENCE_STRATEGY.md` — Resilience
- `docs/PLATFORM_RESILIENCE_LONG_TERM_PLAN.md` — Master plan
