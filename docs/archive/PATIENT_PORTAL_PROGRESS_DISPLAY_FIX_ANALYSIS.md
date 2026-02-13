# Senior Engineer Analysis: Patient Portal Progress Widgets Display Fix

**Date:** February 8, 2026  
**Scope:** Fix for progress entries (weight, water, exercise, sleep, nutrition) not displaying on the patient portal after save, while the same data appears correctly on the admin patient profile.

---

## 1. Executive Summary

| Aspect | Assessment |
|--------|------------|
| **Root cause** | Stale/cached GET responses on the portal + missing refetch after water/nutrition (and exercise) mutations. |
| **Fix approach** | Force uncached reads (`cache: 'no-store'`) for progress/dashboard GETs and call `fetchData()` after every progress mutation. |
| **Correctness** | Fix is correct and targeted; data flow and auth unchanged. |
| **Risks** | Low. Main tradeoff is more network requests and no HTTP cache benefit for portal GETs. |
| **Recommendations** | Unify WeightTracker on `portalFetch`, add tests, consider a small data layer (e.g. React Query) later. |

---

## 2. Scope of the Build

### 2.1 What Changed

| Area | Change |
|------|--------|
| **Progress page** (`src/app/patient-portal/progress/page.tsx`) | All tab GETs use `cache: 'no-store'` (via `opts` passed to `portalFetch`). After water, exercise, sleep, and nutrition POST success, handlers call `fetchData()`. Weight already had `onWeightSaved={fetchData}`. |
| **WeightTracker** (`src/components/WeightTracker.tsx`) | GET weight request uses `cache: 'no-store'`. (Component still uses raw `fetch` + `getAuthHeaders()`, not `portalFetch`.) |
| **Portal API client** (`src/lib/api/patient-portal-client.ts`) | Default for `portalFetch` is `cache: init?.cache ?? 'no-store'`, so every portal GET that goes through `portalFetch` is uncached unless the caller overrides. |

### 2.2 What Did Not Change

- **API routes** – No changes to `/api/patient-progress/*` (weight, water, exercise, sleep, nutrition). Auth, validation, and authorization are unchanged.
- **Admin/clinic side** – No changes to patient profile or `PatientProgressView`; they already showed data correctly.
- **Database or schemas** – No migrations or model changes.

---

## 3. Root Cause (Confirmed)

1. **Caching**  
   The portal’s GETs to the same progress APIs can be cached (browser or fetch layer). After a successful POST, a refetch (e.g. `fetchData()` for weight) could receive a cached response that did not include the new row. The UI then showed that stale list/summary. The clinic view either didn’t hit the same cache or got a fresh response in a different context.

2. **Missing refetch after mutation**  
   For water and nutrition we only did optimistic updates (`setTodayWater(prev => prev + amount)`, etc.) and did not call `fetchData()`. So:
   - The number updated once from local state.
   - Any later load (tab switch, re-mount, or manual refresh) relied on GET; if that GET was cached, the user saw old totals and it looked like “entries don’t display.”

Exercise was similar (optimistic only); the fix adds `fetchData()` after water, exercise, and nutrition for consistency and so server-backed totals stay in sync.

---

## 4. Correctness

### 4.1 Data Flow

- **Write path:** Portal POST → `withAuth` → `canAccessPatient` → Prisma create. Unchanged.
- **Read path:** Portal GET → same auth and `canAccessPatient` → same Prisma read. Only fetch options changed (`cache: 'no-store'`), so the same API returns the same payload; the client just no longer uses a cached copy.

### 4.2 Stale Closure

`fetchData` is a plain async function that reads `activeTab` and `patientId` from closure. When `WeightTracker` calls `onWeightSaved()` (i.e. `fetchData`) after a weight POST, we’re on the weight tab and `patientId` is set, so the refetch runs for weight with the correct params. No stale-closure bug identified.

### 4.3 Double Update (Optimistic + Refetch)

After water/exercise/nutrition we still do optimistic update and then call `fetchData()`. That can briefly show optimistic value then replace with server value. If the server is consistent, the final value is correct. No bug; optional improvement would be to avoid a visible “flicker” (e.g. only update from server when refetch completes).

### 4.4 Error Handling

- Progress page: `fetchData()` has a try/catch that sets `setError(...)` and logs. Mutation handlers use try/catch and `setSaving(false)` in `finally`. No silent swallows.
- If `fetchData()` fails after a successful POST, the user already saw success and optimistic state; they may still see the new value until the next full load. Acceptable; could add a small “Sync failed” hint later if desired.

---

## 5. Architecture & Consistency

### 5.1 Two Fetch Patterns on the Portal

- **Progress page** uses `portalFetch` (and now explicitly passes `cache: 'no-store'` in `opts`). All other portal pages that use `portalFetch` also get the default `cache: 'no-store'` from the client.
- **WeightTracker** uses raw `fetch` + `getAuthHeaders()` and `credentials: 'include'`, and now `cache: 'no-store'`. It does not use `portalFetch`.

**Assessment:** Behavior is correct, but the codebase has two ways to call the same APIs (portalFetch vs fetch+getAuthHeaders). WeightTracker is used on the progress page (portal) and possibly elsewhere (e.g. admin). Unifying WeightTracker on `portalFetch` when running in a portal context would improve consistency and ensure it always gets the same defaults (auth + no-store). If WeightTracker is also used in admin, we’d need to keep a path that uses admin auth or pass a fetch wrapper.

### 5.2 Global Default in `portalFetch`

Setting `cache: init?.cache ?? 'no-store'` in `portalFetch` affects **all** call sites: progress, dashboard, photos, documents, chat, appointments, billing, etc. So every GET through `portalFetch` is now uncached by default.

- **Upside:** No stale data anywhere on the portal for any feature using `portalFetch`.
- **Tradeoff:** No HTTP cache benefit for those GETs (more requests, no cache hits). For a patient portal with relatively low traffic per user, this is an acceptable tradeoff for correctness.

---

## 6. Security & Compliance

- **Auth:** No change. All progress APIs remain behind `withAuth`; `canAccessPatient` still restricts patients to their own `patientId`. Portal requests continue to send the same auth (via `portalFetch` or `getAuthHeaders()`).
- **PHI:** Progress data (weight, water, exercise, sleep, nutrition) is health-related; it is already scoped to the authenticated user/patient. No new PHI exposure; no change to logging (still no PHI in logs).
- **Tenant isolation:** Unchanged; progress tables are keyed by `patientId` and access is enforced in the API. No cross-tenant risk introduced.

---

## 7. Performance

- **Before:** Some GETs could be served from cache, reducing server load and latency for repeat views.
- **After:** Every progress (and all other portal) GET through `portalFetch` is `no-store`, so each tab load or refetch hits the server. WeightTracker’s GET is also `no-store`.

**Impact:** For the progress page, we have a few GETs per tab (one per resource type). After a mutation we trigger one extra GET (fetchData). This is a small number of requests per user action. For the rest of the portal, any screen that uses `portalFetch` for GETs will now always hit the server. Given the use case (patient portal, authenticated, per-user data), this is reasonable. If we later see high traffic or slow APIs, we can reintroduce caching in a controlled way (e.g. short revalidate, or cache per route with explicit invalidation after mutations).

---

## 8. Testing & Observability

- **No new unit or integration tests** were added for this fix. Regression risk is low (same APIs, same auth), but tests would lock in the intended behavior:
  - Progress page: after “log water” (or weight, etc.), the corresponding GET is invoked and UI state is updated from the response.
  - Optional: assert that progress GETs are made with `cache: 'no-store'` (e.g. via a small fetch wrapper in tests).
- **Observability:** No new metrics or logs. If “entries not showing” reports continue, we could add a short log or metric when `fetchData()` runs after a mutation and when the GET returns (e.g. count of items), without logging PHI.

---

## 9. Risks and Edge Cases

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Refetch returns an error and overwrites good optimistic state | Low | We could only call `setWeightLogs`/set totals when `response.ok`; we already do. If GET fails, we don’t overwrite; we might set `error` in fetchData. So optimistic state can remain until next successful fetch. |
| fetchData called before POST response is fully persisted | Very low | We call `fetchData()` only after `response.ok` on the POST, so the server has already persisted. |
| Heavy use of no-store on entire portal | Low | More server load and latency; acceptable for current scale. Can be revisited if traffic grows. |
| WeightTracker 401/403 fallback to localStorage | Existing | On auth failure WeightTracker still falls back to localStorage cache. That’s a separate behavior (offline/degraded UX); not introduced by this fix. |

---

## 10. Recommendations

1. **Unify WeightTracker with portal fetch when in portal**  
   Use `portalFetch` inside WeightTracker when it’s used in the patient portal (e.g. via a prop or context), so auth and cache behavior match the rest of the portal and we don’t maintain two patterns.

2. **Add minimal tests**  
   - One or two tests that, after a successful progress POST (e.g. water or weight), the progress page’s refetch (fetchData) is called and state is updated from the GET response.
   - Optional: test that progress GETs use `no-store` when using the portal client.

3. **Document the cache decision**  
   Add a short comment in `patient-portal-client.ts` that the default `no-store` is intentional so that refetches after mutations always see fresh data, and that callers can override if needed.

4. **Optional: data layer**  
   Longer term, consider a small data layer (e.g. React Query or SWR) for progress and dashboard: it would centralize cache policy, refetch-on-mutation, and loading/error state, and make it easier to add invalidation rules instead of “refetch everything” after each mutation.

---

## 11. Conclusion

The build correctly addresses the issue: entries not displaying on the patient portal were due to cached GETs and missing refetch after some mutations. Forcing `no-store` for progress (and all portal GETs via `portalFetch`) and calling `fetchData()` after every progress mutation ensures the UI shows up-to-date data. The change is scoped, preserves auth and compliance, and carries low risk. The main follow-ups are consistency (WeightTracker + portalFetch), tests, and optional documentation and data-layer improvements.
