# Clinic features and admin UI — pattern to avoid “tab not showing” bugs

## Problem

Admin UI that should vary by clinic (e.g. Labs tab on patient profile) was hardcoding values instead of reading from the clinic’s `features` JSON. That caused the same tab to appear for some subdomains (e.g. wellmedr, eonmeds) but not others (e.g. ot.eonpro.io) when the underlying data or deployment differed.

## Rule

**Any admin UI that is gated by a clinic feature must read from the clinic’s `features` (e.g. `patient.clinic.features` or clinic from API), not from a hardcoded `true`/`false`.**

## Where clinic features are used today

| Feature key        | Where it’s read | Purpose |
|--------------------|------------------|--------|
| `BLOODWORK_LABS`   | `src/app/patients/[id]/page.tsx` | Show/hide **Labs** tab in patient profile sidebar and allow `?tab=lab`. |

- **API:** `GET/PATCH /api/admin/clinic/features` (merge with `DEFAULT_FEATURES` in `src/app/api/admin/clinic/features/route.ts`).
- **Super Admin UI:** Clinics → [clinic] → Features tab; toggle “Labs tab (patient profile)”.
- **Default:** `BLOODWORK_LABS` defaults to `true` when missing so existing clinics keep the tab.

## Implementation pattern

1. **Server-side (e.g. patient detail page)**  
   The page already loads the patient with `clinic: { features }`. Use the shared helper so behavior is consistent and defaults are clear:

   ```ts
   import { getClinicFeatureBoolean } from '@/lib/clinic/utils';

   const showLabsTab = getClinicFeatureBoolean(
     patientWithDecryptedPHI.clinic?.features,
     'BLOODWORK_LABS',
     true
   );
   ```

2. **Helper**  
   `src/lib/clinic/utils.ts`: `getClinicFeatureBoolean(rawFeatures, key, defaultWhenMissing)`.  
   Only explicit `false` turns the feature off; missing or `true` → enabled.

3. **Sidebar / tabs**  
   Pass the derived boolean into the component (e.g. `showLabsTab={showLabsTab}`).  
   If the tab can be opened via URL (e.g. `?tab=lab`), **also** restrict `validTabs` so that when the feature is off, that tab is not valid and the app falls back to a default tab (e.g. profile).

## Adding a new clinic-gated tab/section

1. Add the feature key and default to `ClinicFeatures` and `DEFAULT_FEATURES` in `src/app/api/admin/clinic/features/route.ts`.
2. Add the toggle in Super Admin → Clinics → [clinic] → Features (see `src/app/super-admin/clinics/[id]/page.tsx`).
3. In the page that renders the tab/section:
   - Derive the flag with `getClinicFeatureBoolean(patient.clinic?.features, 'YOUR_KEY', default)` (or from clinic from API if no patient).
   - Pass it into the child component; do not hardcode `true`/`false`.
   - If the section is URL-driven (e.g. `?tab=x`), include that tab in `validTabs` only when the feature is enabled.

## Related docs

- **Labs tab not showing:** `docs/WHY_LABS_TAB_NOT_SHOWING.md`
- **Enabling Labs per clinic:** `docs/BLOODWORK_LABS_ENTERPRISE_ANALYSIS.md` §10
