# Login Instability — Deep Analysis (Feb 12, 2026)

## Executive Summary

Login was fixed and stable; instability has returned. This document analyzes root causes, evidence from the current failure, and actionable remediation steps.

---

## 1. Evidence from the Screenshot

### What the User Sees
- **URL:** `app.eonpro.io/login?redirect=/provider` (Provider login)
- **Error:** "Login is taking too long. Check your connection and try again, or use the Provider login link below."
- **Credentials:** Email and password filled (likely from a password manager)

### What the Code Path Reveals
This specific message is shown when:
1. **AbortError** fires — the client `fetch` to `/api/auth/login` hits the 25-second timeout
2. The **retry has already run** — first timeout → auto-retry after 2.5s → second attempt also times out
3. **Provider context** — the message says "Provider login link below" because `redirect=/provider` is present

**Implication:** The login request is taking **>25 seconds per attempt**, and **both** the initial attempt and the retry exceed that. Total time before the error shown: ~52+ seconds.

### Console Errors (Right Panel)
| Error | Source | Meaning |
|-------|--------|---------|
| `ReferenceError: strURL is not defined` | `chrome-extension://.../background.js` | Broken Chrome extension |
| `TypeError: Cannot read properties of undefined (reading 'id')` | Same extension | Extension bug |
| `FrameDoesNotExistError: Frame does not exist in tab` | Same extension | Extension trying to access non-existent frame |
| `ERR_FILE_NOT_FOUND` (utils.js, extensionState.js, heuristicsRedefinitions.js) | Extension scripts | Extension resources missing/corrupted |
| `Could not establish connection. Receiving end does not exist` | Extension | Extension communication failure |

**Critical:** These are all **browser extension** errors (password manager, ad blocker, or similar). They are documented in `docs/LOGIN_EXTENSION_ERRORS_RESOLUTION.md`. Extensions can:
- Inject into the page and block or corrupt the login request
- Keep the request in "pending" forever so the response never reaches the app
- Intercept and slow down network requests

---

## 2. Root Cause Taxonomy

From `docs/ENTERPRISE_LOGIN_RESILIENCE_STRATEGY.md` and scratchpad notes:

| Category | Symptoms | If This Is the Cause |
|----------|----------|----------------------|
| **Client extensions** | Console errors (strURL, FrameDoesNotExistError, utils.js); "Logging in..." forever | Login works in **incognito** (extensions disabled) |
| **Network/timeout** | "Login is taking too long" **even in incognito** | Slow API, cold start, firewall/VPN |
| **DB pool (503)** | "Service is busy. Please try again in a moment." | Would see **503**, not timeout |
| **Clinic resolve** | 500 on page load; login fails | Clinic branding fails; login still allowed (fallback) |

### Scratchpad Context (Feb 12)
> "Incognito: Still times out with 'Login is taking too long' — suggests network or backend, not extensions."

**Conclusion:** If incognito also times out, the issue is **not purely extensions**. Likely:
1. **Backend/API slowness** (DB, cold start, connection pool)
2. **Network** (firewall, VPN, geographic routing)
3. **Combination** — extensions worsen an already slow backend (request blocked or delayed on top of slow server)

---

## 3. Technical Flow (What Happens on Login)

### Client-Side (Login Page)
1. User submits → `handlePasswordLogin` runs
2. `fetch('/api/auth/login', { signal, ... })` with **25s AbortController**
3. If **AbortError** at 25s → auto-retry once after 2.5s
4. If retry also times out → show "Login is taking too long. Check your connection and try again, or use the Provider login link below."
5. **Safety net** (30s): If `loading` stays true 30s, show incognito message (can overwrite/be overwritten by AbortError)

### Server-Side (Login API)
Provider login does more work than admin login:
- User lookup with `provider` include
- Optional legacy Provider lookup
- Rate limiting check
- bcrypt password verify
- Session creation
- **ProviderClinic** fetch (parallel with post-auth writes)
- **Provider** lastLogin update
- UserAuditLog, UserSession creation
- JWT signing

Under load or cold start, this can exceed 25 seconds.

---

## 4. Why "Stable Again" Could Have Regressed

### Environmental / Operational
- **Traffic increase** — more concurrent logins → DB pool pressure
- **Vercel cold starts** — serverless functions cold after inactivity; first request can add 2–10s
- **Database** — RDS Proxy or pooler not in place; connection exhaustion (P2024) would show 503, but general slowness could cause timeouts
- **Geographic routing** — users farther from Vercel/DB region see higher latency

### Code / Deployment (Unlikely Direct Cause)
Recent commits (from git log):
- PHI decryption fixes
- Prescription/provider fixes
- Build/Next.js pinning
- Invoice/reconciliation

None obviously touch the login path. The resilience changes (Phase 1) improved UX for 503 and retries but did not change the 25s timeout or backend performance.

### Intermittent vs Systematic
- **Intermittent:** Works sometimes; fails under load, cold start, or specific networks → suggests backend/network
- **Systematic:** Fails every time for a user → could be their extensions + their network, or a backend regression

---

## 5. Diagnostic Steps (Immediate)

### 1. Confirm Backend Health
```bash
curl -s https://app.eonpro.io/api/ready | jq
# Expect: "database": "operational", status 200
```

If 503 or slow (>3s): DB or connection pool issue.

### 2. Check Login API Timing (Vercel Logs)
- Filter for `POST /api/auth/login`
- Look at `duration` in error logs
- Look for `step` to see where it fails
- Look for `prismaCode: 'P2024'` → pool exhausted

### 3. Test Login in Incognito
- Open incognito (extensions disabled)
- Go to `https://app.eonpro.io/login?redirect=/provider`
- Try login

- **Works in incognito** → extension-related; user should disable password manager/blockers on main profile
- **Fails in incognito** → backend or network; focus on DB, cold start, Vercel region

### 4. Network Tab (DevTools)
- Try login
- Find `POST /api/auth/login`
- Check: **Pending forever** → blocked or very slow
- Check: **Returns 200** but UI fails → response corruption (extension)
- Check: **Returns 503** → DB pool; see TROUBLESHOOTING "Login 503"

---

## 6. Remediation Options

### Short-Term (User / Support)
1. **Try incognito** — quickest test for extension vs backend
2. **Disable extensions** (password managers, ad blockers) for app.eonpro.io
3. **Retry after a few minutes** — cold start or transient pool pressure may resolve
4. **Use provider link** — `/login?redirect=/provider` (already in use; ensures optimal provider path)

### Medium-Term (Platform)
1. **Increase client timeout** — 25s may be tight; consider 35–40s for provider flow (with backend optimization in parallel)
2. **Diagnostic endpoint** — `GET /api/auth/login/diagnostic` returning `{ dbConnected, lastErrorCode, uptime }` for support
3. **Login metrics** — track attempts, successes, failures, latency; alert when p95 > 10s or error rate > 5%
4. **Pre-warm** — scheduled ping to `/api/ready` or `/api/auth/login` (OPTIONS) to reduce cold starts during business hours

### Long-Term (Infrastructure)
1. **RDS Proxy / connection pooler** — reduce P2024; see `docs/infrastructure/RDS_PROXY_SETUP.md`
2. **Connection limit** — `?connection_limit=3` in `DATABASE_URL` if not using pooler
3. **Vercel function timeout** — ensure ≥30s for login route (match or exceed client timeout)

---

## 7. Recommended Next Steps

| Priority | Action | Owner |
|----------|--------|-------|
| 1 | Run `curl https://app.eonpro.io/api/ready` — confirm DB is operational | Ops |
| 2 | Check Vercel logs for `POST /api/auth/login` — duration, step, prismaCode | Ops |
| 3 | Test login in incognito — extension vs backend | User / Support |
| 4 | If backend slow: consider increasing client timeout to 35s + backend perf investigation | Dev |
| 5 | If P2024 in logs: prioritize RDS Proxy or connection pooler | Ops |

---

## References

- `docs/ENTERPRISE_LOGIN_RESILIENCE_STRATEGY.md` — Root cause taxonomy, pillars, runbook
- `docs/LOGIN_EXTENSION_ERRORS_RESOLUTION.md` — Extension errors and resolution
- `docs/TROUBLESHOOTING.md` — Login stuck, Login 503, Provider login 503
- `docs/infrastructure/RDS_PROXY_SETUP.md` — Connection pooling
- `.cursor/scratchpad.md` — Historical context (incognito times out → network/backend)
