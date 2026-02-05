# Undefined Function/Method Calls Audit Report

**Generated:** February 4, 2026  
**Scope:** Auth, Middleware, and Service files  
**Focus:** Potential runtime errors from undefined function calls, null/undefined access patterns, and deprecated APIs

---

## 🔴 CRITICAL ISSUES

### 1. Response.json() Called Without response.ok Check

These calls parse JSON before verifying the response was successful, which can cause runtime errors if the API returns an error page (HTML) or non-JSON response.

#### `src/lib/auth/AuthContext.tsx:119`
```typescript
const response = await fetch('/api/auth/session', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  cache: 'no-store',
});

if (!response.ok) {
  logger.error('Session verification failed:', { status: response.status });
  return null;
}

const data = await response.json(); // ✅ SAFE - checked response.ok first
```
**Status:** ✅ Actually safe - `response.ok` is checked before parsing

#### `src/lib/auth/AuthContext.tsx:157`
```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, role }),
});

const data = await response.json(); // ❌ UNSAFE - parsed before checking response.ok

if (!response.ok) {
  throw new Error(data.error || 'Login failed');
}
```
**Issue:** JSON is parsed before checking `response.ok`. If the response is not JSON (e.g., HTML error page), this will throw an error.
**Impact:** Login failures may crash the app instead of showing an error message.
**Fix:** Check `response.ok` before parsing JSON:
```typescript
if (!response.ok) {
  const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
  throw new Error(errorData.error || 'Login failed');
}
const data = await response.json();
```

#### `src/lib/auth/AuthContext.tsx:238`
```typescript
const response = await fetch('/api/auth/refresh-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: refresh }),
});

const data = await response.json(); // ❌ UNSAFE - parsed before checking response.ok

if (!response.ok) {
  throw new Error(data.error || 'Token refresh failed');
}
```
**Issue:** Same as above - JSON parsed before checking response status.
**Impact:** Token refresh failures may crash instead of handling gracefully.
**Fix:** Same pattern as above.

---

### 2. String Operations on Potentially Null/Undefined Values

#### `src/lib/auth/middleware.ts:273`
```typescript
const authHeader = req.headers.get('authorization');
if (authHeader?.startsWith('Bearer ')) {
  return authHeader.slice(7).trim(); // ✅ SAFE - optional chaining ensures authHeader exists
}
```
**Status:** ✅ Safe - uses optional chaining

#### `src/lib/auth/middleware.ts:318`
```typescript
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || // ✅ SAFE - optional chaining
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}
```
**Status:** ✅ Safe - uses optional chaining and fallback

#### `src/lib/auth/middleware.ts:440-441`
```typescript
if (options.roles && options.roles.length > 0) {
  const userRole = user.role.toLowerCase() as UserRole; // ⚠️ POTENTIAL ISSUE
  const allowedRoles = options.roles.map((r) => r.toLowerCase());
```
**Issue:** `user.role` could theoretically be undefined, but this is unlikely since it's validated earlier. However, `toLowerCase()` on undefined would throw.
**Impact:** Low - `user` is validated before this point, but defensive coding would help.
**Fix:** Add null check:
```typescript
const userRole = (user.role || '').toLowerCase() as UserRole;
```

#### `src/lib/auth/middleware.ts:798`
```typescript
const authHeader = req.headers.get('authorization');
let token: string | null = null;

if (authHeader?.startsWith('Bearer ')) {
  token = authHeader.slice(7).trim(); // ✅ SAFE - optional chaining ensures authHeader exists
}
```
**Status:** ✅ Safe

---

### 3. Optional Method Calls Without Existence Checks

#### `src/lib/auth/middleware.ts:292`
```typescript
for (const cookieName of cookieTokenNames) {
  const token = req.cookies.get(cookieName)?.value; // ✅ SAFE - optional chaining
  if (token) {
    return token;
  }
}
```
**Status:** ✅ Safe - uses optional chaining

#### `src/lib/auth/middleware.ts:818`
```typescript
for (const cookieName of cookieTokenNames) {
  const cookieToken = req.cookies.get(cookieName)?.value; // ✅ SAFE - optional chaining
  if (cookieToken) {
    token = cookieToken;
    break;
  }
}
```
**Status:** ✅ Safe

#### `src/lib/auth/middleware.ts:878-894`
```typescript
export function getCurrentUser(req: NextRequest): AuthUser | null {
  const userId = req.headers.get('x-user-id');
  const userEmail = req.headers.get('x-user-email');
  const userRole = req.headers.get('x-user-role');
  const clinicId = req.headers.get('x-clinic-id');

  if (!userId || !userEmail || !userRole) {
    return null; // ✅ SAFE - checks for null before using
  }

  return {
    id: parseInt(userId, 10), // ⚠️ POTENTIAL ISSUE
    email: userEmail,
    role: userRole as UserRole,
    clinicId: clinicId ? parseInt(clinicId, 10) : undefined, // ✅ SAFE - checks before parsing
  };
}
```
**Issue:** `parseInt(userId, 10)` could return `NaN` if `userId` is not a valid number string. However, this is unlikely since headers are set by middleware.
**Impact:** Low - but `NaN` would cause issues downstream.
**Fix:** Add validation:
```typescript
const id = parseInt(userId, 10);
if (isNaN(id)) {
  return null;
}
return {
  id,
  // ...
};
```

---

### 4. Service Files - Response Parsing Issues

#### `src/services/affiliate/payoutService.ts:240`
```typescript
const authResponse = await fetch(/* ... */);
const { access_token } = await authResponse.json(); // ❌ NO response.ok CHECK
```
**Issue:** No check if `authResponse.ok` before parsing JSON.
**Impact:** May throw error if auth fails.
**Fix:** Add response.ok check before parsing.

#### `src/services/affiliate/payoutService.ts:271`
```typescript
if (!payoutResponse.ok) {
  const errorData = await payoutResponse.json(); // ✅ SAFE - inside error check
  // ...
}
const result = await payoutResponse.json(); // ✅ SAFE - only reached if response.ok
```
**Status:** ✅ Safe - checks response.ok before parsing

#### `src/services/affiliate/ipIntelService.ts:136`
```typescript
const response = await fetch(/* ... */);
const data: IpQualityScoreResponse = await response.json(); // ❌ NO response.ok CHECK
```
**Issue:** No check if response is ok before parsing JSON.
**Impact:** May throw error if API fails.
**Fix:** Add response.ok check.

---

### 5. Middleware - Request Body Access

#### `src/lib/auth/middleware.ts:520-524`
```typescript
const modifiedReq = new NextRequest(req.url, {
  method: req.method,
  headers,
  body: req.body, // ⚠️ POTENTIAL ISSUE
});
```
**Issue:** `req.body` is a `ReadableStream | null`. If it's been consumed already, this could be null or cause issues.
**Impact:** Low - Next.js handles this, but if body was read earlier, it won't be available.
**Note:** This is a Next.js limitation - request bodies can only be read once.

---

### 6. Cache/Map Operations Without Null Checks

#### `src/lib/auth/session-manager.ts:97`
```typescript
const keys = await cache.keys(`${SESSION_NAMESPACE}:*`); // ⚠️ POTENTIAL ISSUE
const sessions: SessionState[] = [];

for (const key of keys) {
  const sessionId = key.replace(`${SESSION_NAMESPACE}:`, ''); // ⚠️ POTENTIAL ISSUE
  const session = await getSession(sessionId);
  if (session && session.userId === userId) {
    sessions.push(session);
  }
}
```
**Issue:** `cache.keys()` might return `null` or `undefined` if Redis is unavailable. Also, `key.replace()` assumes the pattern matches.
**Impact:** Medium - could throw if cache.keys() returns unexpected value.
**Fix:** Add null check:
```typescript
const keys = await cache.keys(`${SESSION_NAMESPACE}:*`) || [];
```

---

## 🟡 MEDIUM PRIORITY ISSUES

### 7. Array Methods on Potentially Undefined Arrays

#### `src/lib/auth/middleware.ts:441`
```typescript
const allowedRoles = options.roles.map((r) => r.toLowerCase()); // ✅ SAFE - checked length > 0 above
```
**Status:** ✅ Safe - `options.roles` is checked for existence and length before this

#### `src/lib/auth/middleware.ts:470`
```typescript
const userPermissions = user.permissions || []; // ✅ SAFE - provides fallback
const hasAllPermissions = options.permissions.every((p) => userPermissions.includes(p));
```
**Status:** ✅ Safe - provides empty array fallback

---

### 8. Object Property Access Without Null Checks

#### `src/lib/auth/AuthContext.tsx:128-137`
```typescript
return {
  id: data.user.id, // ⚠️ POTENTIAL ISSUE - data.user checked above but properties not
  email: data.user.email,
  name: data.user.name,
  role: data.user.role as User['role'],
  providerId: data.user.providerId,
  patientId: data.user.patientId,
  influencerId: data.user.influencerId,
  permissions: data.user.permissions,
};
```
**Issue:** `data.user` is checked for existence, but individual properties are not validated.
**Impact:** Low - if user object exists, properties should exist, but TypeScript types may not guarantee this.
**Fix:** Add optional chaining or validation:
```typescript
return {
  id: data.user?.id ?? 0,
  email: data.user?.email ?? '',
  // ...
};
```

---

## 🟢 LOW PRIORITY / DEFENSIVE CODING OPPORTUNITIES

### 9. Type Assertions Without Runtime Validation

#### `src/lib/auth/middleware.ts:440`
```typescript
const userRole = user.role.toLowerCase() as UserRole; // ⚠️ Type assertion without validation
```
**Issue:** Type assertion doesn't validate at runtime that the role is actually a valid `UserRole`.
**Impact:** Very low - role is validated earlier in token verification.
**Fix:** Add runtime validation if needed:
```typescript
const validRoles: UserRole[] = ['super_admin', 'admin', /* ... */];
const userRole = user.role.toLowerCase();
if (!validRoles.includes(userRole as UserRole)) {
  throw new Error(`Invalid role: ${userRole}`);
}
```

---

## 📋 SUMMARY

### Critical Issues (Must Fix)
1. **`src/lib/auth/AuthContext.tsx:157`** - Parse JSON before checking response.ok
2. **`src/lib/auth/AuthContext.tsx:238`** - Parse JSON before checking response.ok
3. **`src/services/affiliate/payoutService.ts:240`** - No response.ok check before JSON parsing
4. **`src/services/affiliate/ipIntelService.ts:136`** - No response.ok check before JSON parsing

### Medium Priority (Should Fix)
5. **`src/lib/auth/middleware.ts:440`** - Add null check for user.role.toLowerCase()
6. **`src/lib/auth/middleware.ts:878`** - Validate parseInt result for userId
7. **`src/lib/auth/session-manager.ts:97`** - Add null check for cache.keys() result

### Low Priority (Nice to Have)
8. **`src/lib/auth/AuthContext.tsx:128`** - Add optional chaining for user properties
9. **`src/lib/auth/middleware.ts:440`** - Add runtime validation for role type assertion

---

## 🔧 RECOMMENDED FIXES

### Pattern 1: Always Check response.ok Before Parsing JSON

**Before:**
```typescript
const response = await fetch('/api/endpoint');
const data = await response.json();
if (!response.ok) {
  throw new Error(data.error);
}
```

**After:**
```typescript
const response = await fetch('/api/endpoint');
if (!response.ok) {
  const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
  throw new Error(errorData.error || `HTTP ${response.status}`);
}
const data = await response.json();
```

### Pattern 2: Validate Parse Results

**Before:**
```typescript
const id = parseInt(userId, 10);
return { id, ... };
```

**After:**
```typescript
const id = parseInt(userId, 10);
if (isNaN(id)) {
  return null; // or throw error
}
return { id, ... };
```

### Pattern 3: Defensive Array/Map Operations

**Before:**
```typescript
const keys = await cache.keys(pattern);
for (const key of keys) { ... }
```

**After:**
```typescript
const keys = await cache.keys(pattern) || [];
for (const key of keys) { ... }
```

---

## ✅ VERIFICATION CHECKLIST

- [ ] Fix response.json() calls in AuthContext.tsx (lines 157, 238)
- [ ] Fix response.json() calls in service files
- [ ] Add null checks for string operations
- [ ] Validate parseInt results
- [ ] Add defensive checks for cache operations
- [ ] Test error scenarios (network failures, invalid responses)
- [ ] Add error boundaries for client-side components

---

**Next Steps:**
1. Prioritize critical issues (response.json() calls)
2. Add comprehensive error handling
3. Consider adding a fetch wrapper utility that always checks response.ok
4. Add TypeScript strict null checks to catch these issues at compile time
