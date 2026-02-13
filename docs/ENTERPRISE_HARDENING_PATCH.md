# Enterprise Auth + Pagination Hardening Patch

## Summary

| Area | Change |
|------|--------|
| **Auth: Durable Lockout** | `User.failedLoginAttempts`, `User.lockedUntil`; atomic `$transaction` on failure; generic 401 (no enumeration) |
| **Auth: LoginAudit** | `failureReason`, `clinicId`, `requestId`, `ipAddress`, `userAgent`; clinicId from request context |
| **Auth: Refresh Token** | HMAC-SHA256 with `REFRESH_TOKEN_PEPPER`; REAUTH_REQUIRED vs TOKEN_REUSE (legacy sessions don't revoke) |
| **Pagination** | `AGGREGATION_TAKE_UI=500`, `AGGREGATION_TAKE_JOB=5000`; `requireServiceAuthForJob()` guard on integration routes |
| **Build** | `next build --webpack` for deterministic production; no turbopack env in vercel-build |

---

## 1. Durable Lockout (User table)

- **Schema:** Existing `User.failedLoginAttempts`, `User.lockedUntil`
- **On failure:** `prisma.user.update({ data: { failedLoginAttempts: { increment: 1 } } })`; if `>= AUTH_LOCKOUT_AFTER_ATTEMPTS` (default 5), set `lockedUntil = now + 30m`
- **On success:** `failedLoginAttempts: 0`, `lockedUntil: null`
- **Before login:** If `lockedUntil > now`, return 423 with `ACCOUNT_LOCKED`

---

## 2. LoginAudit Upgrade

- **New fields:** `failureReason`, `clinicId`, `requestId`
- **Outcomes:** SUCCESS, FAILURE, LOCKOUT
- **PII:** No password, no token; email redacted (first 3 chars + ***)
- **Helper:** `createLoginAuditData()` for consistent schema

---

## 3. Refresh Token Rotation

- **UserSession:** `refreshTokenHash` (HMAC-SHA256 when `REFRESH_TOKEN_PEPPER` set, else SHA-256)
- **Login:** Store `hashRefreshToken(refreshToken)` in new sessions
- **Refresh:** Find session by hash; if found, rotate (new token, update hash)
- **Reuse detection:** If not found and user exists:
  - If user has sessions with `refreshTokenHash` → confirmed reuse → revoke all, return `TOKEN_REUSE`
  - Else (legacy/no-hash) → return `REAUTH_REQUIRED` (no revoke)

---

## 4. Pagination Split

| Constant | Value | Use |
|----------|-------|-----|
| `AGGREGATION_TAKE_UI` | 500 | Dashboard, admin, reports, affiliate |
| `AGGREGATION_TAKE_JOB` | 5000 | Cron, internal service-auth only |
| `requireServiceAuthForJob(authVerified)` | Guard | Enforce JOB take only after cron/integration auth verified |
| `parseTakeFromParams(params)` | normalizeTake | API boundaries; use on routes with `?take=` or `?limit=` |

---

## 5. Build

- **package.json:** `next build --webpack`
- **Rationale:** Webpack for deterministic builds; avoids Turbopack-only assumptions

---

## Migrations

```
prisma/migrations/20260212100000_enterprise_auth_hardening/migration.sql
```

- UserSession: `refreshTokenHash`
- LoginAudit: `failureReason`, `clinicId`, `requestId`

---

## Verification

```bash
# Pagination tests
npx vitest run tests/unit/lib/pagination.test.ts

# Migration
npx prisma migrate deploy

# Build (webpack)
npm run build
```
