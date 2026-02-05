# Authentication & Middleware Audit Report

**Date**: 2026-02-04  
**Scope**: Complete audit of middleware.ts, auth wrappers, and authentication flow  
**Status**: Issues Identified - Recommendations Provided

---

## Executive Summary

This audit examined:
1. Root `middleware.ts` - Route handling and security headers
2. `src/lib/auth/middleware.ts` - Main authentication wrappers
3. `src/lib/auth/middleware-with-params.ts` - Dynamic route auth wrapper
4. `src/middleware/clinic.ts` - Multi-tenant clinic middleware
5. Session management and validation

### Overall Assessment

✅ **Strengths:**
- Comprehensive security headers implementation
- Proper JWT verification with jose library
- Good audit logging for security events
- Multi-tenant clinic context handling
- Role-based access control (RBAC) implemented

⚠️ **Issues Found:** 6 issues identified (2 HIGH, 3 MEDIUM, 1 LOW)

---

## CRITICAL ISSUES

### 1. ⚠️ Session Validation Bypass When sessionId Missing

**Location**: `src/lib/auth/middleware.ts:409`

**Issue**: Session validation is skipped entirely if `user.sessionId` is undefined:

```typescript
// Session validation (skip for serverless compatibility when session is missing)
if (!options.skipSessionValidation && user.sessionId) {
  const sessionResult = await validateSession(token, req);
  // ...
}
```

**Problem**: 
- Tokens without `sessionId` bypass session timeout checks
- Tokens can be used indefinitely if they don't have sessionId
- Comment says "serverless compatibility" but this weakens security

**Impact**: HIGH - Tokens without sessionId can bypass idle timeout and absolute timeout checks

**Recommendation**:
```typescript
// Always validate session if sessionId exists OR if session validation is required
if (!options.skipSessionValidation) {
  if (user.sessionId) {
    const sessionResult = await validateSession(token, req);
    if (!sessionResult.valid && sessionResult.reason !== 'Session not found') {
      // Reject invalid sessions
    }
  } else {
    // For tokens without sessionId, at minimum check token expiration
    // Consider requiring sessionId for all tokens in production
    logger.warn('Token without sessionId - session validation skipped', {
      userId: user.id,
      role: user.role,
    });
  }
}
```

**Priority**: HIGH - Fix immediately

---

### 2. ⚠️ Inconsistent Auth Implementation: `withAuthParams` vs `withAuth`

**Location**: `src/lib/auth/middleware-with-params.ts` vs `src/lib/auth/middleware.ts`

**Issue**: Two different authentication implementations with different behaviors:

| Feature | `withAuth` | `withAuthParams` |
|---------|-----------|------------------|
| Token extraction | Comprehensive (headers, cookies, query) | Basic (headers, limited cookies) |
| Session validation | Conditional on sessionId | Always runs if sessionId exists |
| Clinic context | Uses `runWithClinicContext` | Uses `setClinicContext` (legacy) |
| Error handling | Detailed with requestId | Basic |
| Token validation | Full JWT verification | Basic verification |

**Problem**:
- Routes using `withAuthParams` may have different security behavior
- Cookie token extraction differs (missing some cookie names)
- Clinic context handling uses deprecated global state

**Impact**: MEDIUM - Inconsistent security behavior across routes

**Recommendation**:
1. **Option A (Preferred)**: Refactor `withAuthParams` to use `withAuth` internally:
```typescript
export function withAuthParams<T extends { params: any }>(
  handler: (req: NextRequest, user: AuthUser, context: T) => Promise<Response>,
  options: AuthOptions = {}
) {
  return async (req: NextRequest, context: T) => {
    const authHandler = withAuth(
      (authedReq: NextRequest, user: AuthUser) => handler(authedReq, user, context),
      options
    );
    return authHandler(req);
  };
}
```

2. **Option B**: Align `withAuthParams` implementation with `withAuth`:
   - Use same token extraction logic
   - Use same session validation logic
   - Use `runWithClinicContext` instead of `setClinicContext`

**Priority**: MEDIUM - Fix to ensure consistency

---

## HIGH PRIORITY ISSUES

### 3. ⚠️ Optional Auth Can Pass Null User to Handlers

**Location**: `src/lib/auth/middleware.ts:364, 384`

**Issue**: When `options.optional` is true, handlers receive `null as unknown as AuthUser`:

```typescript
if (!token) {
  if (options.optional) {
    return handler(req, null as unknown as AuthUser, context);
  }
  // ...
}

if (!tokenResult.valid || !tokenResult.user) {
  if (options.optional) {
    return handler(req, null as unknown as AuthUser, context);
  }
  // ...
}
```

**Problem**:
- Type casting `null as unknown as AuthUser` bypasses TypeScript safety
- Handlers must manually check for null user
- No compile-time guarantee that handlers handle null case

**Impact**: MEDIUM - Runtime errors possible if handlers don't check for null

**Recommendation**:
```typescript
// Update handler signature to allow null
export function withAuth<T = unknown>(
  handler: (req: NextRequest, user: AuthUser | null, context?: T) => Promise<Response>,
  options: AuthOptions = {}
): (req: NextRequest, context?: T) => Promise<Response> {
  // ...
  if (!token) {
    if (options.optional) {
      return handler(req, null, context);
    }
    // ...
  }
  // ...
}
```

**Priority**: MEDIUM - Improve type safety

---

### 4. ⚠️ Clinic Middleware Doesn't Enforce Authentication

**Location**: `src/middleware/clinic.ts` and `middleware.ts:112-117`

**Issue**: Clinic middleware runs before authentication and sets clinic context:

```typescript
// Apply clinic middleware for multi-tenant support
if (process.env.NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true') {
  const clinicResponse = await clinicMiddleware(request);
  response = clinicResponse || NextResponse.next();
} else {
  response = NextResponse.next();
}
```

**Problem**:
- Clinic context can be set without authentication
- Routes must still use auth wrappers, but clinic context is available to unauthenticated requests
- Could allow unauthenticated requests to access clinic-specific data if routes don't check auth

**Impact**: LOW - Routes should still use auth wrappers, but clinic context shouldn't be set without auth

**Recommendation**:
- Clinic middleware should only set clinic context for authenticated requests
- Or move clinic context setting into auth middleware after authentication succeeds
- Current design is acceptable IF all routes use auth wrappers (which they should)

**Priority**: LOW - Current design is acceptable with proper route protection

---

## MEDIUM PRIORITY ISSUES

### 5. ⚠️ Missing Request Body Preservation in Modified Request

**Location**: `src/lib/auth/middleware.ts:520-524`

**Issue**: When creating modified request with headers, body might not be preserved correctly:

```typescript
const modifiedReq = new NextRequest(req.url, {
  method: req.method,
  headers,
  body: req.body,
});
```

**Problem**:
- `req.body` is a ReadableStream that can only be read once
- If body was already consumed, this will fail
- Next.js request body handling can be tricky

**Impact**: LOW - May cause issues if body is consumed before auth middleware

**Recommendation**:
```typescript
// Clone request to preserve body
const modifiedReq = req.clone();
// Then set headers
Object.entries(headers).forEach(([key, value]) => {
  modifiedReq.headers.set(key, value);
});
```

**Priority**: LOW - Edge case, but should be fixed

---

### 6. ⚠️ Token Extraction Order May Cause Cookie Conflicts

**Location**: `src/lib/auth/middleware.ts:278-296`

**Issue**: Multiple cookie names checked in order, but order might not match actual usage:

```typescript
const cookieTokenNames = [
  'affiliate_session', // Affiliate portal - check first
  'influencer-token', // Legacy influencer portal
  'affiliate-token',
  'auth-token',
  'super_admin-token',
  'admin-token',
  'provider-token',
  'patient-token',
  'staff-token',
  'support-token',
];
```

**Problem**:
- If multiple cookies exist, first match wins
- User might have multiple valid tokens (e.g., admin-token and auth-token)
- Could use wrong token if order doesn't match user's role

**Impact**: LOW - Edge case, but could cause authorization issues

**Recommendation**:
- Consider checking Authorization header first (already done)
- Then check role-specific cookies based on route context
- Or validate all tokens and use the one with highest privileges

**Priority**: LOW - Current implementation is acceptable

---

## POSITIVE FINDINGS

### ✅ Security Headers Implementation
- Comprehensive CSP headers
- Proper CORS handling with origin validation
- Security headers applied consistently

### ✅ JWT Verification
- Uses `jose` library (secure)
- Proper token validation
- Token version checking for revocation

### ✅ Audit Logging
- All auth failures logged
- Session timeouts logged
- Authorization failures logged

### ✅ Role-Based Access Control
- Proper role checking
- Permission-based access control supported
- Multiple convenience wrappers (withAdminAuth, withClinicalAuth, etc.)

### ✅ Multi-Tenant Support
- Clinic context properly isolated
- Super admin can access all clinics
- Regular users restricted to their clinic

---

## RECOMMENDATIONS

### Immediate Actions (High Priority)

1. **Fix Session Validation Bypass** (Issue #1)
   - Always validate sessions when sessionId exists
   - Consider requiring sessionId for all tokens in production
   - Log warnings when sessionId is missing

2. **Unify Auth Implementations** (Issue #2)
   - Refactor `withAuthParams` to use `withAuth` internally
   - Ensure consistent behavior across all routes

### Short-Term Improvements (Medium Priority)

3. **Improve Type Safety for Optional Auth** (Issue #3)
   - Update handler signatures to allow `AuthUser | null`
   - Remove unsafe type casting

4. **Fix Request Body Handling** (Issue #5)
   - Use `req.clone()` to preserve body
   - Test with routes that consume body before auth

### Long-Term Enhancements (Low Priority)

5. **Review Clinic Middleware Design** (Issue #4)
   - Consider moving clinic context setting to auth middleware
   - Ensure clinic context only set for authenticated requests

6. **Optimize Token Extraction** (Issue #6)
   - Consider role-based cookie selection
   - Document token priority order

---

## TESTING CHECKLIST

After fixes, verify:

- [ ] Tokens without sessionId are properly handled (logged/rejected)
- [ ] `withAuthParams` behaves identically to `withAuth`
- [ ] Optional auth handlers receive proper null types
- [ ] Request body is preserved through auth middleware
- [ ] Clinic context only set for authenticated requests
- [ ] Token extraction uses correct priority order

---

## ROUTE PROTECTION STATUS

Based on previous audits:
- ✅ 97 routes properly use auth wrappers
- ✅ 28 routes intentionally public (webhooks, health checks)
- ✅ Critical security issues from previous audit have been fixed

**Recommendation**: Continue using auth wrappers for all new routes. Consider adding ESLint rule to enforce auth wrapper usage.

---

## CONCLUSION

The authentication system is **generally well-implemented** with good security practices. The main issues are:

1. **Session validation bypass** - Should be fixed immediately
2. **Inconsistent implementations** - Should be unified for consistency
3. **Type safety improvements** - Should be addressed for better developer experience

All issues are fixable without major architectural changes. The system is production-ready but would benefit from these improvements.

---

**Report Generated**: 2026-02-04  
**Next Review**: After fixes are implemented
