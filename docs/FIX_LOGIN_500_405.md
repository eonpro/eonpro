# Fix Login 500 (Clinic Resolve) and 405 (Auth Login)

When the login page at a clinic subdomain (e.g. `wellmedr.eonpro.io/login`) shows:

- **500** on `GET /api/clinic/resolve?domain=...`
- **405 Method Not Allowed** on `POST /api/auth/login`
- **"Failed to execute 'json' on 'Response': Unexpected end of JSON input"** on the page

apply the following.

## Changes made in code

### 1. Clinic resolve (500)

- **Route:** `src/app/api/clinic/resolve/route.ts`
- **Cause:** DB errors (e.g. connection, missing columns) or missing optional fields in the select.
- **Fixes in place:**
  - `buttonTextColor` and `backgroundColor` are included in all Prisma `select` blocks so the handler never reads missing columns.
  - All error paths return **JSON** (400, 404, 503, 500) so the client never gets HTML or empty body.
- **If 500 persists:** Check server logs for `[CLINIC_RESOLVE_GET]` and the `errorId`. Response body is JSON with `error`, `errorId`, and `code: 'CLINIC_RESOLVE_ERROR'` or `'SERVICE_UNAVAILABLE'`. Fix DB connectivity or schema (e.g. run migrations) as needed.

### 2. Auth login (405)

- **Route:** `src/app/api/auth/login/route.ts`
- **Cause:** Some clients or proxies send an **OPTIONS** preflight for `POST /api/auth/login`. The route only exported **POST**, so OPTIONS returned 405.
- **Fix in place:** An **OPTIONS** handler was added that returns **204** with `Allow: POST, OPTIONS`, so CORS preflight succeeds and the browser can send POST.

### 3. Client "Unexpected end of JSON input"

- **Page:** `src/app/login/page.tsx`
- **Cause:** When the server returned 405 or 500 with a non-JSON body (or empty body), `response.json()` threw.
- **Fix in place:** Login responses are parsed with `parseJsonResponse(response)`, which uses `response.text()` then `JSON.parse`. On empty or invalid body it returns a safe object with `error` set (e.g. "Login method not allowed", "Server error. Please try again."), so the UI shows a message instead of a JSON parse error.

## Verification

1. Open the clinic login page (e.g. `https://wellmedr.eonpro.io/login`).
2. In DevTools → Network, confirm:
   - `GET /api/clinic/resolve?domain=wellmedr.eonpro.io` → **200** (or 404/503 with JSON).
   - `POST /api/auth/login` (after clicking "Log in") → **200** (success) or **400/401/429** (JSON error), not 405.
3. If the server returns an error, the page should show the error message from the JSON `error` field, not "Unexpected end of JSON input".

## Environment

- **Clinic resolve:** Uses `basePrisma` (no auth). Ensure `DATABASE_URL` is set and the DB is reachable; run migrations if the `Clinic` model has new columns.
- **Auth login:** No extra env for OPTIONS. For POST, `JWT_SECRET` and rate limiter config apply as before.
