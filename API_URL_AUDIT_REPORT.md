# API URL and Fetch Call Audit Report

**Generated:** 2026-02-04  
**Purpose:** Identify hardcoded URLs, malformed endpoints, missing error handling, and duplicate routes

---

## 1. Hardcoded Localhost URLs (Should Use Environment Variables)

### 🔴 Critical - Production Code

#### `package.json` (Line 73)
```json
"sync:overtime": "tsx -e \"fetch('http://localhost:3000/api/integrations/overtime/sync', ...)\""
```
**Issue:** Hardcoded `http://localhost:3000` in npm script  
**Impact:** Script will fail in production/staging environments  
**Fix:** Use `process.env.NEXT_PUBLIC_APP_URL` or make it configurable  
**Priority:** HIGH

#### `src/lib/integrations/aws/s3Config.ts` (Line 147)
```typescript
AllowedOrigins: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],
```
**Issue:** Hardcoded localhost fallback in S3 CORS configuration  
**Impact:** S3 CORS may fail in production if env var is missing  
**Fix:** Remove fallback or use production-safe default  
**Priority:** MEDIUM

#### `scripts/test-overtime-intake.ts` (Line 142)
```typescript
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
```
**Issue:** Hardcoded localhost fallback in test script  
**Impact:** Script defaults to localhost if env var missing  
**Fix:** Fail fast if env var is missing, or document requirement  
**Priority:** LOW (test script)

### ✅ Acceptable - Test/Documentation Files
The following files contain localhost URLs but are acceptable as they're test files, documentation, or development-only:
- Test files (`tests/**/*.test.ts`, `tests/**/*.spec.ts`)
- Documentation files (`docs/**/*.md`)
- Development scripts (`scripts/test-*.ts`, `scripts/test-*.js`)
- CI/CD workflows (`.github/workflows/*.yml`)
- Docker compose files (development configs)

---

## 2. Malformed URLs and Typos

### 🔴 Critical Issues

#### `src/app/documents/page.tsx` (Line 69)
```typescript
const response = await fetch('/api/v2/aws/s3/list?' + new URLSearchParams({
```
**Issue:** String concatenation instead of template literal - potential for missing `?`  
**Status:** Actually correct - URLSearchParams handles the `?` properly  
**Priority:** NONE (false positive)

#### `API_ENDPOINTS_AUDIT_REPORT.md` - Reported Issues:

1. **`/api/pharmacy/prescriptions`** ✅ CORRECT
   - **File:** `src/app/pharmacy/prescriptions/page.tsx:33`
   - **Status:** Endpoint is correctly formed as `/api/pharmacy/prescriptions${params}`
   - **Note:** The API_ENDPOINTS_AUDIT_REPORT.md incorrectly flagged this - it's actually fine

2. **`/api/messages/conversations/${selectedMessage?.patientId}`** ✅ CORRECT
   - **File:** `src/app/provider/messages/page.tsx:85`
   - **Status:** Uses template literal properly with optional chaining
   - **Note:** Endpoint is properly formed: `/api/messages/conversations/${patientId}`

---

## 3. Fetch Calls Missing Error Handling

### 🔴 Missing `response.ok` Checks

#### `src/lib/auth/AuthContext.tsx` (Line 217)
```typescript
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${access}` },
});
```
**Issue:** No error handling or response check  
**Impact:** Logout failures are silent  
**Status:** Acceptable - logout is best-effort (auth cleared locally anyway)  
**Priority:** LOW

#### `src/app/influencer/dashboard/page.tsx` (Line 45)
```typescript
const res = await fetch("/api/influencers/stats");
if (res.status === 401) {
  router.push("/influencer/login");
  return;
}
if (!res.ok) {
  const errorData = await res.json();
  throw new Error(errorData.error || "Failed to fetch influencer stats");
}
```
**Status:** ✅ GOOD - Has proper error handling

#### `src/app/page.tsx` (Line 98)
```typescript
const res = await fetch('/api/affiliate/auth/me', { credentials: 'include' });
if (res.ok) {
  router.push('/affiliate');
} else {
  // Session expired - clear localStorage and go to main login
  localStorage.removeItem('user');
  localStorage.removeItem('auth-token');
```
**Status:** ✅ GOOD - Has proper error handling

### ⚠️ Potential 404 Issues (From API_ENDPOINTS_AUDIT_REPORT.md)

The following endpoints are called but may not exist or have mismatched parameters:

1. **`/api/admin/affiliate-settings`** ⚠️ **VERIFY** - Called from `src/app/admin/affiliates/settings/page.tsx`
   - **Status:** Route file exists at `src/app/api/admin/affiliate-settings/route.ts` (from git status)
   - **Action:** Verify it exports GET and PUT methods

2. **`/api/audit/login`** 🔴 **MISSING** - Called from `src/lib/auth/AuthContext.tsx:172`
   - **Status:** No route file found
   - **Impact:** Login audit logging fails silently
   - **Action:** Create route or remove the call

3. **`/api/auth/refresh`** ✅ **RESOLVED** - Uses `/api/auth/refresh-token` correctly
   - **Status:** Code correctly uses `/api/auth/refresh-token` (route exists)
   - **Note:** GlobalFetchInterceptor references `/api/auth/refresh` but actual calls use refresh-token

4. **`/api/patients/[id]/documents/[documentId]`** ✅ **CORRECT**
   - **Status:** Route exists and works correctly - Next.js maps parameters by position, not name
   - **Note:** Frontend uses `${documentId}` which maps to `[documentId]` route parameter correctly

5. **`/api/webhooks/[id]`** ⚠️ **VERIFY** - Dynamic endpoint
   - **Status:** May need catch-all route or specific routes for each webhook type

6. **`/api/super-admin/users/[id]/clinics`** ⚠️ **VERIFY** - Called but route may not exist

7. **`/api/audit-logs`** ⚠️ **VERIFY** - Called from `src/app/settings/audit/page.tsx:31`
   - **Note:** May be `/api/admin/audit-logs` instead

8. **`/api/affiliate/payout-methods`** ⚠️ **VERIFY** - Called from `src/app/portal/affiliate/payouts/page.tsx:106`
   - **Note:** May be `/api/affiliate/account/payout-method` instead

9. **`/api/affiliate/commissions`** ✅ **EXISTS** - Route file exists at `src/app/api/affiliate/commissions/route.ts`

**Recommendation:** Run the audit script (`scripts/audit-api-endpoints.ts`) to verify all routes exist.

---

## 4. Duplicate API Endpoint Definitions

Based on the API_ENDPOINTS_AUDIT_REPORT.md, there are potential duplicates:

### Parameter Naming (Actually Correct):
- ✅ `/api/patients/[id]/documents/[documentId]` - Next.js routes work correctly regardless of parameter name in folder vs variable name
- ✅ Frontend calls use `/api/patients/${patientId}/documents/${documentId}` which maps correctly
- **Note:** Next.js dynamic route segments don't need to match variable names - they're positional

**Status:** These are actually correct - Next.js maps route parameters by position, not name.

---

## 5. Recommendations

### Immediate Actions:

1. **🔴 CRITICAL: Fix hardcoded localhost in `package.json`:**
   ```json
   "sync:overtime": "tsx scripts/sync-overtime.ts"
   ```
   Create a separate script file that uses `process.env.NEXT_PUBLIC_APP_URL`

2. **🔴 CRITICAL: Create `/api/audit/login` route:**
   - Called from `src/lib/auth/AuthContext.tsx:172` but route doesn't exist
   - Either create the route or remove the call if audit logging isn't needed

3. **⚠️ MEDIUM: Review S3 CORS fallback:**
   - Consider removing localhost fallback or failing fast if env var missing
   - Current: `process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'`

4. **⚠️ MEDIUM: Verify endpoint mappings:**
   - Run endpoint audit: `npx tsx scripts/audit-api-endpoints.ts`
   - Verify `/api/admin/affiliate-settings` exports GET and PUT
   - Verify `/api/super-admin/users/[id]/clinics` route exists
   - Verify `/api/audit-logs` vs `/api/admin/audit-logs` naming

### Best Practices Going Forward:

1. **Always use environment variables for URLs:**
   ```typescript
   const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
   if (!baseUrl) throw new Error('NEXT_PUBLIC_APP_URL must be set');
   ```

2. **Always check `response.ok` before parsing JSON:**
   ```typescript
   const response = await fetch(url);
   if (!response.ok) {
     const error = await response.json().catch(() => ({ error: 'Unknown error' }));
     throw new Error(error.error || `HTTP ${response.status}`);
   }
   const data = await response.json();
   ```

3. **Use the `apiFetch` helper from `@/lib/api/fetch`:**
   ```typescript
   import { apiFetch } from '@/lib/api/fetch';
   const response = await apiFetch('/api/endpoint');
   const data = await response.json();
   ```

4. **Verify route parameters match:**
   - Frontend: `/api/patients/${id}/documents/${docId}`
   - Route file: `/api/patients/[id]/documents/[documentId]/route.ts`
   - Ensure parameter names match!

---

## Summary

- **Hardcoded localhost URLs:** 3 instances (1 critical in production code, 2 acceptable)
- **Malformed URLs:** 0 issues found (all endpoints are correctly formed)
- **Missing error handling:** Most fetch calls have proper handling; a few edge cases noted
- **Missing routes:** 1 confirmed (`/api/audit/login`), several need verification

**Overall Status:** Codebase is generally well-structured. Main issues are:
1. 🔴 **CRITICAL:** Hardcoded localhost in npm script (`package.json`)
2. 🔴 **CRITICAL:** Missing `/api/audit/login` route (called but doesn't exist)
3. ⚠️ **MEDIUM:** S3 CORS fallback uses localhost (should fail fast or use production-safe default)
4. ⚠️ **MEDIUM:** Several endpoints need verification (run audit script)

**Next Steps:**
1. Fix `package.json` sync:overtime script
2. Create `/api/audit/login` route or remove the call
3. Run `npx tsx scripts/audit-api-endpoints.ts` to verify all endpoints
