# Getting fixes live on ot.eonpro.io

**Problem:** Changes (Labs tab, document upload error handling) are in the repo and pushed to `main`, but **ot.eonpro.io still shows the old app** (no Labs tab, 500 on document upload).

**Cause:** Production is serving an **old Vercel deployment**. The new code only appears after a **successful production deploy**.

---

## Where the fixes are (in code)

| Fix | File(s) |
|-----|--------|
| **Labs tab** (2nd in sidebar, label "Labs") | `src/components/PatientSidebar.tsx` (navItems) |
| **Lab content** (upload + report list + detail) | `src/app/patients/[id]/page.tsx` (tab=lab), `src/components/PatientLabView.tsx` |
| **Documents API** (503 for storage, JSON errors) | `src/app/api/patients/[id]/documents/route.ts` |
| **Documents UI** (error message + Labs link) | `src/components/PatientDocumentsView.tsx` |

Latest commits on `main`: `2337879`, `be99a03`, `bebc02d`.

---

## How to get them live

### Option A: GitHub Actions (automatic on push to main)

1. Open **GitHub** → repo **eonpro/eonpro** → **Actions**.
2. Find the **"Deploy Pipeline"** workflow.
3. Check the **latest run** for branch `main`:
   - If it **succeeded**: production should be updated. Wait 1–2 minutes, then hard-refresh ot.eonpro.io (Ctrl+Shift+R / Cmd+Shift+R) or try incognito.
   - If it **failed**: open the run, fix the failing job (e.g. migration, build, or Vercel deploy step), then push again or re-run the workflow.

### Option B: Redeploy from Vercel

1. Open **Vercel** → project linked to this repo (e.g. **ot** or **eonpro**).
2. Go to **Deployments**.
3. Find the **latest production deployment** and check its **git commit**. If it’s not `2337879` (or newer), production is stale.
4. **Redeploy**:
   - Either click **"Redeploy"** on the latest deployment, or  
   - **Deployments** → **"Create Deployment"** → choose branch **main** → **Deploy**.

### Option C: Push again to trigger pipeline

From the repo root:

```bash
git commit --allow-empty -m "chore: trigger production deploy"
git push origin main
```

Then watch **GitHub Actions → Deploy Pipeline**. When the **Deploy to Production** job succeeds, ot.eonpro.io will serve the new build.

---

## After deploy

- **Labs tab:** Second item in the patient left sidebar (under Profile). Link: `/patients/{id}?tab=lab`.
- **Document upload 500:** Either goes away (if storage is fixed) or returns **503** with a message to use the Labs tab for lab PDFs; the UI will show that message instead of a generic failure.
