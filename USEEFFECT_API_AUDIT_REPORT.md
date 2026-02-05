# useEffect API Endpoints Audit Report

**Date:** February 4, 2026  
**Scope:** All useEffect hooks that fetch data on component mount

## Executive Summary

Audited **8 components** with useEffect hooks that fetch data. Found:
- ✅ **6 components** with proper error handling and loading states
- ⚠️ **2 components** with issues (missing error state handling, potential broken endpoints)

---

## Detailed Findings

### ✅ **PASSING COMPONENTS**

#### 1. **WeightTracker** (`src/components/WeightTracker.tsx`)
- **Endpoint:** `/api/patient-progress/weight?patientId=${patientId}`
- **Status:** ✅ EXISTS (`src/app/api/patient-progress/weight/route.ts`)
- **Error Handling:** ✅ Excellent - try-catch with localStorage fallback
- **Loading State:** ⚠️ Has `isLoading` state but doesn't use it in useEffect
- **Notes:** Good fallback strategy for auth errors (401/403)

#### 2. **AffiliateAnalyticsPage** (`src/app/affiliate/(dashboard)/analytics/page.tsx`)
- **Endpoints:**
  - `/api/affiliate/trends` ✅ EXISTS
  - `/api/affiliate/summary` ✅ EXISTS
  - `/api/affiliate/dashboard` ✅ EXISTS
  - `/api/affiliate/ref-codes/stats` ✅ EXISTS (optional, wrapped in catch)
  - `/api/affiliate/traffic-sources` ✅ EXISTS (optional, wrapped in catch)
- **Error Handling:** ✅ Excellent - try-catch with error state
- **Loading State:** ✅ Properly managed
- **Notes:** Good use of Promise.all with optional endpoints

#### 3. **AffiliateDashboard** (`src/app/affiliate/(dashboard)/page.tsx`)
- **Endpoint:** `/api/affiliate/dashboard`
- **Status:** ✅ EXISTS (`src/app/api/affiliate/dashboard/route.ts`)
- **Error Handling:** ✅ Good - try-catch with error state
- **Loading State:** ✅ Properly managed
- **Notes:** Clean error handling with user-friendly messages

#### 4. **HomePage** (`src/app/page.tsx`)
- **Endpoints:**
  - `/api/affiliate/auth/me` ✅ EXISTS
  - `/api/patients` ✅ EXISTS
  - `/api/finance/metrics` ✅ EXISTS
  - `/api/orders` ✅ EXISTS
- **Error Handling:** ✅ Excellent - uses `apiFetch` wrapper with auto-retry
- **Loading State:** ✅ Properly managed
- **Notes:** Uses centralized API fetch utility with built-in error handling

#### 5. **PatientPortalDashboard** (`src/app/patient-portal/page.tsx`)
- **Endpoints:**
  - `/api/patient-progress/weight` ✅ EXISTS
  - `/api/patient-progress/medication-reminders` ✅ EXISTS
- **Error Handling:** ✅ Good - try-catch with demo data fallback
- **Loading State:** ⚠️ Not explicitly managed in useEffect
- **Notes:** Graceful degradation to demo data

#### 6. **PatientsPage** (`src/app/patients/page.tsx`)
- **Endpoints:**
  - `/api/patients` ✅ EXISTS
  - `/api/user/clinics` ✅ EXISTS
  - `/api/admin/clinics` ✅ EXISTS
  - `/api/clinic/list` ✅ EXISTS
  - `/api/clinics` ✅ EXISTS (fallback)
- **Error Handling:** ✅ Good - try-catch with error state
- **Loading State:** ✅ Properly managed
- **Notes:** Good fallback chain for clinic endpoints

#### 7. **PatientPrescriptionSummary** (`src/components/PatientPrescriptionSummary.tsx`)
- **Endpoint:** `/api/patients/${patientId}/tracking`
- **Status:** ✅ EXISTS (`src/app/api/patients/[id]/tracking/route.ts`)
- **Error Handling:** ✅ Excellent - handles 404 gracefully, shows empty state
- **Loading State:** ✅ Properly managed
- **Notes:** Good UX - treats 404 as empty state rather than error

#### 8. **ProvidersPage** (`src/app/providers/page.tsx`)
- **Endpoints:**
  - `/api/providers` ✅ EXISTS
  - `/api/clinics` ✅ EXISTS (fallback)
- **Error Handling:** ✅ Good - try-catch with error state
- **Loading State:** ✅ Properly managed
- **Notes:** Multiple fallback strategies for clinic endpoints

---

### ⚠️ **ISSUES FOUND**

#### 1. **WebhookMonitorPage** (`src/app/webhooks/monitor/page.tsx`)

**Problem:** Dynamic endpoint may not exist for all selected endpoints

**Code:**
```typescript
const fetchStats = async () => {
  try {
    const res = await fetch(`/api/webhooks/${selectedEndpoint}`);
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
    }
  } catch (error: any) {
    logger.error("Failed to fetch webhook stats:", error);
  } finally {
    setLoading(false);
  }
};
```

**Issues:**
1. ❌ **No dynamic route handler** - There's no `/api/webhooks/[endpoint]/route.ts` catch-all handler
2. ❌ **Missing error state** - Errors are logged but not displayed to user
3. ❌ **No handling for non-OK responses** - If `res.ok` is false, nothing happens
4. ⚠️ **Endpoint availability:**
   - `heyflow-intake-v2` ✅ Has GET handler
   - `heyflow-intake` ❌ **NO GET handler** (only POST)
   - `medlink-intake` ❌ **NO GET handler** (only POST)
   - `heyflow-test` ✅ Has GET handler
   - `heyflow-debug` ✅ Has GET handler

**Recommendations:**
1. Create a dynamic route handler at `/api/webhooks/[endpoint]/route.ts` that:
   - Checks if endpoint exists
   - Returns stats from webhookLogger
   - Handles missing endpoints gracefully
2. Add error state to display errors to users
3. Handle non-OK responses properly

**Fix:**
```typescript
const fetchStats = async () => {
  try {
    setLoading(true);
    const res = await fetch(`/api/webhooks/${selectedEndpoint}`);
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
      setError(null);
    } else {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      setError(errorData.error || `Failed to fetch stats: ${res.status}`);
      setStats(null);
    }
  } catch (error: any) {
    logger.error("Failed to fetch webhook stats:", error);
    setError('Network error: Failed to connect to server');
    setStats(null);
  } finally {
    setLoading(false);
  }
};
```

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Total Components Audited | 8 |
| Components with All Endpoints Existing | 7 |
| Components with Missing/Broken Endpoints | 1 |
| Components with Proper Error Handling | 7 |
| Components with Proper Loading States | 6 |
| Components Needing Improvements | 2 |

---

## Recommendations

### High Priority
1. **Fix WebhookMonitorPage** - Add dynamic route handler or verify all endpoints have GET handlers
2. **Add error state display** - Show errors to users, not just log them

### Medium Priority
1. **Standardize error handling** - Some components use different patterns
2. **Add loading states** - A few components don't show loading indicators during fetch

### Low Priority
1. **Consider using React Query** - Would simplify data fetching, caching, and error handling
2. **Add retry logic** - For network failures, consider automatic retries

---

## Endpoint Verification

### ✅ Verified Existing Endpoints
- `/api/patient-progress/weight`
- `/api/patient-progress/medication-reminders`
- `/api/affiliate/trends`
- `/api/affiliate/summary`
- `/api/affiliate/dashboard`
- `/api/affiliate/ref-codes/stats`
- `/api/affiliate/traffic-sources`
- `/api/affiliate/auth/me`
- `/api/patients`
- `/api/finance/metrics`
- `/api/orders`
- `/api/providers`
- `/api/clinics`
- `/api/user/clinics`
- `/api/admin/clinics`
- `/api/clinic/list`
- `/api/patients/[id]/tracking`

### ❌ Missing GET Handlers
- `/api/webhooks/heyflow-intake` - Only has POST handler, no GET for stats
- `/api/webhooks/medlink-intake` - Only has POST handler, no GET for stats

### ❌ Missing Endpoints
- `/api/webhooks/[endpoint]` (dynamic catch-all route)

---

## Conclusion

Overall, the codebase has **good error handling and loading state management**. The main issue is the **WebhookMonitorPage** which uses a dynamic endpoint pattern that may not work for all selected endpoints. All other components properly handle errors and loading states, with most endpoints verified to exist.

**Next Steps:**
1. **CRITICAL:** Create dynamic route handler for webhook stats OR add GET handlers to:
   - `/api/webhooks/heyflow-intake/route.ts`
   - `/api/webhooks/medlink-intake/route.ts`
2. Add error state display to WebhookMonitorPage
3. Handle 404 responses gracefully when endpoints don't have GET handlers
