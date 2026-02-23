# Deploy Now

**Build status:** `npm run build` completed successfully locally.

---

## Option 1: Deploy via GitHub (recommended)

Pushing to `main` runs the full pipeline: **staging deploy → database migrations → production deploy**.

```bash
# From the project root
git add -A
git status   # review changes
git commit -m "Your commit message"
git push origin main
```

- **Staging** deploys first; smoke test runs against the preview URL.
- **Migrations** run against the production DB (with failed-migration resolution steps).
- **Production** deploys after migrations succeed; health check runs; a release tag is created.

**Required GitHub secrets:** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `DATABASE_URL`, `DIRECT_DATABASE_URL` (for migrations).

---

## Option 2: Deploy via Vercel CLI

If you deploy from your machine with Vercel CLI:

```bash
# Install Vercel CLI if needed: npm i -g vercel
vercel --prod
```

Vercel will use the **Build Command** from `vercel.json`: `npm run vercel-build` (runs migrations then `next build`).

**If you get P1002 (database timeout during build):** Vercel build machines (e.g. iad1) may not reliably reach RDS (e.g. us-east-2). Set `SKIP_MIGRATE_ON_BUILD=true` in Vercel → Project → Settings → Environment Variables, then run migrations separately via GitHub deploy workflow or `npx prisma migrate deploy` manually.

---

## Option 3: Vercel Dashboard

1. Open [Vercel Dashboard](https://vercel.com) → your project.
2. Go to **Deployments**.
3. Click **Deploy** (or redeploy the latest from the correct branch).  
   Or push to the connected branch (e.g. `main`); Vercel will build and deploy automatically.

---

## Why do I see multiple deployments for the same commit?

You may see several production deployments all with the same commit hash (e.g. `33c0a25`). That usually means the same code was deployed more than once:

| Cause | What to do |
|-------|------------|
| **Vercel Git** | Each push to `main` creates one deployment. Normal. |
| **"Redeploy" in Vercel** | Each click creates a new deployment (same commit). Only use when you need to rebuild (e.g. env var change). |
| **`vercel --prod` from CLI** | Each run creates a new deployment. Avoid running repeatedly for the same commit. |
| **GitHub "Deploy Pipeline" run multiple times** | Each manual run deploys again. The workflow now skips deploy if production already has this commit. |

**Recommendation:** Prefer **one** path: push to `main` (Vercel Git) **or** one manual run of the deploy workflow / one `vercel --prod`. Don’t push and then also run the workflow or CLI for the same commit.

---

## Pre-deploy note (failed migration)

Running `npm run deploy:safe` locally reported:

- **1 failed migration:** `20260205_add_platform_billing`

`prisma migrate status` on the **local** DB reported "Database schema is up to date", so your local DB may be fine. If **production** has this migration in a failed state:

- The **GitHub workflow** has a "Resolve failed migrations" step that may clear it.
- Or resolve manually against the production DB:  
  `npx prisma migrate resolve --applied "20260205_add_platform_billing"`  
  (only if that migration’s changes are already applied or you intend to skip it).

After deploy, verify:

- **Health:** `GET https://YOUR_DOMAIN/api/health` → 200
- **Ready:** `GET https://YOUR_DOMAIN/api/monitoring/ready` → 200 (if you use it)

See **`docs/DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md`** for rollback and full checklist.
