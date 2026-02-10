# Why Changes for ot.eonpro.io (and Other Clinic Subdomains) Often Don’t Work

## Summary

**Root cause:** On clinic subdomains (e.g. `ot.eonpro.io`), **unauthenticated** requests have **no clinic context** in the Edge middleware. Any API route used **before** the user has a session (e.g. on the login page) that is **not** listed in `PUBLIC_ROUTES` is blocked with `400 No clinic context`. The app then behaves as if the change “didn’t work” for that clinic.

This is not OT-specific; it affects **any** `*.eonpro.io` subdomain when the user is not logged in.

---

## How It Works

1. **Clinic middleware** (`src/middleware/clinic.ts`) runs on almost every request when `NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true'`.
2. It tries to resolve **clinic ID** from, in order:
   - `selected-clinic` cookie  
   - JWT (auth token)  
   - `x-clinic-id` header  
   - Subdomain (e.g. `ot` from `ot.eonpro.io`)  
   - `DEFAULT_CLINIC_ID` env
3. **Edge runtime** cannot do DB lookups, so for subdomain it does **not** call the DB. It effectively has no clinic ID for “subdomain only” requests.
4. If **no clinic ID** is found and the path is **not** in `PUBLIC_ROUTES`, the middleware:
   - for **API** routes → returns **400** `"No clinic context. Please specify clinic."`
   - for **pages** → redirects to `/clinic-select`

So on `ot.eonpro.io/login`:

- User has **no** cookie and **no** token yet.
- Middleware sees subdomain `ot` but still has **no** clinic ID (no DB in Edge).
- Any request to an API that is **not** in `PUBLIC_ROUTES` gets **400**.
- If that API is used for the login page (e.g. EONPRO logo, or any asset), the request fails and the UI falls back (e.g. alt text instead of image).

---

## Example: EONPRO Logo on ot.eonpro.io

- Login page uses `<img src="/api/assets/eonpro-logo" />`.
- From `ot.eonpro.io`, the browser requests `https://ot.eonpro.io/api/assets/eonpro-logo`.
- `/api/assets/*` was **not** in `PUBLIC_ROUTES` → middleware returned **400** → image failed to load → only “Powered by EONPRO” text (alt) was shown.
- **Fix:** Add `/api/assets` to `PUBLIC_ROUTES` in `src/middleware/clinic.ts` so the logo (and any future public assets) load on all subdomains without clinic context.

---

## What You Must Do for “OT (or any clinic) Only” Changes

1. **If the change uses a new API route** that is called **before** login (e.g. from login page, marketing page, or any unauthenticated page on a clinic subdomain):
   - Add that route (or a prefix) to **`PUBLIC_ROUTES`** in `src/middleware/clinic.ts`.
   - Otherwise that route will get **400** on `ot.eonpro.io` (and other clinic subdomains) when there is no cookie/token.

2. **If the change is only in the UI** (same API, same PUBLIC route):
   - No middleware change needed. If it still doesn’t apply on OT, check:
     - Caching (browser, CDN, Vercel).
     - That the deployment you’re testing (e.g. `ot.eonpro.io`) is the one you actually deployed (same branch/project).

3. **If the change depends on clinic-specific data** (e.g. branding, feature flags):
   - Ensure the **clinic is resolved correctly** for that subdomain (e.g. `/api/clinic/resolve?domain=ot.eonpro.io` returns the right clinic).  
   - Resolution is done in API routes (e.g. `/api/clinic/resolve`), not in Edge; the login page already calls it. So the main pitfall is **new** API routes used before auth not being public.

---

## Checklist for New Features Used on Login or Pre-Auth Pages

- [ ] Is a **new API route** (or new path prefix) called from the login page or any unauthenticated clinic subdomain page?
- [ ] If yes → add it (or a prefix like `/api/assets`) to **`PUBLIC_ROUTES`** in `src/middleware/clinic.ts`.
- [ ] Ensure the route itself does not rely on `x-clinic-id` or auth for that use case (or it will still fail).

---

## Reference: Current PUBLIC_ROUTES

See `src/middleware/clinic.ts`. As of this doc, the list includes (among others):

- `/api/auth/login`, `/api/auth/refresh-token`
- `/api/webhooks`
- `/api/clinic/resolve`, `/api/clinic/list`
- `/api/health`, `/api/ready`, `/api/monitoring`
- **`/api/assets`** (for EONPRO logo and other public assets)
- `/login`, `/register`, `/clinic-select`
- `/api/affiliate/auth`, `/api/affiliate/apply`
- `/api/tickets`

Any new API used on the login page or before auth on a clinic subdomain should be added here.
