# Weight Tracker: Why Entries Don’t Display After Refresh or Navigate Away

**Date:** February 2026  
**Issue:** Patient logs weight on the Health Tracking tab; after refresh or navigating away and back, the weight entries do not display (exercise/sleep may work; weight and water do not).

This document lists **every plausible cause** so we can verify or fix them systematically.

---

## 1. End-to-end flow (reference)

1. **Submit:** Patient enters weight → WeightTracker `handleWeightSubmit()` → `POST /api/patient-progress/weight` (body: `patientId`, `weight`, `unit`, `recordedAt`) → API validates, checks auth, writes to `PatientWeightLog` → 201 + created row.
2. **Display (same session):** WeightTracker appends to local state; `onWeightSaved()` → progress page `fetchData()` → `GET /api/patient-progress/weight?patientId=X` → `setWeightLogs(logs)` and WeightTracker also has its own GET in `loadWeightData()`.
3. **Display (after refresh or navigate back):** Progress page mounts → effect 1: read `localStorage.user` (and maybe `GET /api/auth/me`) → set `patientId`. Effect 2: when `patientId` and `activeTab` are set, call `fetchData()`. For weight tab, `fetchData()` does GET weight and `setWeightLogs(logs)`. WeightTracker mounts with `patientId` prop and runs `loadWeightData()` (GET weight, `setWeightData(formattedData)`).

Anything that breaks in the chain below can cause “entries don’t display” after refresh/navigate.

---

## 2. Possible causes (full list)

### A. Data never gets saved (POST path)

| # | Cause | How it could happen | How to verify |
|---|--------|----------------------|----------------|
| A1 | **POST returns 401** | Token missing or invalid: `portalFetch` uses `getAuthHeaders()` (localStorage). If token not in any of the keys (`auth-token`, `patient-token`, …), no `Authorization` header → API returns 401. | Check Network: POST status 401; check localStorage for `auth-token` / `patient-token` on submit. |
| A2 | **POST returns 403** | `canAccessPatient(user, patientId)` fails: e.g. JWT has different `patientId` than body, or role not allowed. | Check Network: POST 403; compare JWT payload `patientId` vs body `patientId`. |
| A3 | **POST returns 400** | Validation fails (e.g. invalid `patientId`, weight out of range, bad `recordedAt`). | Check Network: POST 400 and response body `details`. |
| A4 | **POST returns 500** | DB or server error; row not created. | Check Network: POST 500; check server logs. |
| A5 | **POST never sent** | Client error before fetch (e.g. `patientId` undefined, JS error), or network failure. | Console errors; Network tab: no POST or failed. |
| A6 | **Wrong patientId in POST body** | Progress page passes `patientId` to WeightTracker; if progress page has `patientId === null`, WeightTracker would send `undefined` (omitted or NaN). API might reject or save to wrong place. | Log `patientId` in submit handler; ensure it’s the logged-in patient’s ID. |

### B. Data saved but GET doesn’t return it (read path)

| # | Cause | How it could happen | How to verify |
|---|--------|----------------------|----------------|
| B1 | **GET returns 401** | Same as A1: no/invalid token on refresh. Then we never call `setWeightLogs` / `setWeightData` (only on `response.ok`). | Check Network: GET weight 401 after refresh. |
| B2 | **GET returns 403** | `canAccessPatient` fails on GET (e.g. query `patientId` doesn’t match JWT `patientId`). | Check Network: GET 403; compare query `patientId` vs JWT. |
| B3 | **GET returns 400** | Missing or invalid `patientId` in query. API uses `nextUrl.searchParams` and `request.url`; on some runs query can be missing. If we send no `patientId` and JWT has it, API falls back to `user.patientId` (weight route line 293–294). So 400 would be if `patientId` is missing and user is not a patient or has no `patientId`. | Check Network: GET 400; ensure URL has `?patientId=X`. |
| B4 | **GET returns 500** | Server/DB error; we don’t update state. | Check Network: GET 500; server logs. |
| B5 | **Wrong patientId in GET query** | If progress page or WeightTracker sends a different `patientId` than the one whose data was written (e.g. stale state, wrong user object), API returns that patient’s list (possibly empty). | Log query param and JWT `patientId`; ensure they match and match POST body. |
| B6 | **Cached GET response** | Browser or proxy returns cached 200 with old/empty body. We added `cache: 'no-store'`; if something overrides it or another path doesn’t use it, cache could still happen. | Check Network: response headers `Cache-Control`; disable cache and retry. |
| B7 | **API returns different shape** | Client expects `result.data` (array). If API returned something else (e.g. `result.logs`), we’d use `[]` and show nothing. | Log `result` in client; confirm API returns `{ data: [...], meta }`. |

### C. GET returns data but UI doesn’t show it (client state / rendering)

| # | Cause | How it could happen | How to verify |
|---|--------|----------------------|----------------|
| C1 | **patientId is null on load** | Progress page: `patientId` comes from `localStorage.user.patientId` or `/api/auth/me`. If `user` is missing or has no `patientId`, and `/api/auth/me` fails or doesn’t return `patientId`, we set `patientId = null`. Then: (1) `fetchData()` is only called when `patientId` is truthy, so we never GET weight for the page’s “Quick Stats”; (2) WeightTracker receives `patientId={undefined}` and in `loadWeightData()` goes to the `else` branch and only reads `localStorage.weightData_default` (no API call). So **no weight is ever fetched** after refresh. | On progress page load, log `patientId` after first effect; check `localStorage.user` and `/api/auth/me` response. |
| C2 | **Stale closure** | `fetchData` or `loadWeightData` uses an old `patientId` or `activeTab`. Unlikely if deps are correct, but worth ensuring. | Log `patientId` / `activeTab` inside the fetch. |
| C3 | **Weight only fetched when activeTab === 'weight'** | Progress page `fetchData()` only runs GET weight when `activeTab === 'weight'`. So when user lands on progress with default tab weight, we fetch. When they switch to water and back to weight, we fetch again. So this is correct. If somehow `activeTab` weren’t 'weight' when we expect (e.g. initial state or hydration), we’d skip weight. | Log `activeTab` when `fetchData` runs. |
| C4 | **Two sources of truth** | Progress page has `weightLogs` (from `fetchData`); WeightTracker has `weightData` (from `loadWeightData`). Quick Stats use `weightLogs`; chart/entries in WeightTracker use `weightData`. If one GET fails and the other succeeds, one part of the UI shows data and the other doesn’t. | Check both Network requests (from page and from WeightTracker); see if one 401/403/empty. |
| C5 | **Response not parsed correctly** | e.g. `safeParseJson(response)` returns null or wrong shape; we end up with `logs = []`. | Log parsed result and final `logs` / `formattedData`. |
| C6 | **State reset by parent** | Unlikely, but if progress page re-mounted or state were reset (e.g. key change), we’d lose `weightLogs`. | N/A. |

### D. Auth / token / session

| # | Cause | How it could happen | How to verify |
|---|--------|----------------------|----------------|
| D1 | **Token not in localStorage** | Patient logs in; server may set cookie only. Login page does `localStorage.setItem('auth-token', data.token)` and `localStorage.setItem('user', ...)`. If login response didn’t include token or client didn’t run that path, token could be only in cookie. `getAuthHeaders()` only reads localStorage; if token is only in cookie, we’d send no `Authorization` header. API would still get token from cookie (extractToken), so **API could be fine**; but if cookie weren’t sent (e.g. cross-origin, SameSite), we’d get 401. | Check: after login, is `auth-token` or `patient-token` in localStorage? On request, is `Authorization: Bearer ...` present? |
| D2 | **Token expired** | After some time or after refresh, token is expired. GET/POST return 401. We don’t update state. | Check token `exp`; check for 401 on weight GET/POST. |
| D3 | **JWT missing patientId** | Login builds `tokenPayload.patientId` from user or from “patient by email” fallback. If both are missing, JWT has no `patientId`. Then GET with `?patientId=X` might still work if we send the right X from somewhere; but if we rely on API to infer patientId from JWT when query is missing, API would get null and return 400 or empty. | Decode JWT; confirm `patientId` is present for patient users. |
| D4 | **user object in localStorage missing patientId** | Login returns `user: { ..., patientId: tokenPayload.patientId }`. If that was undefined, we’d store `user.patientId === undefined`. Progress page would then try `/api/auth/me` to get patientId. If that also fails, we’d keep `patientId = null` → see C1. | After login, check `localStorage.user` has `patientId`. |

### E. Environment / deployment

| # | Cause | How it could happen | How to verify |
|---|--------|----------------------|----------------|
| E1 | **Different origin / subdomain** | If patient portal is on e.g. `portal.clinic.com` and API on `api.clinic.com`, cookies might not be sent (SameSite). localStorage is per-origin; so token would be on portal origin. If we do same-origin API (e.g. relative `/api/...`), no issue. | Confirm all requests are same-origin. |
| E2 | **Middleware or proxy stripping headers** | Something removes `Authorization` or query string. | Inspect request in Network. |
| E3 | **Serverless cold start / request URL** | Weight GET uses `request.nextUrl.searchParams` and `request.url`. On some serverless runs, query can be missing. API has fallback for patient: `if (patientIdParam == null && user.role === 'patient' && user.patientId != null) patientIdParam = String(user.patientId)`. So if we **don’t** send `?patientId=`, API uses JWT patientId. If we do send it, we must send the right one. | Log on server: `patientIdParam` and `user.patientId` for GET weight. |

---

## 3. Most likely culprits (prioritized)

Given “we fixed it multiple times but it still doesn’t work” and “exercise/sleep work, weight/water don’t”:

1. **C1 – patientId null on load**  
   If after refresh `localStorage.user` is missing or has no `patientId`, and `/api/auth/me` doesn’t return it (or isn’t called / fails), we never fetch weight. WeightTracker then only reads `weightData_default` from localStorage (empty). **Fix:** Ensure we always resolve `patientId` (e.g. always call `/api/auth/me` when in patient portal and persist `patientId` in state and optionally in localStorage).

2. **D4 – user.patientId missing at login**  
   If login response doesn’t include `patientId` for this user (e.g. legacy path, or patient-by-email fallback failed), we store `user` without `patientId`. Then C1 applies. **Fix:** Ensure login always returns `patientId` for patient role; ensure client stores it.

3. **B1 / A1 – 401 on GET or POST**  
   If token is missing or expired, all weight requests fail. Exercise/sleep might appear to work if they were loaded before token expired or from a different code path. **Fix:** Ensure token is sent (and refresh flow if expired); show a clear “session expired” and re-auth when we get 401 on weight.

4. **C4 – One of the two GETs fails**  
   Progress page and WeightTracker each do a GET. If one gets 401 and the other 200 (e.g. timing), one part of the UI would be empty. **Fix:** Single source of truth for weight on this page (e.g. only progress page fetches and passes data to WeightTracker), or ensure both use the same auth and handle 401 the same way.

5. **B5 / B3 – Wrong or missing patientId in GET**  
   If we send wrong or no `patientId`, API might return another patient’s data or 400/403. **Fix:** Log and assert `patientId` in request and JWT; ensure URL always has `?patientId=X` when we have X.

---

## 4. Recommended next steps (diagnostics then fix)

1. **Add minimal client-side diagnostics (temporary)**  
   - In progress page: log after first effect: `patientId`, and whether `localStorage.user` exists and has `patientId`.  
   - In WeightTracker: log before GET: `patientId`; after response: `response.status`, and length of parsed logs.  
   - In both: on GET/POST weight, log `response.status` and, if !ok, response body.  
   This will tell us whether the failure is: no patientId (C1/D4), 401 (B1/A1), or wrong/empty data (B5/B7/C5).

2. **Ensure patientId is always resolved**  
   - On progress page load: if `localStorage.user` is missing or has no `patientId`, call `/api/auth/me` and set state (and optionally update localStorage) so that `patientId` is set before we render the weight tab.  
   - Consider loading state until we have either `patientId` or a definitive “not a patient” so we don’t run with `patientId === null` and skip the weight fetch.

3. **Single source of truth for weight on progress page**  
   - Have only the progress page fetch weight (when `activeTab === 'weight'` and `patientId` is set). Pass `weightLogs` (or equivalent) into WeightTracker as a prop so WeightTracker doesn’t do its own GET. That removes the “two GETs” inconsistency and ensures we use the same auth and same data for stats and chart.

4. **Verify login and /api/auth/me**  
   - Ensure login response always includes `user.patientId` for patient users (and that it’s stored in localStorage).  
   - Ensure GET `/api/auth/me` returns `user.patientId` when the user is a patient so the progress page can backfill it.

5. **Handle 401 explicitly**  
   - On 401 from weight GET or POST, show “Session expired” (or similar) and redirect to login or trigger refresh, instead of silently showing empty.

Once diagnostics confirm which of the causes above is happening, apply the corresponding fix from this document and re-test after refresh and after navigating away and back.
