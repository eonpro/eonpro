# Fetch Error Handling Audit Report

This report identifies problematic `fetch()` call patterns that may hide important failures.

## Summary

- **Silent error swallowing**: 20+ instances
- **Missing response.ok checks**: 15+ instances  
- **Missing try/catch blocks**: 10+ instances
- **Missing error handling**: 5+ instances

---

## 1. Silent Error Swallowing

### Pattern: `.catch(() => {})` or `.catch(() => null)`

These patterns silently swallow errors, making debugging difficult and hiding failures.

#### Client-Side Components

**src/app/influencer/dashboard/page.tsx:90**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors
- **Impact**: User won't know if logout failed

**src/components/layouts/PatientLayout.tsx:101**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/components/layouts/ProviderLayout.tsx:200**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/app/patient-portal/settings/page.tsx:150**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/app/portal/affiliate/layout.tsx:149**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/components/ConditionalHeader.tsx:54**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/app/patients/layout.tsx:87**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/app/orders/layout.tsx:34**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/app/intake-forms/layout.tsx:34**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/app/page.tsx:202**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

**src/components/layouts/AdminLayout.tsx:39**
```typescript
}).catch(() => {});
```
- **Issue**: Logout fetch silently swallows errors

#### Server-Side API Routes

**src/app/api/auth/reset-password/route.ts:176**
```typescript
}).catch(() => null);
```
- **Issue**: User update silently fails - password reset may appear successful but didn't actually update
- **Impact**: CRITICAL - User password may not be reset

**src/app/api/auth/reset-password/route.ts:188**
```typescript
}).catch(() => null);
```
- **Issue**: Audit log creation silently fails
- **Impact**: Missing audit trail for password reset

**src/app/api/auth/reset-password/route.ts:199**
```typescript
}).catch(() => null);
```
- **Issue**: Provider update silently fails
- **Impact**: Provider password reset may fail silently

**src/app/api/auth/reset-password/route.ts:208**
```typescript
}).catch(() => null);
```
- **Issue**: Influencer update silently fails
- **Impact**: Influencer password reset may fail silently

**src/app/api/auth/verify-otp/route.ts:57**
```typescript
}).catch(() => null);
```
- **Issue**: OTP lookup silently fails - may return null when OTP exists
- **Impact**: Users may be incorrectly rejected even with valid OTP

**src/app/api/auth/verify-otp/route.ts:71**
```typescript
}).catch(() => {});
```
- **Issue**: OTP update (marking as used) silently fails
- **Impact**: OTP may be reused if update fails

**src/app/affiliate/(dashboard)/analytics/page.tsx:259**
```typescript
}).catch(() => null), // Optional endpoint
```
- **Issue**: Ref code stats fetch silently fails
- **Impact**: Analytics data may be incomplete

**src/app/affiliate/(dashboard)/analytics/page.tsx:262**
```typescript
}).catch(() => null), // Optional endpoint
```
- **Issue**: Traffic sources fetch silently fails
- **Impact**: Analytics data may be incomplete

**src/app/api/admin/metrics/route.ts:33**
```typescript
getQueueStats().catch(() => null),
```
- **Issue**: Queue stats fetch silently fails
- **Impact**: Admin metrics may be incomplete

**src/app/api/maps/details/route.ts:34**
```typescript
const data = await res.json().catch(() => null);
```
- **Issue**: Map API response parsing silently fails
- **Impact**: Map details may be missing

**src/app/api/maps/details/route.ts:44**
```typescript
(await res.text().catch(() => null)) ??
```
- **Issue**: Map API error text parsing silently fails

**src/app/api/maps/autocomplete/route.ts:32**
```typescript
const data = await res.json().catch(() => null);
```
- **Issue**: Map autocomplete response parsing silently fails
- **Impact**: Autocomplete may fail silently

**src/app/api/maps/autocomplete/route.ts:42**
```typescript
(await res.text().catch(() => null)) ??
```
- **Issue**: Map autocomplete error text parsing silently fails

#### Test Scripts (Lower Priority)

Multiple instances in:
- `scripts/test-provider-clinic-api.ts` (8 instances)
- `scripts/test-provider-clinic.ts` (13 instances)
- `scripts/test-affiliate-tracking.ts` (4 instances)

---

## 2. Missing response.ok Checks

These calls parse JSON without checking if the response was successful first.

**src/app/admin/patients/new/page.tsx:220**
```typescript
const data = await response.json();

if (response.ok) {
```
- **Issue**: Parses JSON before checking response.ok
- **Impact**: May throw error if response is not JSON (e.g., HTML error page)

**src/app/super-admin/clinics/new/page.tsx:172**
```typescript
const data = await response.json();

if (response.ok) {
```
- **Issue**: Parses JSON before checking response.ok

**src/app/super-admin/clinics/[id]/page.tsx:243**
```typescript
const data = await response.json();
const clinicData = data.clinic;
```
- **Issue**: No response.ok check before parsing JSON
- **Impact**: May fail if API returns error

**src/app/super-admin/clinics/[id]/page.tsx:311**
```typescript
const data = await response.json();
setClinicUsers(data.users || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error without user knowing

**src/app/super-admin/clinics/[id]/page.tsx:334**
```typescript
const data = await response.json();

if (!response.ok) {
```
- **Issue**: Parses JSON before checking response.ok

**src/app/super-admin/clinics/[id]/page.tsx:375**
```typescript
const data = await response.json();

if (response.ok) {
```
- **Issue**: Parses JSON before checking response.ok

**src/app/super-admin/clinics/[id]/page.tsx:421**
```typescript
const data = await response.json();
alert(data.error || 'Failed to remove user');
```
- **Issue**: No response.ok check - always shows alert even on success
- **Impact**: User sees error message even when operation succeeds

**src/app/super-admin/clinics/[id]/page.tsx:462**
```typescript
const data = await response.json();

if (response.ok) {
```
- **Issue**: Parses JSON before checking response.ok

**src/app/super-admin/clinics/[id]/page.tsx:502**
```typescript
const data = await response.json();
if (response.ok) {
```
- **Issue**: Parses JSON before checking response.ok

**src/app/super-admin/clinics/[id]/page.tsx:541**
```typescript
const data = await response.json();
setInviteCodes(data.inviteCodes || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/app/super-admin/clinics/[id]/page.tsx:570**
```typescript
const data = await response.json();

if (response.ok) {
```
- **Issue**: Parses JSON before checking response.ok

**src/app/super-admin/clinics/[id]/page.tsx:603**
```typescript
const data = await response.json();
alert(data.error || 'Failed to update invite code');
```
- **Issue**: No response.ok check - always shows alert

**src/app/super-admin/clinics/[id]/page.tsx:626**
```typescript
const data = await response.json();
alert(data.error || 'Failed to delete invite code');
```
- **Issue**: No response.ok check - always shows alert

**src/app/super-admin/clinics/[id]/page.tsx:660**
```typescript
const data = await response.json();
setLifefileSettings({
```
- **Issue**: No response.ok check
- **Impact**: May set incorrect settings on error

**src/app/super-admin/clinics/[id]/page.tsx:702**
```typescript
const data = await response.json();
setLifefileMessage({ type: 'error', text: data.error || 'Failed to save settings' });
```
- **Issue**: No response.ok check - always shows error message

**src/app/super-admin/clinics/[id]/page.tsx:722**
```typescript
const data = await response.json();
if (data.success) {
```
- **Issue**: No response.ok check - relies on data.success flag

**src/app/super-admin/clinics/[id]/page.tsx:769**
```typescript
const data = await response.json();
alert(data.error || 'Failed to save clinic settings');
```
- **Issue**: No response.ok check - always shows alert

**src/app/super-admin/clinics/[id]/page.tsx:797**
```typescript
const data = await response.json();
alert(data.error || 'Failed to delete clinic');
```
- **Issue**: No response.ok check - always shows alert

**src/app/admin/intakes/page.tsx:109**
```typescript
const data = await response.json();
setPatients(data.patients || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/app/admin/layout.tsx:135**
```typescript
const data = await response.json();
setUserClinics(data.clinics || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/app/provider/layout.tsx:74**
```typescript
const data = await response.json();
setRxQueueCount(data.count || 0);
```
- **Issue**: No response.ok check
- **Impact**: May show incorrect queue count on error

**src/app/portal/affiliate/layout.tsx:102**
```typescript
const brandingData = await response.json();
setBranding(brandingData);
```
- **Issue**: No response.ok check
- **Impact**: May set incorrect branding on error

**src/app/settings/audit/page.tsx:38**
```typescript
const data = await response.json();
setLogs(data.logs || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/components/layouts/ProviderLayout.tsx:111**
```typescript
const data = await response.json();

// Update localStorage
```
- **Issue**: No response.ok check
- **Impact**: May update localStorage with invalid data

**src/app/tickets/new/page.tsx:119**
```typescript
const data = await response.json();
setUsers(data.users || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/app/tickets/new/page.tsx:140**
```typescript
const data = await response.json();
setPatients(data.patients || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/app/tickets/[id]/page.tsx:186**
```typescript
const data = await response.json();
setTicket(data.ticket);
```
- **Issue**: No response.ok check
- **Impact**: May set undefined ticket on error

**src/app/tickets/[id]/page.tsx:198**
```typescript
const data = await response.json();
setComments(data.comments);
```
- **Issue**: No response.ok check
- **Impact**: May set undefined comments on error

**src/app/tickets/[id]/page.tsx:210**
```typescript
const data = await response.json();
setActivities(data.activities);
```
- **Issue**: No response.ok check
- **Impact**: May set undefined activities on error

**src/app/admin/analytics/emails/page.tsx:103**
```typescript
const result = await response.json();
setData(result);
```
- **Issue**: No response.ok check
- **Impact**: May set incorrect data on error

**src/app/admin/affiliates/reports/page.tsx:108**
```typescript
setData(await response.json());
```
- **Issue**: No response.ok check
- **Impact**: May set incorrect data on error

**src/app/admin/affiliates/reports/page.tsx:147**
```typescript
setLeaderboardData(await response.json());
```
- **Issue**: No response.ok check
- **Impact**: May set incorrect data on error

**src/app/admin/affiliates/page.tsx:159**
```typescript
const data = await response.json();
throw new Error(data.error || 'Failed to create affiliate');
```
- **Issue**: No response.ok check - always throws error
- **Impact**: Throws error even on success

**src/hooks/useNotifications.ts:131**
```typescript
const data = await response.json();

setState(prev => ({
```
- **Issue**: No response.ok check
- **Impact**: May update state with invalid data

**src/hooks/useNotifications.ts:173**
```typescript
const data = await response.json();
setState(prev => ({ ...prev, unreadCount: data.count }));
```
- **Issue**: No response.ok check
- **Impact**: May set incorrect unread count

**src/hooks/useNotifications.ts:210**
```typescript
const data = await response.json();

// Update local state
```
- **Issue**: No response.ok check
- **Impact**: May update state incorrectly

**src/hooks/useNotifications.ts:247**
```typescript
const data = await response.json();

// Update local state
```
- **Issue**: No response.ok check
- **Impact**: May update state incorrectly

**src/hooks/useNotifications.ts:285**
```typescript
const data = await response.json();

// Update local state
```
- **Issue**: No response.ok check
- **Impact**: May update state incorrectly

**src/hooks/useNotifications.ts:324**
```typescript
const data = await response.json();

// Remove from local state
```
- **Issue**: No response.ok check
- **Impact**: May remove from state incorrectly

**src/app/super-admin/page.tsx:51**
```typescript
const data = await response.json();
setClinics(data.clinics || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/app/super-admin/clinics/page.tsx:64**
```typescript
const data = await response.json();
```
- **Issue**: No response.ok check
- **Impact**: May process error response as success

**src/app/provider/prescriptions/page.tsx:84**
```typescript
const data = await response.json();
setTotalOrders(data.total || data.count || 0);
```
- **Issue**: No response.ok check
- **Impact**: May show incorrect order count

**src/app/provider/consultations/page.tsx:108**
```typescript
const data = await response.json();
const mapped = (data.appointments || []).map((apt: any) => ({
```
- **Issue**: No response.ok check
- **Impact**: May map error response

**src/app/provider/patients/page.tsx:111**
```typescript
const data = await response.json();
// Map API response to component interface
```
- **Issue**: No response.ok check
- **Impact**: May map error response

**src/app/provider/patients/page.tsx:190**
```typescript
const data = await response.json();
const mapped = (data.patients || []).map((p: any) => ({
```
- **Issue**: No response.ok check
- **Impact**: May map error response

**src/app/admin/rx-queue/page.tsx:68**
```typescript
const data = await response.json();
setQueueItems(data.items || []);
```
- **Issue**: No response.ok check
- **Impact**: May set empty array on error

**src/app/admin/affiliates/applications/page.tsx:158**
```typescript
const data = await response.json();
setApplications(data.applications);
```
- **Issue**: No response.ok check
- **Impact**: May set undefined on error

**src/app/admin/affiliates/applications/page.tsx:178**
```typescript
const data = await response.json();
setPlans(data.plans.filter((p: CommissionPlan) => p.isActive));
```
- **Issue**: No response.ok check
- **Impact**: May filter undefined on error

**src/app/admin/affiliates/applications/page.tsx:196**
```typescript
const data = await response.json();
setSelectedApplication(data.application);
```
- **Issue**: No response.ok check
- **Impact**: May set undefined on error

**src/app/admin/affiliates/[id]/page.tsx:120**
```typescript
const data = await response.json();
setAffiliate(data);
```
- **Issue**: No response.ok check
- **Impact**: May set undefined on error

**src/app/admin/affiliates/commission-plans/page.tsx:122**
```typescript
const data = await response.json();
setPlans(data.plans);
```
- **Issue**: No response.ok check
- **Impact**: May set undefined on error

---

## 3. Missing Try/Catch Blocks

These fetch calls are not wrapped in try/catch, so errors will propagate unhandled.

**src/app/login/page.tsx:104**
```typescript
const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);
```
- **Issue**: No try/catch around fetch
- **Impact**: Unhandled promise rejection if network fails
- **Note**: Has catch at line 141, but only catches JSON parsing errors

**src/app/portal/affiliate/payouts/page.tsx:105-108**
```typescript
const [payoutsRes, methodsRes, taxRes, balanceRes] = await Promise.all([
  fetch('/api/affiliate/payouts', { headers: { 'Authorization': `Bearer ${token}` } }),
  fetch('/api/affiliate/account/payout-method', { headers: { 'Authorization': `Bearer ${token}` } }),
  fetch('/api/affiliate/tax-documents', { headers: { 'Authorization': `Bearer ${token}` } }),
  fetch('/api/affiliate/summary', { headers: { 'Authorization': `Bearer ${token}` } }),
]);
```
- **Issue**: Promise.all not wrapped in try/catch
- **Impact**: Unhandled rejection if any fetch fails
- **Note**: Has catch at line 130, but only catches after Promise.all resolves

**src/app/affiliate/(dashboard)/analytics/page.tsx:249-262**
```typescript
const [trendsRes, summaryRes, dashboardRes, refCodeStatsRes, trafficRes] = await Promise.all([
  fetch(`/api/affiliate/trends?from=${dateRange.from}&to=${dateRange.to}&granularity=day`, {
    credentials: 'include',
  }),
  fetch(`/api/affiliate/summary?from=${dateRange.from}&to=${dateRange.to}`, {
    credentials: 'include',
  }),
  fetch('/api/affiliate/dashboard', { credentials: 'include' }),
  fetch(`/api/affiliate/ref-codes/stats?from=${dateRange.from}&to=${dateRange.to}`, {
    credentials: 'include',
  }).catch(() => null), // Optional endpoint
  fetch(`/api/affiliate/traffic-sources?from=${dateRange.from}&to=${dateRange.to}`, {
    credentials: 'include',
  }).catch(() => null), // Optional endpoint
]);
```
- **Issue**: Promise.all not fully wrapped in try/catch
- **Impact**: If first 3 fetches fail, error not caught
- **Note**: Has catch at line 289, but may not catch all errors

**src/lib/auth/AuthContext.tsx:205**
```typescript
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access}`,
  },
});
```
- **Issue**: Fetch not awaited properly, no error handling
- **Impact**: Logout may fail silently
- **Note**: Has try/catch at line 200, but fetch errors may not be caught

---

## 4. Missing Error Handling

These fetch calls have no error handling at all.

**src/lib/api/fetch.ts:301**
```typescript
const response = await fetch(url, {
```
- **Issue**: No error handling for fetch call
- **Impact**: Network errors will propagate unhandled

**src/lib/queue/deadLetterQueue.ts:65**
```typescript
const response = await fetch(UPSTASH_REST_URL, {
```
- **Issue**: No error handling
- **Impact**: Queue operations may fail silently

**src/lib/queue/deadLetterQueue.ts:337**
```typescript
await fetch(slackWebhookUrl, {
```
- **Issue**: No error handling
- **Impact**: Slack notifications may fail silently

**src/app/api/stripe/webhook/route.ts:661**
```typescript
await fetch(alertWebhookUrl, {
```
- **Issue**: No error handling
- **Impact**: Alert webhooks may fail silently

---

## Recommendations

### 1. Replace Silent Error Swallowing

**Before:**
```typescript
await fetch('/api/auth/logout').catch(() => {});
```

**After:**
```typescript
try {
  await fetch('/api/auth/logout');
} catch (error) {
  logger.error('Logout failed', { error });
  // Still proceed with local cleanup
}
```

### 2. Always Check response.ok Before Parsing JSON

**Before:**
```typescript
const data = await response.json();
if (response.ok) {
  // use data
}
```

**After:**
```typescript
if (!response.ok) {
  const error = await response.json().catch(() => ({ error: 'Unknown error' }));
  throw new Error(error.error || `HTTP ${response.status}`);
}
const data = await response.json();
```

### 3. Wrap All Fetch Calls in Try/Catch

**Before:**
```typescript
const response = await fetch('/api/data');
const data = await response.json();
```

**After:**
```typescript
try {
  const response = await fetch('/api/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  // use data
} catch (error) {
  logger.error('Failed to fetch data', { error });
  // handle error appropriately
}
```

### 4. Use a Centralized Fetch Utility

Consider creating a wrapper function:

```typescript
async function safeFetch(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        error: `HTTP ${response.status}` 
      }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Fetch failed', { url, error });
    throw error;
  }
}
```

---

## Priority Fixes

### Critical (Fix Immediately)
1. **src/app/api/auth/reset-password/route.ts** - Password reset may fail silently
2. **src/app/api/auth/verify-otp/route.ts** - OTP verification may fail silently
3. **src/app/super-admin/clinics/[id]/page.tsx** - Multiple operations may fail silently

### High Priority
1. All logout calls with `.catch(() => {})`
2. All fetch calls without `response.ok` checks
3. Analytics endpoints with silent failures

### Medium Priority
1. Missing try/catch blocks
2. Test scripts (can be fixed later)

---

## Files Requiring Immediate Attention

1. `src/app/api/auth/reset-password/route.ts` - 4 instances
2. `src/app/api/auth/verify-otp/route.ts` - 2 instances
3. `src/app/super-admin/clinics/[id]/page.tsx` - 15+ instances
4. All layout files with logout calls - 10+ instances
5. `src/app/affiliate/(dashboard)/analytics/page.tsx` - 2 instances
6. `src/app/portal/affiliate/payouts/page.tsx` - Missing error handling
