# Enterprise Auth Upgrade — Implementation Guide

HIPAA-compliant enterprise authentication for telehealth platform.

## Requirements Checklist

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | httpOnly secure cookies (no JWT in localStorage) | Partial | Login sets httpOnly cookies; client also stores in localStorage. See Phase 2. |
| 2 | Rotate refresh tokens | Implemented | Refresh endpoint issues new refresh token. |
| 3 | Rate limiting (IP + email) | Done | `authRateLimiter` in enterprise-rate-limiter. |
| 4 | Login lockout after 5 failures | Added | `AUTH_LOCKOUT_AFTER_ATTEMPTS=5` in config. |
| 5 | Device fingerprint logging | Added | `LoginAudit` model + `deviceFingerprint` on UserSession. |
| 6 | Audit: login success, failure, password reset | Done | UserAuditLog, Prisma userSession.create. |
| 7 | Prisma session table | Done | `UserSession` exists. |
| 8 | Next.js App Router | Done | Compatible. |
| 9 | Middleware admin protection | Done | `clinicMiddleware`, auth wrappers. |
| 10 | Vercel Edge runtime | Done | Middleware uses Edge-compatible APIs. |

---

## Phase 1 — Implemented (This PR)

### 1.1 Prisma Schema Additions

- **UserSession**: `deviceFingerprint` (optional) for session binding.
- **LoginAudit**: New model for device fingerprint + outcome (success/failure).

### 1.2 Auth Config

- `AUTH_LOCKOUT_AFTER_ATTEMPTS`: 5 (env override `AUTH_LOCKOUT_AFTER_ATTEMPTS`).
- Lockout duration: 30 minutes.

### 1.3 Login Route Enhancements

- Accept `deviceFingerprint` in body (optional).
- Log to LoginAudit on success/failure.
- Store deviceFingerprint in UserSession when creating session.

### 1.4 Secure Cookie Config

- Centralized in `src/lib/auth/cookie-config.ts`.
- httpOnly, secure (production), sameSite: lax.
- Domain support for *.eonpro.io.

---

## Phase 2 — httpOnly-Only (Future)

To remove JWT from localStorage:

1. **Login API**: Stop returning `token` and `refreshToken` in JSON. Set only cookies.
2. **Client**: Remove all `localStorage.setItem('auth-token', ...)`. Use `credentials: 'include'`.
3. **apiFetch**: Stop adding `Authorization: Bearer`. Rely on cookies only.
4. **Auth check**: Add `GET /api/auth/me` that returns user from cookie; client polls for session.
5. **Refresh**: Use cookie-based refresh; new tokens in Set-Cookie only.

Migration: Feature-flag `USE_HTTPONLY_ONLY=true`; run both paths until client fully migrated.

---

## Files Changed

- `prisma/schema.prisma` — LoginAudit, UserSession.deviceFingerprint
- `src/lib/auth/config.ts` — lockout after 5
- `src/lib/auth/cookie-config.ts` — NEW
- `src/app/api/auth/login/route.ts` — device fingerprint, LoginAudit
- `src/lib/security/enterprise-rate-limiter.ts` — LOGIN_LOCKOUT_THRESHOLD
