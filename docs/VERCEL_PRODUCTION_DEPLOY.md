# Vercel production — deployments stuck **Blocked** (same project, no recreate)

If **every** new **Production** deployment from `main` shows **Blocked** (red), the most common cause on Git-connected projects is **Vercel Deployment Checks** (rolled out broadly in late 2025): production builds are created but **not promoted** to your domains until selected **GitHub Actions checks** report success on that commit.

Official docs: [Deployment Checks](https://vercel.com/docs/deployment-checks) · [Changelog](https://vercel.com/changelog/block-vercel-deployment-promotions-with-github-actions).

---

## Fix 1 — Turn off or fix Deployment Checks (recommended)

Do this on the **existing** `eonpro` project (no new project).

1. Open **[Vercel](https://vercel.com)** → team **eonpro1s-projects** → project **eonpro**.
2. **Settings** → **Deployment Checks**  
   - If that tab isn’t visible, try **Settings** → **Git** or **Build and Deployment** and look for **Deployment Checks**.
3. You should see one or more **required** checks (often named like a GitHub Actions job or workflow).
4. **Either:**
   - **Remove** all required Deployment Checks (restores the old behavior: promote to production as soon as the Vercel build succeeds), **or**
   - Keep checks but fix **GitHub Actions** so the **exact** named jobs/workflows run on every push to `main` and end **success** (see “CI mismatch” below).

5. For a deployment that already **built successfully** but is still **Blocked**, open the deployment → use **Force promote** / **Force Promote** (see [Promoting a deployment](https://vercel.com/docs/deployments/promoting-a-deployment)) to assign production domains without waiting for checks.

After checks are cleared or passing, new pushes should leave **Blocked** and become **Ready** on production.

---

## Fix 2 — GitHub `production` environment (if checks aren’t the cause)

**GitHub** → repo **Settings** → **Environments** → **production**

- Disable **Required reviewers** / **Wait timer** if you don’t want manual approval on each deploy.
- Approve any **pending** deployment waiting in GitHub’s UI.

---

## Fix 3 — “EONMeds Deploy” vs `eonpro1` (display name / app install)

**EONMeds Deploy** is usually the **GitHub App** name shown for commits/deployments (org branding), not a second Vercel project. **Blocked** is still most often **Deployment Checks** or **environment protection**, not the label itself.

If you **do** have two GitHub Apps both talking to Vercel for the same repo, simplify:

**GitHub** → **Settings** → **Integrations** / **GitHub Apps** → ensure only one Vercel-related app should drive **eonpro**, and **Vercel** → **Settings** → **Git** shows a single connected repo.

---

## CI mismatch (why checks never turn green)

If Deployment Checks require e.g. **“CI Pipeline / Lint & Type Check”** but:

- The workflow **skips** on `main`, **fails**, or **renames** jobs, or  
- **Private repo** changed permissions so Actions don’t run,

Vercel will keep the deployment **Blocked** forever.

**Options:** remove the check in Vercel (Fix 1), or make the required workflow **pass on every `main` push**.

---

## Quick reference

| Symptom | Likely cause | Fast fix |
|--------|----------------|----------|
| Production = **Blocked**, build may be green | **Deployment Checks** waiting on GitHub | Settings → Deployment Checks → remove checks, or Force Promote |
| Pending in GitHub | **Environment** protection | Environments → production → reviewers / approve |
| Old deploys **Ready** by `eonpro1`, new ones **Blocked** | Checks enabled recently + CI not satisfying them | Same as first row |

---

## Other deploy paths (unchanged)

- **Push to `main`** after Fix 1 — should promote automatically again.  
- **CLI:** `npx vercel deploy --prod --yes` (as team member with access).  
- **GitHub Actions** `deploy.yml` is **manual only** (`workflow_dispatch`); it does not auto-run on push.

---

## Related

- `docs/DEPLOY_OT_EONPRO.md` — domains & stale production  
- `vercel.json` — `vercel-build` command
