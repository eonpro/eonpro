# ENTERPRISE DOMAIN ROUTING INCIDENT

**Status:** Documented | **Date:** 2026-02-11

## Summary

`ot.eonpro.io` returns 404 HTML for `/api/*` routes while `app.eonpro.io` returns JSON. Both domains must serve the **same** Next.js deployment for consistent UI and API behavior.

---

## Root Cause

**Domain → Project / Deployment mismatch.** `ot.eonpro.io` is configured to point to a different Vercel project or an older deployment that does not include the full API surface.

### Evidence

| Host               | Endpoint                        | Response                          |
|--------------------|---------------------------------|-----------------------------------|
| app.eonpro.io      | `/api/diagnostics/db-fingerprint`| 200 JSON                          |
| ot.eonpro.io       | `/api/diagnostics/db-fingerprint`| 404 HTML (Next.js “Page not found”)|

The ot.eonpro.io 404 is the standard Next.js not-found page (HTML with “Page not found”, links to /patients, /providers, etc.), so:

1. The request reaches a Next.js app (same codebase or similar UI).
2. The `/api/diagnostics/db-fingerprint` route does **not** exist in that deployment.

This indicates different Vercel deployments or projects for `app.eonpro.io` vs `ot.eonpro.io`.

### Configuration Review (No Code-Level Blocking)

- **vercel.json** – No domain-specific rewrites or redirects.
- **next.config.js** – Rewrites only for `/portal` → `/patient-portal`. No API rewrites.
- **middleware.ts** – No rewrites that would block `/api`.
- **clinic middleware** – For subdomain `ot`, returns `null` if `SUBDOMAIN_CLINIC_ID_MAP` is unset. For non-public `/api` routes, this yields 400 JSON `"No clinic context"`, not 404 HTML. The observed 404 HTML confirms the request is not hitting the current shared app at all.

---

## Required Fix

Make `ot.eonpro.io` point to the **same** Vercel project and production deployment as `app.eonpro.io`.

---

## Operational Steps

### 1. Inspect Domain Setup in Vercel

1. Go to [vercel.com](https://vercel.com) → sign in.
2. Open the project serving `app.eonpro.io` (e.g. `eonpro`).
3. Go to **Project → Settings → Domains**.
4. Check:
   - Which domains are listed (app.eonpro.io, ot.eonpro.io, eonmeds.eonpro.io, etc.).
   - Which deployment each domain targets (Production / Preview).
   - Any redirect or rewrite rules per domain.

### 2. Add or Align `ot.eonpro.io`

**Option A – Add as domain alias (if missing)**

1. **Project → Settings → Domains**.
2. Click **Add**.
3. Add `ot.eonpro.io`.
4. Assign it to **Production**.
5. Save. Vercel will provide DNS instructions if needed.

**Option B – Correct deployment assignment**

1. If `ot.eonpro.io` already exists but targets a different deployment or project:
2. Edit the domain.
3. Set the deployment to the same **Production** deployment used by `app.eonpro.io`.
4. Save.

### 3. DNS (if domain is new to Vercel)

If Vercel shows DNS instructions for `ot.eonpro.io`:

- Add a `CNAME` record: `ot` → `cname.vercel-dns.com` (or the exact target Vercel shows).
- Or use Vercel nameservers if using their DNS.

### 4. Verify Deployment Assignment

1. **Project → Deployments**.
2. Note the latest production deployment (e.g. commit `bb5962e`).
3. Ensure both `app.eonpro.io` and `ot.eonpro.io` are assigned to that deployment.

---

## Verification Checklist

After changing domain config, run these checks (allow a few minutes for DNS/propagation).

### Version ping (must return JSON on both hosts)

```bash
# app.eonpro.io — expect JSON
curl -s "https://app.eonpro.io/api/version" | jq .
curl -s "https://app.eonpro.io/api/ping" | jq .

# ot.eonpro.io — expect same structure (may differ only in host)
curl -s "https://ot.eonpro.io/api/version" | jq .
curl -s "https://ot.eonpro.io/api/ping" | jq .
```

**Success:** Both return JSON with `gitSha`, `buildId`, `host`, `timestamp`.

**Failure:** `ot.eonpro.io` returns 404 HTML → still pointing elsewhere; re-check Vercel domain settings and propagation.

### Compare build IDs

```bash
APP=$(curl -s "https://app.eonpro.io/api/version" | jq -r '.commit')
OT=$(curl -s "https://ot.eonpro.io/api/version" | jq -r '.commit')
echo "app: $APP"
echo "ot:  $OT"
[ "$APP" = "$OT" ] && echo "MATCH: Same deployment" || echo "MISMATCH: Different deployments"
```

### Diagnostics (optional, requires auth)

```bash
TOKEN="your-super-admin-jwt"
curl -s -H "Authorization: Bearer $TOKEN" "https://app.eonpro.io/api/diagnostics/db-fingerprint" | jq .
curl -s -H "Authorization: Bearer $TOKEN" "https://ot.eonpro.io/api/diagnostics/db-fingerprint" | jq .
```

Both should return JSON with matching `datasource.hash` and `dbIdentity` (once routing is fixed).

---

## Version / Ping Endpoints

| Method | Path          | Auth | Purpose                                      |
|--------|---------------|------|----------------------------------------------|
| GET    | `/api/version` | None | Confirm which deployment each host is serving |
| GET    | `/api/ping`    | None | Same payload with pathname; public on all subdomains |

**Response (both endpoints):**

```json
{
  "gitSha": "7908f14c34131d8f91d0984f64cf167b6089ef3d",
  "buildId": "7908f14c34131d8f91d0984f64cf167b6089ef3d",
  "host": "ot.eonpro.io",
  "pathname": "/api/ping",
  "timestamp": "2026-02-11T08:00:00.000Z"
}
```

- `/api/ping` added to `PUBLIC_ROUTES` in clinic middleware.
- Edge runtime; no DB or external calls for fast checks.
- **Note:** Next.js treats `_`-prefixed folders as private (excluded from routing), so `/api/_health/version` does not work.

---

## Alternative: Separate Project for Patient Portal

If you intentionally run a **separate** Vercel project for clinic subdomains (e.g. patient-only builds):

1. Add rewrites in that project to proxy `/api/*` and `/patients/*` to the main app deployment.
2. Or unify on a single project: add all domains as aliases and serve the full app everywhere.

---

## Automated Fix Script

Run to add `ot.eonpro.io` explicitly and promote the latest deployment:

```bash
# 1. Create token at https://vercel.com/account/tokens
# 2. If project is under a team, get team ID from Vercel → Team Settings → General

VERCEL_TOKEN=your_token_here npx tsx scripts/fix-ot-domain-routing.ts

# Dry run (no changes):
VERCEL_TOKEN=your_token_here npx tsx scripts/fix-ot-domain-routing.ts --dry-run

# With team:
VERCEL_TOKEN=xxx VERCEL_TEAM_ID=team_xxx npx tsx scripts/fix-ot-domain-routing.ts
```

The script will:
1. Add `ot.eonpro.io` to the eonpro project
2. Promote the latest production deployment (points all domains to it)

---

## Related

- `docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md`
- `src/app/api/diagnostics/db-fingerprint/route.ts`
- `src/app/api/_health/version/route.ts`
