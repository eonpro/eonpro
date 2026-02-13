# Provider Prescription Fix – Root Cause and Resolution

**Date:** Feb 2025  
**Issue:** "Provider Profile Issue: Failed to load provider information" in PrescriptionForm  
**Status:** RESOLVED

---

## Root Cause

The error came from the PrescriptionForm `loadProviderData()` generic catch block when an exception occurred before any explicit error handling. This hid the real failure.

Contributing factors:

1. **Multi-endpoint fallback chain** – Sequential calls to `/api/providers/me` → `/api/provider/settings` → `/api/providers` increased failure points.
2. **Client-side role guessing** – Role came from `getStoredUser()` (localStorage). If localStorage was empty, it defaulted to `'admin'`, skipping provider-specific fallbacks.
3. **Unsafe JSON parsing** – `res.json()` was used without checking content-type. Non-JSON responses (e.g. HTML error pages) caused unhandled parse errors.
4. **Generic error handling** – The catch block reported "Failed to load provider information" instead of the underlying error.
5. **Token dependency** – Some logic depended on localStorage tokens. Cookie-based auth was not used consistently.

---

## Fix Summary

### 1. Safe JSON Parsing (`src/lib/safe-json.ts`)

- `safeJson<T>(response)` helper:
  - Requires `Content-Type` including `application/json`
  - Throws `SafeJsonParseError` with `status`, `contentType`, `bodyPreview`
  - Avoids silent JSON parse failures

### 2. Consolidated Endpoint (`GET /api/provider/self`)

- Single endpoint for provider resolution (no client fallback chains)
- Provider role: resolves provider from session; returns `{ provider, role, isComplete, missing }` or structured error
- Admin role: returns `{ providers, role }` for clinic selection
- Error codes: `PROVIDER_NOT_LINKED`, `PROVIDER_PROFILE_MISSING`, `AUTH_INVALID`
- Role derived from session (JWT), not localStorage

### 3. PrescriptionForm Refactor (`src/components/PrescriptionForm.tsx`)

- One API call to `/api/provider/self` instead of multiple endpoints
- Uses `apiFetch` with `credentials: 'include'` (cookie auth for same-origin)
- Uses `safeJson` for parsing
- Removes `getStoredUser()` and localStorage-based role logic
- Replaces generic catch with specific handling:
  - Auth errors → "Session expired. Please log in again."
  - `SafeJsonParseError` → "Invalid response from server (status X)..."
  - Network errors → "Network error. Please check your connection..."
- Optional trace logging via `localStorage.setItem('PROVIDER_DEBUG','true')`

### 4. Trace Logging

- Server: `PROVIDER_DEBUG=true` enables logging in `/api/provider/self` (User.providerId, lookup strategies, etc.)
- Client: `PROVIDER_DEBUG` in localStorage enables PrescriptionForm trace logging (URL, status, parsed shape)

---

## Confirmation Checklist

- [x] No silent JSON parse crashes – `safeJson` throws with diagnostic info
- [x] No role inference from localStorage – Role from server response
- [x] Auth uses cookie-based flow – `apiFetch` sends `credentials: 'include'` for same-origin
- [x] Single round-trip – One call to `/api/provider/self`
- [x] Structured errors – `PROVIDER_NOT_LINKED` etc.
- [x] No generic catch – Specific handling per error type

---

## Before/After

### Before

```typescript
// Multi-endpoint, localStorage role, unsafe json
const role = (storedUser?.role)?.toLowerCase() || 'admin';  // Guessing!
let meRes = await fetch('/api/providers/me', { headers, credentials: 'include' });
meData = await meRes.json();  // Can throw silently
if (!meRes.ok && meRes.status === 404 && role === 'provider') {
  const settingsRes = await fetch('/api/provider/settings', ...);
  settingsData = await settingsRes.json();  // Can throw
}
// ... fallback to /api/providers
} catch (err) {
  setProviderLoadError('Failed to load provider information');  // Generic!
}
```

### After

```typescript
// Single call, cookie auth, safe json
const res = await apiFetch(url, { cache: 'no-store' });
const data = await safeJson(res);
if ('provider' in data && data.provider) { /* provider */ }
else if ('providers' in data && data.providers?.length) { /* admin */ }
} catch (err) {
  if (err instanceof SafeJsonParseError) { /* specific */ }
  else if (err instanceof Error) { /* message */ }
}
```

---

## Migration Notes

- `/api/providers/me` remains for backward compatibility; PrescriptionForm now uses `/api/provider/self`
- No changes required to login or cookie setup; login already sets `provider-token` cookie
