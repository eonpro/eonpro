# Patient Sidebar Navigation – Root Cause Analysis

**Issue:** None of the links in the patient profile sidebar (Prescriptions, Labs, Intake, etc.) work.  
**Context:** Feature was working a few hours ago; something changed.  
**Date:** 2026-02-12

---

## Timeline of Changes

| Commit   | Date       | What Changed |
|----------|------------|--------------|
| `8642c5a` | Today      | **Main suspect** – Provider prescription fix: added `/provider/patients/[id]` route, redirect in patients layout, updated provider entry links |
| `2288184` | Today      | Provider resolution + settings fallback for prescriptions |

---

## How It Worked Before `8642c5a`

1. **Single route for patient details:** Everyone (admin, staff, provider) used `/patients/[id]`.
2. **Sidebar links:** `PatientSidebar` used `href={"/patients/${patient.id}?tab=${item.id}"}`.
3. **Navigation:** Clicking a tab did client-side navigation on the same route with new query params: `/patients/2961?tab=prescriptions`. Same layout, same page, only `searchParams` changed. This worked.

---

## What Changed in `8642c5a`

1. **New provider route:** `/provider/patients/[id]` was added for providers.
2. **Provider entry links updated:** Dashboard, patient list, Rx queue, etc. now link to `/provider/patients/[id]` instead of `/patients/[id]`.
3. **Redirect in patients layout:** When a provider visits `/patients/[id]`, they are redirected to `/provider/patients/[id]`.

4. **`PatientSidebar` not updated:** It still used hardcoded `/patients/` in its links.

---

## Root Cause

When a provider views a patient via the new flow:

- **Current URL:** `/provider/patients/2961` (under `ProviderLayout`)
- **Sidebar link href:** `/patients/2961?tab=prescriptions`
- **On click:** Next.js navigates to `/patients/2961?tab=prescriptions`

That means:

1. Leave `/provider/patients/2961` (different route)
2. Enter `/patients/2961` under the patients layout
3. Patients layout mounts and runs its `useEffect`
4. It detects provider + `/patients/` path
5. Calls `router.replace("/provider/patients/2961?tab=prescriptions")`
6. Navigation goes back to `/provider/patients/2961?tab=prescriptions`

So the intended flow is: click → navigate to `/patients/` → redirect to `/provider/patients/`.

### Why This Feels Broken

1. **Double navigation:** Click triggers a full route change to `/patients/`, then an immediate redirect to `/provider/patients/`. This can cause:
   - Visible layout swap (provider layout → patients layout → provider layout)
   - Flash or perceived “nothing happened”
   - Unstable state during the two navigations

2. **Different route trees:** `/patients/[id]` and `/provider/patients/[id]` use different layout trees:
   - `app/patients/layout.tsx` for `/patients/`
   - `app/provider/layout.tsx` for `/provider/patients/`
   
   Each tab click crosses layout boundaries and triggers the redirect.

3. **Redirect timing:** The patients layout `useEffect` runs after mount. There is a brief moment where the patients layout is mounted before the redirect, which can contribute to flicker or odd behavior.

### Who Is Affected

- **Providers:** All tab clicks from `/provider/patients/[id]` go through this redirect flow.
- **Admins / staff:** Still on `/patients/[id]`; sidebar links stay on `/patients/[id]` and work normally. No impact.

---

## Fix

Use a base path for patient links so they match the current route.

1. **`PatientSidebar`:** Add `patientDetailBasePath` (default `/patients`). Use it to build links:

   ```ts
   href={`${patientDetailBasePath}/${patient.id}?tab=${item.id}`}
   ```

2. **Patient detail page:** Pass the correct base path:
   - From `/patients/[id]`: `patientDetailBasePath="/patients"`
   - From `/provider/patients/[id]`: `patientDetailBasePath="/provider/patients"` (via `patientsListPath`)

3. **Result:** On `/provider/patients/2961`, links become `/provider/patients/2961?tab=prescriptions`. Navigation stays within `ProviderLayout`; no redirect, no layout swap, normal tab switching.

---

## Additional Components to Update

For consistency, other components that link into patient details should use the correct base path when used in a provider context:

- `PatientQuickSearch` (navigate to another patient from search) – needs `patientDetailBasePath`
- `WeightProgressSummary` – uses `/patients/`; consider a base path if used in provider context
- `PatientDocumentsView` – `href={/patients/${patientId}?tab=lab}`; consider base path if used in provider context

---

## Verification Steps

1. As provider, go to `/provider/patients/2961`.
2. Click “Prescriptions”, “Labs”, “Intake”, etc.
3. URL should stay as `/provider/patients/2961?tab=X`.
4. Tab content should change without layout flicker.
5. As admin/staff on `/patients/2961`, tab clicks should still work as before.
