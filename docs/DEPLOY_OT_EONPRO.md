# Getting fixes live on ot.eonpro.io

**Problem:** Changes (Labs tab, document upload error handling) are in the repo and pushed to
`main`, but **ot.eonpro.io still shows the old app** (no Labs tab, 500 on document upload).

**Cause:** Production is serving an **old Vercel deployment**. The new code only appears after a
**successful production deploy**.

---

## Why nothing changed after pushing

The GitHub **Deploy Pipeline** runs three jobs in order:

1. **Deploy to Staging** → 2. **Database Migration** → 3. **Deploy to Production**

**If step 2 (migrate-database) fails**, step 3 never runs, so **production is never updated**.
Common causes:

- Missing or wrong **DATABASE_URL** / **DIRECT_DATABASE_URL** in GitHub repo **Settings → Secrets
  and variables → Actions**
- Migration fails (e.g. permission, wrong DB)
- **Deploy to Production** only runs when `main` is pushed and migration succeeds

So: **check the latest Actions run**. If "Database Migration" or "Deploy to Production" is red, fix
that (or use Option B below to deploy from Vercel and skip the pipeline).

---

## Where the fixes are (in code)

| Fix                                              | File(s)                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Labs tab** (2nd in sidebar, label "Labs")      | `src/components/PatientSidebar.tsx` (navItems)                                  |
| **Lab content** (upload + report list + detail)  | `src/app/patients/[id]/page.tsx` (tab=lab), `src/components/PatientLabView.tsx` |
| **Documents API** (503 for storage, JSON errors) | `src/app/api/patients/[id]/documents/route.ts`                                  |
| **Documents UI** (error message + Labs link)     | `src/components/PatientDocumentsView.tsx`                                       |

Latest commits on `main` (with Labs + fixes): `b099ef7`, `5f132b0`, `2337879`, `be99a03`, `bebc02d`.

---

## How to get them live

### Option A: GitHub Actions (automatic on push to main)

1. Open **GitHub** → repo **eonpro/eonpro** → **Actions**.
2. Find the **"Deploy Pipeline"** workflow.
3. Check the **latest run** for branch `main`:
   - If it **succeeded**: production should be updated. Wait 1–2 minutes, then hard-refresh
     ot.eonpro.io (Ctrl+Shift+R / Cmd+Shift+R) or try incognito.
   - If it **failed**: open the run, fix the failing job (e.g. migration, build, or Vercel deploy
     step), then push again or re-run the workflow.

### Option B: Deploy from Vercel (recommended if pipeline never updates production)

This updates ot.eonpro.io **without** relying on GitHub Actions.

1. Open **[Vercel Dashboard](https://vercel.com/dashboard)** and select the project that has
   **ot.eonpro.io** as its production domain.
2. Go to **Deployments**.
3. Check the **latest Production** deployment:
   - Click it and look at **Source** (e.g. commit `b099ef7` or `main`). If it’s an old commit,
     production is stale.
4. Deploy the latest `main`:
   - **Option B1:** **Deployments** → **"Create Deployment"** → Branch: **main** → **Deploy** (set
     as Production when prompted), or
   - **Option B2:** If the project is connected to GitHub, go to **Settings → Git** and confirm
     **Production Branch** is `main`. Then use **Deployments** → three dots on latest `main`
     deployment → **Redeploy** (use "Use existing Build Cache" or not; redeploy will pick up latest
     commit if Git is connected).
5. Wait for the new deployment to finish and be assigned to **Production**. Then hard-refresh
   ot.eonpro.io (Ctrl+Shift+R).

### Option C: Push again to trigger pipeline

From the repo root:

```bash
git commit --allow-empty -m "chore: trigger production deploy"
git push origin main
```

Then watch **GitHub Actions → Deploy Pipeline**. When the **Deploy to Production** job succeeds,
ot.eonpro.io will serve the new build.

---

## After deploy

- **Labs tab:** Second item in the patient left sidebar (under Profile). Link:
  `/patients/{id}?tab=lab`.
- **Document upload 500:** Either goes away (if storage is fixed) or returns **503** with a message
  to use the Labs tab for lab PDFs; the UI will show that message instead of a generic failure.
