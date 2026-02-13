# Why the Labs tab is not showing on the platform

## Summary

The **Labs tab** is the **second item** in the patient profile sidebar. Visibility is controlled by
the **clinic feature** `BLOODWORK_LABS`. It **defaults to true** (show) when the key is missing.
If the Labs tab does not appear for a clinic (e.g. **ot.eonpro.io**), either:

1. **Clinic feature is off** — The clinic’s `features.BLOODWORK_LABS` is set to `false` in the DB.  
   **Fix:** Enable via Super Admin → Clinics → [clinic] → Features → “Labs tab (patient profile)” ON,  
   or PATCH ` /api/admin/clinic/features` with `{ "BLOODWORK_LABS": true }`, or merge in DB (see §10 of `BLOODWORK_LABS_ENTERPRISE_ANALYSIS.md`).
2. **Old deployment** — The site is serving an older bundle that did not yet read clinic features.  
   **Fix:** Redeploy from main and ensure the production domain (e.g. ot.eonpro.io) is assigned to that deployment; hard-refresh or incognito to avoid cache.

---

## 1. Code path (where Labs is defined)

| Step       | What happens                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------- |
| User opens | `https://ot.eonpro.io/patients/2782` (or any patient ID)                                            |
| Route      | **Only** patient detail route is `src/app/patients/[id]/page.tsx` (no `/admin/patients/[id]` page). |
| Layout     | `src/app/patients/layout.tsx` wraps the page (outer sidebar: Home, Patients, Orders, …).            |
| Page       | `patients/[id]/page.tsx` loads patient **with** `clinic: { features }`, then derives `showLabsTab = (features.BLOODWORK_LABS !== false)`. |
| Sidebar    | **PatientSidebar** (`src/components/PatientSidebar.tsx`) receives `showLabsTab`. If `false`, it filters out the Labs nav item. |
| Labs       | `{ id: 'lab', label: 'Labs', icon: 'Lb' }` is in the **static** `navItems`; shown only when `showLabsTab !== false`. |
| Content    | When `?tab=lab`, the page renders **PatientLabView** (upload, report list, detail).                 |

---

## 2. Why it might not show (root causes)

1. **Clinic feature BLOODWORK_LABS is false**  
   The patient’s clinic has `features.BLOODWORK_LABS === false` in the database. The page now
   derives `showLabsTab` from `patient.clinic.features`; only an explicit `false` hides the tab.
   **Fix:** Set `BLOODWORK_LABS: true` via Super Admin UI, PATCH `/api/admin/clinic/features`, or DB (see §10 of `BLOODWORK_LABS_ENTERPRISE_ANALYSIS.md`).

2. **Old JavaScript bundle (deployment/cache)**  
   The browser may be running an older build:  
   We deploy to Vercel project **eonpro** (eonpro1s-projects/eonpro). If **ot.eonpro.io** is
   attached to a **different** Vercel project (or a different “Production” deployment), that project
   may still be on an old commit without the Labs tab.

2. **Production deployment is from an old commit**  
   In Vercel → eonpro → Deployments, the deployment marked as **Production** might be from a commit
   **before** the Labs tab was added (e.g. before `bebc02d` / `be99a03`). New deploys we trigger
   might be going to **Preview** only, or a different branch.

3. **Aggressive caching**  
   CDN or browser cache could be serving an old `_next/static/chunks/...` JS file. Less likely if
   you hard-refresh (Ctrl+Shift+R) or use incognito, but possible with a long-lived CDN cache.

---

## 3. How to verify which build is running

1. Open **https://ot.eonpro.io/patients/2782** (or any patient).
2. Open **DevTools** (F12) → **Network** tab.
3. **Refresh** the page (preferably hard refresh).
4. In the list, find the main app JS chunk(s), e.g. `*.js` under `_next/static/chunks/`.
5. Note the **filename** (e.g. `abc123def456.js`). That hash is from the **build** that produced the
   bundle.
6. In **Vercel** → eonpro → **Deployments** → open the deployment that is **Production** for this
   project.
7. Trigger a **new production deploy** from **main** (or from the CLI: `npx vercel --prod` from the
   repo).
8. After it finishes, open the **new deployment URL** (e.g.
   `https://eonpro-xxxxx-eonpro1s-projects.vercel.app/patients/2782`) and again check the chunk
   filename in Network.
   - If the **hash is different** from what you see on ot.eonpro.io, then **ot.eonpro.io is not
     serving this new build** (wrong project, wrong deployment, or cache).
   - If the hash is the **same** on ot.eonpro.io and on the new deployment URL, but Labs still
     doesn’t show on ot.eonpro.io, try a hard refresh or incognito to rule out local cache.

---

## 4. Fix checklist

### A. Enable Labs for the OT clinic (database)

If the tab and **?tab=lab** still show Profile instead of Labs, the OT clinic likely has **BLOODWORK_LABS: false** (or the domain is on old code). Enable it:

1. **Script (recommended):** From the repo with `DATABASE_URL` set for the DB used by ot.eonpro.io (e.g. production):  
   `npx tsx scripts/enable-bloodwork-labs-ot.ts`  
   This sets `BLOODWORK_LABS: true` for the clinic with subdomain `ot`.

2. **Super Admin:** Clinics → OT → Features → turn **“Labs tab (patient profile)”** ON → Save.

3. **API:** `PATCH /api/admin/clinic/features` with body `{ "BLOODWORK_LABS": true }`.

Then refresh ot.eonpro.io/patients/3058 (or any patient); Labs tab and **?tab=lab** should work.

### B. Deployment and cache

- [ ] **Vercel → eonpro → Settings → Domains**  
      Confirm **ot.eonpro.io** is listed and assigned to **Production** for **this** project
      (eonpro). If it’s missing, add it and assign to Production.

- [ ] **Vercel → eonpro → Deployments**  
      Find the deployment that is **Production**. Check its **Source** (Git commit). It should be a
      commit that includes the Labs tab (e.g. `bebc02d` or later: “feat: Lab tab…”, “fix: rename Lab
      to Labs…”). If it’s older, **Redeploy** from branch **main** and set that deployment as
      **Production**.

- [ ] **Same project for CLI deploys**  
      When you run `npx vercel --prod` from the repo, it should deploy to the **same** project that
      has ot.eonpro.io. After deploy, that new deployment becomes Production; give it 1–2 minutes,
      then test ot.eonpro.io with a hard refresh.

- [ ] **Browser**  
      Hard refresh (Ctrl+Shift+R or Cmd+Shift+R) or use an incognito/private window when testing.

---

## 5. Code references

- **showLabsTab derivation:** `src/app/patients/[id]/page.tsx` — reads `patient.clinic.features.BLOODWORK_LABS` (default true when missing), passes to PatientSidebar.
- Sidebar tabs: `src/components/PatientSidebar.tsx` → `navItems` (line ~38–49); when `showLabsTab === false`, filters out the `lab` item.
- Tab content: `src/app/patients/[id]/page.tsx` → `currentTab === 'lab'` → `<PatientLabView />`.
- Tab alias: same file → `if (activeTab === 'labs') activeTab = 'lab';` so `?tab=labs` works.
