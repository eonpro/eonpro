# Growth & Reliability Plan

**Purpose:** Avoid production failures (e.g. login 500s, silent failures) as user count and features
grow.  
**Related:** [OBSERVABILITY.md](./OBSERVABILITY.md),
[POL-003 Incident Response](./policies/POL-003-INCIDENT-RESPONSE.md),
[ENTERPRISE_INFRASTRUCTURE.md](./ENTERPRISE_INFRASTRUCTURE.md).

---

## 1. What We’re Avoiding

- **Unhandled exceptions** in critical paths (auth, payments, PHI) causing 500s instead of graceful
  degradation or clear 4xx.
- **Single points of failure** where one failing step (e.g. `user.update`, rate-limit clear, audit
  log) aborts the whole operation.
- **Silent failures** with no logs, metrics, or alerts so we only notice when users report.

---

## 2. Defensive Coding Standards

### 2.1 Critical Paths (Auth, Payments, PHI)

- **Never let a secondary step fail the main outcome.**  
  Main outcome = “user can log in” / “order is created” / “prescription is sent”.  
  Secondary = “update lastLogin”, “write audit log”, “send analytics”.

- **Pattern:** Do the main work (validate, persist core data, return token/response). Then run
  secondary steps in try/catch; log and optionally retry, but **do not throw** so the response is
  still 200.

```typescript
// ✅ Main outcome first; secondary steps non-blocking
const token = await createToken(user);
try {
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
} catch (e) {
  logger.warn('Last-login update failed', { userId: user.id, error: e });
}
return NextResponse.json({ token, user });
```

- **Normalize external/DB values** before use (e.g. `String(user.role ?? role).toLowerCase()`) so
  enums or nulls don’t cause runtime errors.

### 2.2 API Routes

- **Validate input** with Zod (or equivalent); return 400 with clear messages.
- **Catch and map errors:** use a shared handler (e.g. `handleApiError`) so 500s include safe
  `details` and are logged with `request_id`.
- **No PHI in logs or error payloads** (see platform rules).

### 2.3 Where to Apply

- All auth routes: login, register, password reset, OTP, session/refresh.
- Payment and order creation flows.
- Any route that writes PHI or critical business state.

---

## 3. Testing Critical Paths

- **Auth:** Automated tests for login (patient, provider, admin, super_admin) with real DB (or test
  DB) and mocked secrets. Include “valid credentials → 200 + token” and “invalid → 401”.
- **At least one happy-path test per critical flow** (e.g. order create, prescription submit) so
  regressions are caught in CI.
- **Target:** Critical paths covered so that changes to login, payments, or PHI flows are guarded by
  tests. See [TESTING_GUIDE.md](./TESTING_GUIDE.md).

---

## 4. Observability (So We See Issues Before Users Do)

- **Errors:** Ensure Sentry (or equivalent) is enabled in production and that API route errors are
  captured with context (route name, `request_id`, no PHI). See
  [OBSERVABILITY.md](./OBSERVABILITY.md).
- **Logs:** Critical paths log at least: success/failure, duration, and a stable identifier (e.g.
  `userId`, `orderId`). Use structured logger; no PHI.
- **Metrics:** For auth and other critical endpoints, consider counters (e.g. `login.success`,
  `login.failure`) and/or latency histograms so we can alert on spike in 5xx or latency.
- **Alerts:** Define alerts for:
  - Spike in 5xx on login or key APIs.
  - Error rate above threshold in Sentry for the app.
  - (Optional) Latency p99 above SLO for auth/payments.

---

## 5. Deployments and Rollbacks

- **Before deploy:** Run the same build that will run in production (`vercel-build` or equivalent)
  and critical-path tests.
- **After deploy:** Smoke-check login and at least one payment/order path (manual or automated).
- **Rollback:** Document in a runbook how to roll back (e.g. “Revert last deployment in Vercel” or
  “Redeploy previous commit”). Keep last known-good deploy identifiable (tag or commit).

---

## 6. Runbooks and Incidents

- **Runbooks:** Keep short runbooks for:
  - “Login 5xx” (check logs/Sentry, DB connectivity, env vars, rate limiter).
  - “Payment/order failures” (check Stripe, DB, logs).
  - “Database connectivity” (see [RDS_PROXY_SETUP.md](./infrastructure/RDS_PROXY_SETUP.md) / infra
    docs).
- **Incident process:** Follow [POL-003](./policies/POL-003-INCIDENT-RESPONSE.md): classify
  severity, communicate, fix, then post-mortem and update runbooks/docs.

---

## 7. Checklist for New Features / Touches to Critical Paths

When adding or changing code that affects auth, payments, or PHI:

- [ ] Main outcome (e.g. “user gets token”) is not blocked by secondary steps (audit, analytics,
      cache).
- [ ] Inputs validated; errors handled and mapped to 4xx/5xx with safe messages.
- [ ] No unguarded `.toLowerCase()` or enum use; normalize safely.
- [ ] New or changed logic has at least one automated test for the happy path.
- [ ] Logs/metrics added so failures are visible (Sentry + structured logs).
- [ ] Runbook or troubleshooting notes updated if this is a new failure mode.

---

## 8. Summary

| Area              | Action                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Code**          | Critical paths: main outcome first; secondary steps non-blocking, with try/catch and logging. |
| **Testing**       | Automated tests for auth and other critical flows; run in CI.                                 |
| **Observability** | Sentry + structured logs + metrics for auth/key APIs; alerts on 5xx and error rate.           |
| **Deploy**        | Build + tests before deploy; smoke-check after; clear rollback steps.                         |
| **Ops**           | Runbooks for login 5xx, payments, DB; incidents per POL-003 and doc learnings.                |

This plan reduces the chance of “silent” or “mystery” 500s as we add users and features, and makes
the next incident easier to diagnose and fix.
