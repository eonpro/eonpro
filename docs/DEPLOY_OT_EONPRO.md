# Getting fixes live on ot.eonpro.io

**Problem:** Changes (Labs tab, document upload error handling) are in the repo and pushed to
`main`, but **ot.eonpro.io still shows the old app** (no Labs tab, 500 on document upload).

**Cause:** Production is serving an **old Vercel deployment**. The new code only appears after a
**successful production deploy**.

---

## Why nothing changed after pushing

**Update (2026):** `.github/workflows/deploy.yml` is **manual only** (`workflow_dispatch`). Pushes to
`main` do **not** run that pipeline automatically. Production updates normally come from **Vercel’s
Git integration** (push to `main` → Vercel builds).

If pushes no longer update production, see **`docs/VERCEL_PRODUCTION_DEPLOY.md`** — especially when
new deployments show **Blocked** and **Created by “EONMeds Deploy”** instead of **`eonpro1`**
(duplicate GitHub App / environment protection).

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

### Option A: GitHub Actions (manual “Deploy Pipeline”)

1. Open **GitHub** → repo **eonpro/eonpro** → **Actions** → **Deploy Pipeline**.
2. **Run workflow** (it does not run automatically on push).
3. Ensure **production** environment secrets (**VERCEL_TOKEN**, DB URLs, etc.) are set if you use this path.

For day-to-day production updates from `main`, prefer **Vercel Git** or **Option B** unless you
intentionally use this workflow.

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
