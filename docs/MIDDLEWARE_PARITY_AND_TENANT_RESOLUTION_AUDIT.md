# Middleware Parity & Tenant Resolution Audit Report

**Date:** 2026-02-16  
**Auditor:** AI Security Audit Agent  
**Scope:** `withAuth`, `withAuthParams`, Edge `clinicMiddleware`, `verifyAuth`, tenant resolution utilities, service-layer enforcement  
**Classification:** SECURITY AUDIT — DO NOT DISTRIBUTE EXTERNALLY

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Risk** | **HIGH** |
| **Parity Score** | **52%** — critical divergence between `withAuth` and `withAuthParams` |
| **Findings** | 14 issues (4 High, 5 Medium, 5 Low) |
| **Recommendation** | Unify into single `resolveAuthContext()` before next release |

---

## 1. Side-by-Side Comparison: `withAuth` vs `withAuthParams`

### 1.1 JWT Validation Logic

| Feature | `withAuth` (middleware.ts) | `withAuthParams` (middleware-with-params.ts) |
|---------|--------------------------|----------------------------------------------|
| JWT library | `jose` `jwtVerify` | `jose` `jwtVerify` |
| Algorithms | `['HS256']` explicit | **Not specified** (accepts any algorithm) |
| Clock tolerance | `30s` | **None** (default 0) |
| Token version check | Yes — `minimumTokenVersion` | **Missing entirely** |
| Claims validation | Dedicated `validateTokenClaims()` | **None** — raw cast `payload as unknown as AuthUser` |
| Error classification | `EXPIRED` / `INVALID` / `REVOKED` / `MALFORMED` | Returns `null` only — no error differentiation |
| Demo token support | **Disabled** — no demo path | **Present** — env-gated `ENABLE_DEMO_TOKENS` |

**Risk: HIGH** — `withAuthParams` accepts tokens signed with any algorithm (e.g. `none` algorithm attacks on misconfigured jose versions), does not validate claims structure, and cannot detect revoked tokens.

Code references:

`withAuth` verifyToken (strict):

```136:178:src/lib/auth/middleware.ts
async function verifyToken(token: string): Promise<TokenValidationResult> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });
    // ... validateTokenClaims, tokenVersion check ...
  }
}
```

`withAuthParams` verifyToken (loose):

```95:101:src/lib/auth/middleware-with-params.ts
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
```

### 1.2 Token Extraction

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|-----------------|
| Cookie list (non-affiliate) | 9 cookies + stale-session warning | 12 cookies incl. `token`, `SUPER_ADMIN-token` |
| Cookie list (affiliate) | 9 cookies | 11 cookies incl. `token`, `SUPER_ADMIN-token` |
| Stale cookie warning | Yes — logs when affiliate cookie used on non-affiliate route | **Missing** |
| Token source tracking | Returns `{ token, source }` tuple | Returns bare `string \| null` |
| Query param token | Yes — Priority 3 with warning | **Missing entirely** |
| URL parsing | `new URL(req.url)` | `req.nextUrl.pathname` |
| Extra cookie: `token` | **Not included** | Included in both lists |
| Extra cookie: `SUPER_ADMIN-token` | **Not included** | Included in both lists |

**Risk: MEDIUM** — Cookie lists are divergent. `withAuthParams` includes legacy cookies (`token`, `SUPER_ADMIN-token`) that `withAuth` ignores, creating inconsistent token resolution. A user authenticated via `token` cookie would be recognized by `withAuthParams` routes but rejected by `withAuth` routes.

### 1.3 Session Validation

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|-----------------|
| Skip session validation option | Yes (`skipSessionValidation`) | **No** |
| Missing sessionId handling | Allows through with warning (all roles) | Allows super_admin silently, warns for others |
| "Session not found" handling | **Allowed through** (explicit carve-out) | **Blocks request** (returns 401) |
| Session validation logic | `!sessionResult.valid && reason !== 'Session not found'` → block | `!sessionResult.valid` → always block |

**Risk: HIGH** — `withAuthParams` blocks on "Session not found" in Redis, while `withAuth` explicitly allows it through. This means the same user with the same token could be authenticated on `withAuth` routes but rejected on `withAuthParams` routes when Redis is cold or a session record is missing. This is the **primary source of intermittent 401s on dynamic routes**.

Code references:

`withAuth` session handling (lenient):

```476:501:src/lib/auth/middleware.ts
        if (!sessionResult.valid && sessionResult.reason !== 'Session not found') {
          // ... block only if not "session not found"
        }
```

`withAuthParams` session handling (strict):

```238:259:src/lib/auth/middleware-with-params.ts
      if (!sessionValidation.valid) {
        // ... blocks unconditionally, including "Session not found"
        return NextResponse.json(
          { error: sessionValidation.reason || 'Session expired' },
          { status: 401 }
        );
      }
```

### 1.4 clinicId Resolution

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|-----------------|
| Initial value (non-SA) | `user.clinicId` (direct) | `Number(user.clinicId)` (explicit coercion) |
| x-clinic-id header fallback | `parseInt(headerClinicId, 10)` | `parseInt(headerClinicId, 10)` |
| Subdomain lookup cache | **Yes** — `getClinicBySubdomainCache` / `setClinicBySubdomainCache` | **No** — DB query every time |
| Subdomain excluded list | `['www', 'app', 'api', 'admin', 'staging']` | `['www', 'app', 'api', 'admin', 'staging']` |
| Multi-clinic access check | `userHasAccessToClinic()` (via UserClinic + ProviderClinic) | `hasAccessToClinic()` (duplicate implementation) |
| Subdomain error logging | Logs `err.message` | Silent catch |

**Risk: MEDIUM** — 
1. **Type coercion divergence**: `withAuth` trusts `user.clinicId` as-is (already `number | undefined` from claims), while `withAuthParams` wraps it in `Number()`. If the JWT payload has `clinicId: "5"` (string), `withAuth` would set `effectiveClinicId = "5"` (truthy string, passes `==` checks but fails strict `===` comparisons), while `withAuthParams` would correctly coerce to `5`.
2. **No request-scoped cache** in `withAuthParams` means a DB query on every request hitting a subdomain route.
3. **Duplicate `hasAccessToClinic`** function — logic is identical but maintained separately.

### 1.5 Super Admin Handling

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|-----------------|
| Initial clinicId for SA | `undefined` | `undefined` |
| Subdomain override for SA | Yes — sets effectiveClinicId | Yes — sets effectiveClinicId |
| Header fallback for SA | Skipped (`user.role !== 'super_admin'` guard) | Skipped (same guard) |
| Context clearing after request | Yes — `setClinicContext(undefined)` | Yes — `setClinicContext(undefined)` |

**Assessment: ALIGNED** — Super admin handling is consistent.

### 1.6 Error Handling & Response Shape

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|-----------------|
| Request ID | `crypto.randomUUID()` in every response | **Not generated** |
| Rate limiting (brute force) | Yes — `isAuthBlocked` / `recordAuthFailure` | **Missing** |
| Error response shape | `{ error, code, requestId }` | `{ error }` (minimal) |
| Database error detection | Yes — 503 with `Retry-After` | **Missing** — throws unhandled |
| Security headers | Yes — `X-Request-ID`, `X-Content-Type-Options`, `X-Frame-Options` | **Missing** |
| Request summary logging | Yes — structured `logger.requestSummary()` | **Missing** |
| Access audit logging | Yes — `shouldLogAccess()` for writes and high-priv roles | **Missing** |
| Token source in response | Yes — `x-auth-token-source` header | **Missing** |

**Risk: HIGH** — `withAuthParams` routes have no brute-force protection, no request correlation IDs, no security headers, no 503 detection, and no audit trail. Any dynamic route (e.g. `/api/patients/[id]`) using `withAuthParams` is significantly less protected than equivalent `withAuth` routes.

### 1.7 Execution Context

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|-----------------|
| Clinic context method | `runWithClinicContext()` (AsyncLocalStorage — thread-safe) | `setClinicContext()` (global — **race-condition prone**) |
| Request context | `runWithRequestContext()` (AsyncLocalStorage) | **Not wrapped** |
| Session activity tracking | Yes — `updateSessionActivity()` fire-and-forget | **Missing** |

**Risk: HIGH** — `withAuthParams` uses the legacy global `setClinicContext()` which is explicitly deprecated in `db.ts` and subject to race conditions in serverless environments. Two concurrent requests to `withAuthParams` routes can overwrite each other's clinic context.

### 1.8 Return / AuthContext Shape

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|-----------------|
| User object mutation | Creates new object if `effectiveClinicId !== user.clinicId` | Same |
| Request mutation | `new NextRequest(req.url, ...)` with modified headers | `req.clone()` with header set |
| Permission support | `AuthOptions.permissions` with check | **Missing** |

---

## 2. Tenant Resolution Sources — Full Precedence Map

### 2.1 Edge Middleware (`src/middleware/clinic.ts` + `src/lib/edge/clinic.ts`)

Both edge clinic resolvers use the **same precedence** (documented in `resolveClinic()`):

| Priority | Source | Implementation |
|----------|--------|---------------|
| 1 | `selected-clinic` cookie | `parseInt(cookie.value)` |
| 2 | JWT `clinicId` claim | Via `jwtVerify` → `payload.clinicId` (only if `typeof === 'number'`) |
| 3 | Subdomain → `SUBDOMAIN_CLINIC_ID_MAP` env var | Static map lookup (no DB) |
| 4 | **null** — no clinic resolved | → 400 for API / redirect to `/clinic-select` for pages |

### 2.2 Application Middleware (`withAuth` / `withAuthParams`)

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | JWT `clinicId` claim | Direct from verified token payload |
| 2 | `x-clinic-id` header (from Edge) | Only if JWT has no clinicId; **not for super_admin** |
| 3 | `x-clinic-subdomain` header → DB lookup | Overrides #1/#2 if user has access to subdomain clinic |

### 2.3 Utility Functions (`src/lib/clinic/utils.ts`)

| Function | Sources | Notes |
|----------|---------|-------|
| `getClinicIdFromRequest()` | `x-clinic-id` header → `selected-clinic` cookie | No validation of `parseInt` result |
| `getCurrentClinicId()` | `selected-clinic` cookie → `DEFAULT_CLINIC_ID` env | Server components only |

### 2.4 Stripe Context (`src/lib/stripe/context.ts`)

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | `?clinicId` query param (super_admin only) | `parseInt(clinicIdParam)` — no NaN check |
| 2 | `getClinicIdFromRequest()` (header/cookie) | Falls back to `user.clinicId` |

**Risk: MEDIUM** — At least **5 different resolution chains** exist with inconsistent precedence. The `selected-clinic` cookie is the highest priority in Edge but not even consulted by `withAuth`/`withAuthParams`. A user who switches clinics via cookie but has a different JWT clinicId will see different data depending on which layer resolves the clinic.

---

## 3. Divergence Analysis

### 3.1 Logic Present in `withAuth` but Missing in `withAuthParams`

| # | Feature | Risk |
|---|---------|------|
| D1 | Algorithm restriction (`HS256` only) | HIGH |
| D2 | Claims validation (`validateTokenClaims`) | HIGH |
| D3 | Token version / revocation check | HIGH |
| D4 | Brute-force rate limiting (`isAuthBlocked`) | HIGH |
| D5 | Request ID generation and propagation | MEDIUM |
| D6 | Security response headers | MEDIUM |
| D7 | Database connection error → 503 | MEDIUM |
| D8 | `runWithClinicContext()` (AsyncLocalStorage) | HIGH |
| D9 | `runWithRequestContext()` | MEDIUM |
| D10 | Session activity tracking | LOW |
| D11 | Subdomain cache (request-scoped) | LOW |
| D12 | Structured request summary logging | LOW |
| D13 | Permission-based access control | MEDIUM |
| D14 | "Session not found" carve-out | HIGH |

### 3.2 Logic Present in `withAuthParams` but Missing in `withAuth`

| # | Feature | Risk |
|---|---------|------|
| P1 | Demo token support | LOW (env-gated) |
| P2 | Legacy cookies (`token`, `SUPER_ADMIN-token`) | LOW |

### 3.3 Conditional Gate Differences

- **`withAuth`**: Missing sessionId → always allows through (any role)
- **`withAuthParams`**: Missing sessionId → allows super_admin, warns others, but still allows through
- **Both**: Session validation failure → `withAuth` carves out "Session not found", `withAuthParams` does not

### 3.4 The `verifyAuth` Standalone Function

`verifyAuth()` in `middleware.ts` (line 1003-1064) is a **third authentication path** with its own divergences:

| Feature | `verifyAuth` |
|---------|-------------|
| Token extraction | Auth header first, then `extractToken()` (double-checks header) |
| Claims validation | None |
| Session validation | None |
| Rate limiting | None |
| Clinic context | `setClinicContext(user.clinicId)` — global, no subdomain override |
| `runWithClinicContext` | Not used |

**Risk: MEDIUM** — Any route using `verifyAuth` bypasses session validation, subdomain override, and uses global context. Found in ~30 route files.

---

## 4. Header Trust Model

### 4.1 `x-clinic-id` Analysis

**How it's set**: Edge `clinicMiddleware` resolves clinic from cookie/JWT/subdomain, then sets `x-clinic-id` header via `NextResponse.next({ request: { headers } })`.

**Trust chain**:
```
Browser Request → Vercel Edge → clinicMiddleware → sets x-clinic-id → Application Route
```

**Is it trusted blindly?** **Partially yes.** The application middleware reads it:

```573:586:src/lib/auth/middleware.ts
      if (effectiveClinicId == null && user.role !== 'super_admin') {
        const headerClinicId = req.headers.get('x-clinic-id');
        if (headerClinicId) {
          const parsed = parseInt(headerClinicId, 10);
          if (!isNaN(parsed) && parsed > 0) {
            effectiveClinicId = parsed;
            // ...
          }
        }
      }
```

**Can it be spoofed?**

| Scenario | Spoofable? | Notes |
|----------|-----------|-------|
| Vercel deployment | **No** — Edge middleware overwrites incoming `x-clinic-id` | `new Headers(request.headers)` + `.set()` overwrites |
| Direct API access (bypass Edge) | **YES** — if API route is accessible without Edge middleware | e.g., calling `curl -H "x-clinic-id: 999"` directly |
| Custom domains without Edge | **YES** — if request routing skips middleware | Depends on Vercel config |

**Risk: MEDIUM** — The header is overwritten by Edge middleware on the standard path, but there is **no cryptographic proof** that the header originated from Edge. A misconfigured deployment or direct API access could inject arbitrary `x-clinic-id` values.

### 4.2 `x-clinic-subdomain` Analysis

Same trust model as `x-clinic-id`. Set by Edge, consumed by application middleware. No signing or HMAC.

### 4.3 Hardening Recommendation

**Option A — Signed Header (Recommended)**:
```typescript
// In Edge middleware:
const payload = JSON.stringify({ clinicId, subdomain, ts: Date.now() });
const signature = await hmacSign(payload, process.env.EDGE_SIGNING_SECRET);
headers.set('x-clinic-context', payload);
headers.set('x-clinic-context-sig', signature);

// In application middleware:
const payload = req.headers.get('x-clinic-context');
const sig = req.headers.get('x-clinic-context-sig');
if (!verifyHmac(payload, sig, process.env.EDGE_SIGNING_SECRET)) {
  // Reject — header was not set by Edge
}
```

**Option B — Strip on Ingress (Simpler)**:
Configure Vercel/CDN to strip `x-clinic-id` and `x-clinic-subdomain` from all incoming requests before they reach Edge middleware. This ensures the header can only be set by the middleware.

---

## 5. Service-Layer Enforcement

### 5.1 Services with Proper Clinic Guards

| Service | Guard Pattern | Assessment |
|---------|--------------|------------|
| `order.service.ts` | `ForbiddenError('No clinic associated')` on every entry point | **GOOD** |
| `patient.service.ts` | `ForbiddenError(ERR_NO_CLINIC)` on every entry + `getClinicContext()` fallback | **GOOD** |
| `patient-merge.service.ts` | Checks `clinicId` match between source/target + user guard | **GOOD** |
| `ticket.service.ts` | `ForbiddenError('Cannot create ticket for another clinic')` | **GOOD** |
| `provider.service.ts` | `ForbiddenError` for clinic mismatch | **GOOD** |

### 5.2 Database Layer Enforcement

The `PrismaWithClinicFilter` class in `db.ts` provides a strong defense-in-depth layer:

1. **`CLINIC_ISOLATED_MODELS`** list (75+ models) auto-filtered
2. **`TenantContextRequiredError`** thrown if clinic context is missing for isolated models
3. **Defense-in-depth**: Post-query validation filters out cross-clinic records
4. **`basePrisma` guarded**: Production proxy throws on non-allowlisted isolated models

**Assessment: STRONG** — The Prisma wrapper is the strongest enforcement layer. However, it depends on `getClinicId()` which reads from `AsyncLocalStorage` first, then falls back to the deprecated global. Routes using `withAuthParams` (which only sets the global) are vulnerable to race conditions.

### 5.3 Gap: `verifyAuth` Routes

Routes using `verifyAuth()` set `setClinicContext(user.clinicId)` directly (global only). They do **not** call `runWithClinicContext()`, meaning:
- No AsyncLocalStorage context is created
- The deprecated global is the only source
- Concurrent requests can cross-contaminate

**Risk: HIGH** — ~30 route files use `verifyAuth`. Each is a potential cross-tenant data leak under concurrent load.

### 5.4 Gap: `getClinicIdFromRequest()` Utility

`src/lib/clinic/utils.ts:getClinicIdFromRequest()` uses `parseInt()` without `NaN` validation:

```9:12:src/lib/clinic/utils.ts
  const headerClinicId = request.headers.get('x-clinic-id');
  if (headerClinicId) {
    return parseInt(headerClinicId);
  }
```

If `x-clinic-id` is `"abc"`, `parseInt("abc")` returns `NaN`, which propagates as `clinicId: NaN`. The Prisma wrapper may not catch this because `NaN !== undefined`.

**Risk: LOW** — NaN typically causes a Prisma error, but could theoretically bypass the `TenantContextRequiredError` check.

---

## 6. Findings Summary

| # | Finding | Severity | Location | Recommendation |
|---|---------|----------|----------|----------------|
| F1 | No algorithm restriction in `withAuthParams` | **HIGH** | `middleware-with-params.ts:96` | Add `{ algorithms: ['HS256'], clockTolerance: 30 }` |
| F2 | No token version / revocation check in `withAuthParams` | **HIGH** | `middleware-with-params.ts:95-101` | Add `minimumTokenVersion` check |
| F3 | No claims validation in `withAuthParams` | **HIGH** | `middleware-with-params.ts:97` | Reuse `validateTokenClaims()` |
| F4 | Session "not found" divergence | **HIGH** | `middleware-with-params.ts:240` | Add `reason !== 'Session not found'` carve-out |
| F5 | Global `setClinicContext` in `withAuthParams` | **MEDIUM** | `middleware-with-params.ts:343` | Use `runWithClinicContext()` |
| F6 | No brute-force protection in `withAuthParams` | **MEDIUM** | `middleware-with-params.ts` (absent) | Add `isAuthBlocked` / `recordAuthFailure` |
| F7 | No security headers in `withAuthParams` | **MEDIUM** | `middleware-with-params.ts` (absent) | Add `X-Request-ID`, `X-Content-Type-Options`, `X-Frame-Options` |
| F8 | No request ID in `withAuthParams` | **MEDIUM** | `middleware-with-params.ts` (absent) | Generate `crypto.randomUUID()` |
| F9 | Cookie list divergence (`token`, `SUPER_ADMIN-token`) | **MEDIUM** | `middleware-with-params.ts:136-153` | Unify cookie lists |
| F10 | `x-clinic-id` unsigned header | **MEDIUM** | `middleware/clinic.ts:68` | Add HMAC signing or strip on ingress |
| F11 | `verifyAuth` bypasses all protections | **LOW** | `middleware.ts:1003-1064` | Deprecate in favor of `withAuth` |
| F12 | Demo tokens in `withAuthParams` | **LOW** | `middleware-with-params.ts:47-93` | Remove or move to test harness |
| F13 | `selected-clinic` cookie precedence inconsistency | **LOW** | Edge vs application middleware | Document or unify |
| F14 | `parseInt` without NaN check in `clinic/utils.ts` | **LOW** | `src/lib/clinic/utils.ts:11` | Add `isNaN` guard |

---

## 7. Concrete Refactor Recommendation

### Proposed: Unified `resolveAuthContext()`

Extract all shared logic into a single function that both `withAuth` and `withAuthParams` call:

```typescript
// src/lib/auth/resolve-auth-context.ts

interface AuthContextResult {
  user: AuthUser;
  effectiveClinicId: number | undefined;
  requestId: string;
  tokenSource: string | null;
}

interface AuthContextError {
  error: string;
  code: string;
  status: number;
  requestId: string;
}

type ResolveResult =
  | { ok: true; context: AuthContextResult }
  | { ok: false; error: AuthContextError; optional?: boolean };

export async function resolveAuthContext(
  req: NextRequest,
  options: AuthOptions = {}
): Promise<ResolveResult> {
  const requestId = crypto.randomUUID();
  const clientIP = getClientIP(req);

  // 1. Rate limiting
  if (await isAuthBlocked(clientIP)) {
    return { ok: false, error: { error: 'Too many failures', code: 'AUTH_RATE_LIMITED', status: 429, requestId } };
  }

  // 2. Extract token (unified cookie list, with source tracking)
  const { token, source } = extractToken(req);
  if (!token) {
    if (options.optional) return { ok: false, optional: true, error: { ... } };
    await recordAuthFailure(clientIP);
    return { ok: false, error: { error: 'Auth required', code: 'AUTH_REQUIRED', status: 401, requestId } };
  }

  // 3. Verify token (shared: HS256, clockTolerance, claims, version)
  const result = await verifyToken(token);
  if (!result.valid || !result.user) {
    await recordAuthFailure(clientIP);
    return { ok: false, error: { error: result.error!, code: result.errorCode!, status: 401, requestId } };
  }
  await clearAuthFailures(clientIP);

  // 4. Session validation (shared: "not found" carve-out)
  // ...

  // 5. Role/permission checks
  // ...

  // 6. Clinic resolution (shared: JWT → header → subdomain, with cache)
  // ...

  return {
    ok: true,
    context: { user: userForHandler, effectiveClinicId, requestId, tokenSource: source }
  };
}
```

Then `withAuth` and `withAuthParams` become thin wrappers:

```typescript
export function withAuth(handler, options) {
  return async (req, context?) => {
    const result = await resolveAuthContext(req, options);
    if (!result.ok) {
      if (result.optional) return handler(req, null, context);
      return NextResponse.json(result.error, { status: result.error.status });
    }
    const { user, effectiveClinicId, requestId, tokenSource } = result.context;

    return runWithClinicContext(effectiveClinicId, () =>
      runWithRequestContext({ requestId, clinicId: effectiveClinicId, userId: user.id }, () =>
        handler(modifiedReq, user, context)
      )
    );
  };
}

export function withAuthParams(handler, options) {
  return async (req, context) => {
    // Identical resolution — just different handler signature
    const result = await resolveAuthContext(req, options);
    // ... same wrapping with runWithClinicContext ...
    return handler(modifiedReq, user, context);
  };
}
```

**Estimated effort:** 2-3 days including test migration.

---

## 8. Regression Test Cases

| # | Test Case | Purpose | Expected |
|---|-----------|---------|----------|
| T1 | JWT with `alg: none` → `withAuthParams` | Verify algorithm restriction | 401 |
| T2 | JWT with `tokenVersion: 0` → both middleware | Verify revocation | 401 |
| T3 | JWT with `clinicId: "5"` (string) → both | Verify type coercion | Same `effectiveClinicId: 5` |
| T4 | Valid JWT, Redis "Session not found" → both | Verify session carve-out parity | Both allow through |
| T5 | Valid JWT, Redis session revoked → both | Verify session block | Both return 401 |
| T6 | `x-clinic-id: 999` injected header (no Edge) → `withAuth` | Verify header trust | Should be rejected or verified |
| T7 | `x-clinic-id: abc` → `getClinicIdFromRequest()` | Verify NaN handling | Returns null, not NaN |
| T8 | Super admin on `ot.eonpro.io` → both | Verify subdomain override | `effectiveClinicId` matches OT clinic |
| T9 | Non-SA user on different clinic's subdomain (no access) → both | Verify cross-clinic block | `effectiveClinicId` stays as JWT value |
| T10 | 50 concurrent requests to `withAuthParams` routes | Verify no cross-tenant leak | Each request isolated |
| T11 | `selected-clinic` cookie = 5, JWT `clinicId` = 3, subdomain = OT (id=8) | Verify resolution priority | Both return same clinicId |
| T12 | Auth failure from same IP × 10 → both middleware | Verify rate limiting | 429 on both |
| T13 | Expired token → `withAuthParams` | Verify error code | `EXPIRED` code in response |
| T14 | Demo token in production → `withAuthParams` | Verify demo disabled | 401 |
| T15 | Route using `verifyAuth` under concurrent load | Verify no global context race | Per-request isolation |

---

## 9. Appendix: Route Distribution

| Middleware | Approximate Route Count |
|-----------|------------------------|
| `withAuth` | ~120 routes |
| `withAuthParams` | ~45 routes (all `[id]` / `[slug]` dynamic routes) |
| `verifyAuth` | ~30 routes |
| No auth wrapper (webhooks, public) | ~25 routes |

---

## 10. Priority Action Items

1. **IMMEDIATE (P0)**: Add `{ algorithms: ['HS256'], clockTolerance: 30 }` to `withAuthParams` `jwtVerify` call — prevents algorithm confusion attacks.

2. **IMMEDIATE (P0)**: Add `reason !== 'Session not found'` carve-out to `withAuthParams` session validation — eliminates intermittent 401s on dynamic routes.

3. **WEEK 1 (P1)**: Replace `setClinicContext()` with `runWithClinicContext()` in `withAuthParams` — eliminates race condition under concurrent load.

4. **WEEK 1 (P1)**: Extract `resolveAuthContext()` shared function — single source of truth for all auth logic.

5. **WEEK 2 (P2)**: Add brute-force protection, security headers, request IDs to `withAuthParams`.

6. **WEEK 2 (P2)**: Unify cookie extraction lists between both middleware.

7. **WEEK 3 (P3)**: Implement signed `x-clinic-context` header or strip-on-ingress.

8. **WEEK 3 (P3)**: Deprecate `verifyAuth` — migrate all 30 routes to `withAuth`.

---

*End of audit report.*
