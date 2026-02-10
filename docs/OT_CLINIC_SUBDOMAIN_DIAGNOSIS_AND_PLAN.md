# ot.eonpro.io — Full Diagnosis and Fix Plan

**Problem:** Changes are not being applied specifically for the OT clinic (ot.eonpro.io). Other clinics may work; only OT is affected.

This document traces every relevant code path and lists a concrete, prioritized fix plan.

---

## 1. Request flow (every line that matters)

### 1.1 Middleware order (root `middleware.ts`)

- **Patient portal** unauthenticated → redirect to `/login`.
- **Security headers** added to responses.
- **Clinic middleware** runs when `NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true'`.
- **CORS** applied for API routes; `*.eonpro.io` is allowed.

So for `ot.eonpro.io`, clinic middleware runs.

### 1.2 Clinic middleware (`src/middleware/clinic.ts`)

**PUBLIC_ROUTES** (no clinic required): login, refresh-token, send-otp, verify-otp, reset-password, webhooks, clinic/resolve, health, ready, monitoring, assets, clinic/list, login, register, clinic-select, affiliate, tickets.

**Resolution order in `resolveClinic()`:**

1. **Cookie `selected-clinic`** — if present and valid number → use it.
2. **JWT** (Authorization or auth-token cookie) — if valid and has `clinicId` → use it.
3. **Header `x-clinic-id`** — if present and valid → use it.
4. **Subdomain** (e.g. `ot` from `ot.eonpro.io`) — **returns `null`** because Edge cannot do DB; subdomain is not mapped to clinicId here.
5. **`DEFAULT_CLINIC_ID`** env — if set → use it.

So on ot.eonpro.io **before login**: no cookie, no JWT → clinicId is `null` (unless DEFAULT_CLINIC_ID is set for OT, which would be wrong for multi-tenant). Any **non-public** API returns **400 "No clinic context"**.

After login, JWT has `clinicId`. So **authenticated** requests get clinicId from JWT (step 2). Cookie is **not** set by login today, so step 1 is only used if the user previously switched clinic (e.g. in admin).

**Critical:** When subdomain is present, middleware still returns `null` and does **not** set `x-clinic-id` from subdomain. So for unauthenticated non-public routes, OT gets 400. For authenticated routes, clinic comes from JWT only.

### 1.3 Login page (`src/app/login/page.tsx`)

- **On load:** `fetch(/api/clinic/resolve?domain=${window.location.hostname})`.  
  - For `ot.eonpro.io`, domain is `ot.eonpro.io`.  
  - Resolve is PUBLIC → no 400.  
- **Response:** If clinic found, sets `resolvedClinicId`, `branding`, title, favicon.
- **Password login:** `fetch('/api/auth/login', { body: { ..., clinicId: clinicId || selectedClinicId || resolvedClinicId } })`.  
  - So when on ot.eonpro.io, `resolvedClinicId` is sent as `clinicId` (if no manual selection).

So the **client** does send the correct clinic (OT) when logging in on ot.eonpro.io, **if** resolve returned OT.

### 1.4 Resolve API (`src/app/api/clinic/resolve/route.ts`)

- **Main app domains** (app.eonpro.io, localhost) → return default EONPRO payload, no DB.
- **Other domains:** `resolveClinicFromDomain(domain)`:
  - **Custom domain** match → clinic by `customDomain`.
  - **eonpro.io:** split hostname, take first part (e.g. `ot`), skip list `['www','app','api','admin','staging']`, then:
    - `basePrisma.clinic.findFirst({ where: { subdomain: { equals: subdomain, mode: 'insensitive' }, status: 'ACTIVE' } })`.
- If **no clinic** found for `*.eonpro.io` → return **default EONPRO** (200), so login page still works but with generic branding.
- Responses now send `Cache-Control: no-store`.

So for OT to be “applied” on ot.eonpro.io:

- DB must have a clinic with **subdomain exactly `ot`** (case-insensitive) and **status `ACTIVE`**.
- If not, resolve returns default and login page never gets OT branding or OT `clinicId` to send to login.

### 1.5 Login API (`src/app/api/auth/login/route.ts`)

- Body: `email`, `password`, `role`, **`clinicId: selectedClinicId`** (optional).
- **activeClinicId** is chosen in this order:
  1. If **selectedClinicId** (from body) is present and in user’s **clinics** list → use it.
  2. Else **subdomain from Host**: `extractSubdomain(req.headers.get('host'))` → e.g. `ot`, then DB `clinic.findFirst({ subdomain, status: 'ACTIVE' })` → **subdomainClinic**.
  3. If user has access to **subdomainClinic** (in clinics or `user.clinicId === subdomainClinic.id`) → **activeClinicId = subdomainClinic.id**.
  4. Else if on wrong clinic domain → **403 WRONG_CLINIC_DOMAIN** with correct login URL.
  5. Else → **user.clinicId** or **clinics[0].id**.

JWT is built with **clinicId: activeClinicId**. So if the user logs in on ot.eonpro.io and either sends OT as `clinicId` or Host is `ot.eonpro.io` and user has access to OT, the JWT will have OT’s id.

**Gap:** Login response does **not** set **`selected-clinic`** cookie. It only sets `auth-token` and `${role}-token`. So the next time middleware runs, it gets clinicId from JWT (cookie still empty). That works **as long as** the JWT was issued on ot.eonpro.io. If the user had logged in on app.eonpro.io or wellmedr and then opens ot.eonpro.io **without re-login**, the JWT still has the other clinic’s id, so **all API routes use the wrong clinic** (see below).

### 1.6 Auth middleware (`src/lib/auth/middleware.ts`)

- Verifies JWT, builds **user** (including **user.clinicId** from JWT).
- **effectiveClinicId** = `user.clinicId` (for non–super_admin).
- **setClinicContext(effectiveClinicId)** and **runWithClinicContext(effectiveClinicId, handler)**.
- Sets **x-clinic-id** on request from **user.clinicId** (not from clinic middleware).

So **every protected API uses clinic from the JWT only**. The clinic middleware’s `x-clinic-id` (from cookie/JWT in Edge) is overwritten by auth middleware with JWT’s clinicId. If the user’s session was created on another domain, they will see the other clinic’s data on ot.eonpro.io.

### 1.7 Clinic “current” and UI (`src/app/api/clinic/current/route.ts`, `lib/clinic/context.tsx`)

- **GET /api/clinic/current** uses **user.clinicId** (from JWT) and returns that clinic.
- **ClinicProvider** fetches `/api/clinic/current` and **switchClinic** sets **selected-clinic** cookie and calls `/api/clinic/switch`.

So the “current” clinic in the app is always the one in the JWT. There is **no** automatic “use subdomain’s clinic when on ot.eonpro.io” once the user is logged in with a different clinic.

---

## 2. Root causes (why “changes” don’t apply only for OT)

Possible causes, in order of likelihood:

### A. Resolve returns default (no OT clinic in DB or not ACTIVE)

- **Symptom:** Login page on ot.eonpro.io shows EONPRO branding and may send no or wrong clinicId.
- **Cause:** No row with `subdomain = 'ot'` (or `'OT'`) and `status = 'ACTIVE'` in the **same DB** the app uses (e.g. production).
- **Check:** `GET https://ot.eonpro.io/api/clinic/resolve?domain=ot.eonpro.io` → if `clinicId` is null and `isMainApp: true`, resolve is not finding OT.

### B. Session from another domain (JWT has wrong clinic)

- **Symptom:** User previously logged in on app.eonpro.io or wellmedr.eonpro.io; opens ot.eonpro.io without logging in again; sees other clinic’s data/settings.
- **Cause:** JWT carries the clinic from the first login; auth middleware uses only JWT for clinic context; there is no subdomain-based override.
- **Check:** On ot.eonpro.io, after “login”, check JWT payload or `/api/clinic/current` → if clinicId is not OT, this is the cause.

### C. Login response never sets `selected-clinic` cookie

- **Symptom:** Cookie and JWT can get out of sync; any logic that prefers cookie over JWT (or that only reads cookie) will not see OT after login on ot.eonpro.io until user switches clinic in UI.
- **Cause:** Login handler only sets auth cookies, not `selected-clinic`.
- **Fix:** Set `selected-clinic=${activeClinicId}` in login response (see plan below).

### D. Host header wrong (proxy / Vercel)

- **Symptom:** Login API’s `req.headers.get('host')` is not `ot.eonpro.io` (e.g. internal host or main domain), so `extractSubdomain(host)` is wrong and subdomain-based clinic selection never picks OT.
- **Check:** In login handler, log `host` (and optionally subdomain) in production; confirm it is `ot.eonpro.io` when the user clearly is on that domain.

### E. Caching (browser / CDN / Vercel)

- **Symptom:** Code or config changes deploy but ot.eonpro.io still shows old behavior or old branding.
- **Cause:** Caching by host/path; resolve and static assets now have no-store, but other routes or HTML might be cached.
- **Check:** Hard refresh, incognito, or curl with `Cache-Control: no-cache`; compare with app.eonpro.io.

### F. Different deployment for ot.eonpro.io

- **Symptom:** Deploys go to one Vercel project/branch and ot.eonpro.io points to another (or old) deployment.
- **Check:** Vercel project domains and branch/alias for `ot.eonpro.io`; confirm it’s the same build as the one you’re changing.

### G. DEFAULT_CLINIC_ID set to non-OT

- **Symptom:** When no cookie and no JWT (e.g. first hit or after logout), middleware uses DEFAULT_CLINIC_ID; if that’s 1 (e.g. EONPRO or wellmedr), unauthenticated or post-logout behavior could look like “wrong clinic” for OT.
- **Check:** Env for the deployment that serves ot.eonpro.io; ensure DEFAULT_CLINIC_ID is not forcing another clinic in a way that affects OT flows.

---

## 3. Verification checklist (run for ot.eonpro.io)

1. **Resolve**
   - `curl -s 'https://ot.eonpro.io/api/clinic/resolve?domain=ot.eonpro.io' | jq .`
   - Expect: `clinicId` = OT’s id, `name` = OT name, `isMainApp` absent or false.  
   - If `clinicId` is null → fix DB (subdomain + status) or fix resolve.

2. **DB**
   - `SELECT id, name, subdomain, status FROM "Clinic" WHERE LOWER(subdomain) = 'ot';`
   - Expect one row, status = `ACTIVE`.

3. **Login**
   - Clear cookies, open ot.eonpro.io/login, complete login.
   - In DevTools → Application → Cookies, check for `selected-clinic` (today: missing; after fix: OT’s id).
   - Call `/api/clinic/current` or decode JWT: `clinicId` should be OT.

4. **Host header**
   - In login route, temporarily log `req.headers.get('host')` and subdomain when domain looks like ot.eonpro.io; confirm host is `ot.eonpro.io`.

5. **Session from other domain**
   - Log in on app.eonpro.io, then open ot.eonpro.io (same browser, no re-login).  
   - Expect: either redirect to login or “wrong clinic” message; today you may see app.eonpro.io’s clinic on ot.eonpro.io until re-login.

---

## 4. Fix plan (prioritized)

### P0 – Must do

1. **Set `selected-clinic` cookie on successful login**
   - **Where:** `src/app/api/auth/login/route.ts`, after building the JSON response, before `return response`.
   - **What:** `response.cookies.set('selected-clinic', String(activeClinicId), { path: '/', maxAge: 30*24*60*60, ... })` (same security options as auth cookie).
   - **Why:** Keeps cookie in sync with JWT; middleware and any cookie-based logic see the same clinic as the token.

2. **Confirm OT clinic in DB**
   - Ensure one clinic with `subdomain = 'ot'` and `status = 'ACTIVE'` in the DB used by the deployment that serves ot.eonpro.io (run the SELECT above in prod/staging).

3. **Verify resolve for ot.eonpro.io**
   - Run the curl in §3; if it returns default, fix DB or resolve logic (e.g. subdomain typo, status, or wrong DB).

### P1 – Should do

4. **Subdomain-override in auth (use subdomain’s clinic when user has access)**
   - **Where:** `src/lib/auth/middleware.ts` (and/or middleware-with-params if used for same routes), after resolving `user` from JWT.
   - **What:** Read `x-clinic-subdomain` (set by clinic middleware). If present, resolve clinic by subdomain (e.g. `prisma.clinic.findFirst({ where: { subdomain: { equals: value, mode: 'insensitive' }, status: 'ACTIVE' }, select: { id: true } })`). If found and user has access (e.g. `user.clinicId === clinic.id` or user’s clinics list includes it), set **effectiveClinicId = clinic.id** instead of `user.clinicId`. Then use this effectiveClinicId for setClinicContext and runWithClinicContext.
   - **Why:** When a user opens ot.eonpro.io with a session from another clinic, the app will automatically use OT’s context (if they have access) instead of forcing re-login or showing the wrong clinic.

5. **Optional: Edge subdomain → clinicId map**
   - **Where:** `src/middleware/clinic.ts`.
   - **What:** Env e.g. `SUBDOMAIN_CLINIC_ID_MAP=ot:5,wellmedr:2,eonmeds:3`. In `resolveClinic()`, when subdomain is present and cookie/JWT/header/default don’t give a clinicId, parse the map and set clinicId for that subdomain. Then set `x-clinic-id` so non-public APIs that don’t require auth still get a clinic (rare); for authenticated requests, auth middleware still overrides from JWT (or from P1 subdomain override).
   - **Why:** Only needed if you have unauthenticated API routes that require clinic and must work on ot.eonpro.io; otherwise P0 + P1 are enough.

### P2 – Good to have

6. **Log Host/subdomain in login (temporary)**
   - Log `host` and `extractSubdomain(host)` in login when `host` includes `eonpro.io`, to confirm Host is correct in production.

7. **Document and enforce “one deployment per base domain”**
   - Ensure ot.eonpro.io and app.eonpro.io (and other *.eonpro.io) all point to the same Vercel project/deployment so code and env are identical.

8. **Redirect or prompt when subdomain ≠ JWT clinic**
   - On dashboard (or layout) load, if on a clinic subdomain (e.g. ot.eonpro.io) and `/api/clinic/resolve` returns a clinicId that differs from current user’s clinicId, either redirect to login (force re-login on this domain) or show a banner “You’re on Overtime’s portal. Switch clinic?” and call `/api/clinic/switch` + refresh. Prefer P1 so that switch is automatic and UX is seamless.

---

## 5. Files to touch (summary)

| Priority | File | Change |
|----------|------|--------|
| P0 | `src/app/api/auth/login/route.ts` | Set `selected-clinic` cookie with `activeClinicId` on success. |
| P0 | DB | Ensure clinic with subdomain `ot`, status ACTIVE. |
| P1 | `src/lib/auth/middleware.ts` (and -with-params if needed) | When `x-clinic-subdomain` is set, resolve clinic by subdomain; if user has access, use that as effectiveClinicId. |
| P1 | `src/middleware/clinic.ts` | Already sets `x-clinic-subdomain` when subdomain exists; no change unless you add SUBDOMAIN_CLINIC_ID_MAP (P1 optional). |
| P2 | Login route | Optional temporary logging of host/subdomain. |
| P2 | Docs / runbooks | Document that *.eonpro.io must use same deployment. |

---

## 6. Testing after changes

1. **Resolve:** `curl -s 'https://ot.eonpro.io/api/clinic/resolve?domain=ot.eonpro.io'` → OT clinicId and name.
2. **Login on ot.eonpro.io:** Clear cookies → login → check `selected-clinic` cookie = OT id; `/api/clinic/current` returns OT.
3. **Cross-domain:** Login on app.eonpro.io → open ot.eonpro.io → after P1, dashboard should show OT (if user has access); before P1, expect wrong clinic until re-login.
4. **Admin change:** Update OT clinic branding/settings → hard refresh ot.eonpro.io → changes visible (resolve and assets already no-cache).

---

## 7. Every possible lever (principal-architect view)

Ways to resolve or harden the issue beyond P0/P1.

| # | Lever | What | Where |
|---|--------|------|--------|
| 7.1 | **Host header** | Use `X-Forwarded-Host` when present so proxy doesn’t hide real host; subdomain from correct host. | `getRequestHost(req)` in middleware + login; use everywhere we derive subdomain. |
| 7.2 | **Cookie domain** | Set `selected-clinic` **without** `domain` (host-only) so each subdomain has its own cookie, no cross-subdomain leakage. | Login (and any place that sets selected-clinic). |
| 7.3 | **Subdomain wins on login** | When Host subdomain resolves to a clinic and user has access, use that clinic as `activeClinicId` and ignore body `clinicId`. | Login route: prefer subdomain clinic over body when host is clinic subdomain. |
| 7.4 | **Logout clear cookie** | Clear `selected-clinic` on logout so no stale clinic cookie. | Logout route: add selected-clinic to cleared cookies. |
| 7.5 | **Edge subdomain map** | Env `SUBDOMAIN_CLINIC_ID_MAP=ot:5,wellmedr:2` so Edge can set x-clinic-id without DB (for unauthenticated clinic-scoped routes). | Clinic middleware. |
| 7.6 | **No cache on resolve** | Ensure no server fetch caches resolve response (client already no-cache). | Any server call to resolve: use cache: 'no-store'. |
| 7.7 | **Resolve on primary** | Resolve must use primary DB, not read replica (avoid eventual consistency). | Already true if no replica routing. |
| 7.8 | **Refresh preserves clinicId** | Refresh-token route must include clinicId (and subdomain if desired) in new JWT so context isn’t lost. | refresh-token route. |
| 7.9 | **Client safety net** | Dashboard: if resolve(domain) clinicId ≠ user.clinicId, show “Switch to this clinic?” or redirect to login. | Dashboard/layout client. |
| 7.10 | **Observability** | Log resolve result for *.eonpro.io (resolved true/false, clinicId); log login host + subdomain + activeClinicId when host contains eonpro.io. No PHI. | Resolve route, login route. |
| 7.11 | **One deployment** | All *.eonpro.io must point to same Vercel project/deployment (same build + env). No host-based build or Edge config. | Ops / runbook. |
| 7.12 | **Cookie SameSite/Secure** | SameSite=Lax, Secure in prod. Already standard for auth; apply to selected-clinic. | Login cookie config. |

---

## 8. Deployment runbook (7.11)

**All `*.eonpro.io` subdomains (e.g. ot.eonpro.io, wellmedr.eonpro.io, eonmeds.eonpro.io) must:**

1. **Point to the same Vercel project and deployment** as the main app (app.eonpro.io). If ot.eonpro.io is assigned to a different project or preview branch, it will have different code, env (e.g. `DATABASE_URL`, `NEXT_PUBLIC_*`), and build — so “changes” may not appear there.
2. **Use the same build** — no host-based or branch-based build variation. All domains should hit the same deployment URL or alias.
3. **Set SUBDOMAIN_CLINIC_ID_MAP (recommended):** So Edge middleware can set clinic context for clinic subdomains without a DB lookup. Generate the value with:
   ```bash
   npx tsx scripts/generate-subdomain-clinic-map.ts
   ```
   Add the printed line to Vercel env (Production, and Preview if needed). When you add or change a clinic subdomain, re-run the script and update the env. See script and `.env.example` for format.

**Check:** In Vercel → Project → Settings → Domains, confirm every `*.eonpro.io` domain is listed and assigned to the same project. After deploy, test `https://ot.eonpro.io/api/clinic/resolve?domain=ot.eonpro.io` and confirm it returns the OT clinic (not default EONPRO).

---

This gives a single place (this doc + the code paths above) to diagnose “changes not applied only for OT” and a clear, ordered set of code and ops changes to fix it.
