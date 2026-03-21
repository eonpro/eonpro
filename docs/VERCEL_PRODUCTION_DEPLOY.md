# Vercel production deploy (eonpro) — “Blocked” vs working deploys

## What changed in the dashboard (not in this repo)

Successful production deploys show **Created by `eonpro1`** (the normal Vercel account / Git integration).

Recent **Blocked** deploys show **Created by `EONMeds Deploy`**. That is a **different GitHub App / integration** posting deployments to the same Vercel project. Those deployments are often **Blocked** because of:

- **GitHub Environment protection** on `production` (required reviewers, wait timer), or  
- **Duplicate / misconfigured** Git connection, or  
- **Policy** on the org that applies to that app but not to the original Vercel Git hook.

**The repo did not switch deploy commands:** `vercel.json` still uses `npm run vercel-build`. Pushes to `main` can still trigger **two** different actors if two Git integrations are installed.

### Fix the root cause (recommended)

1. **GitHub** → Organization or repo **Settings** → **GitHub Apps** (or **Integrations**).  
   - Find **EONMeds Deploy** (or any second Vercel-related app).  
   - Either **suspend** it, or **remove repository access** for `eonpro/eonpro`, **or** open its config and disable “Deployments” / duplicate Vercel project link.

2. **Vercel** → **eonpro** project → **Settings** → **Git**.  
   - Confirm **one** connected repository and **Production Branch** = `main`.  
   - Disconnect anything that looks like a duplicate org-level install if Vercel shows multiple connections.

3. **GitHub** → **Settings** → **Environments** → **`production`**.  
   - If **Required reviewers** or **Wait timer** is on, either **approve** pending deployments or temporarily adjust rules so the integration you want can complete.

After that, new pushes to `main` should again produce **Ready** deployments attributed the same way as before (typically **`eonpro1`**), not stuck **Blocked** under **EONMeds Deploy**.

---

## Deploy production the “classic” ways

### A. Push to `main` (after Git integration is fixed)

```bash
git push origin main
```

Watch **Vercel → Deployments** until a **Ready** production deployment appears (from the correct creator).

### B. Vercel Dashboard (no Git push)

1. **Vercel** → **eonpro** → **Deployments**.  
2. **Create Deployment** → branch **`main`** → deploy to **Production**  
   - Or open the latest **Ready** deployment → **⋯** → **Redeploy** (to roll forward after fixing blockers).

Use the account/team that historically worked (**eonpro1** / your team), not a blocked app-only flow.

### C. Vercel CLI as `eonpro1` (same team as always)

From the repo root (must be logged in: `vercel whoami` → `eonpro1`):

```bash
npx vercel deploy --prod --yes
```

This targets **`eonpro1s-projects/eonpro`** when the project is linked. If the build fails, open the deployment in the Vercel UI and read **Build Logs** (often env vars or build-time imports).

---

## GitHub Actions note

`.github/workflows/deploy.yml` is **`workflow_dispatch` only** (manual). It does **not** run on every push to `main`. Do not rely on it for automatic production unless you re-enable `push` triggers intentionally.

---

## Related

- `docs/DEPLOY_OT_EONPRO.md` — domains, stale production, redeploy tips  
- `vercel.json` — `buildCommand`: `npm run vercel-build`
