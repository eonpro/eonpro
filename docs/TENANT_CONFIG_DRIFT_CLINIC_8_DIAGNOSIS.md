# Tenant Config Drift Diagnosis — Clinic 8 Not Showing Patient Profile Tab

**Problem:** Clinic 8 (ot.eonpro.io) does not show the new Patient Profile tab. Clinics 3 and 7 do. All served from same deployment.

**Verified platform mapping (2026-02-10):**
| Domain | Clinic ID | Name |
|--------|-----------|------|
| eonmeds.eonpro.io | 3 | EONMeds |
| wellmedr.eonpro.io | 7 | Wellmedr LLC |
| ot.eonpro.io | 8 | Overtime Mens Health |

**Date:** 2026-02-10

---

## Phase 1 — Tab Render Logic & Visibility Conditions

### Provider Patient Detail Page (`/patients/[id]`)

| Tab ID | Label | Visibility Condition | File:Line |
|--------|-------|----------------------|-----------|
| `profile` | Profile | **Always shown** | PatientSidebar.tsx:40-41 |
| `lab` | Labs | `getClinicFeatureBoolean(clinic.features, 'BLOODWORK_LABS', true)` — **only conditional tab** | page.tsx:377-381 |
| `intake` | Intake | Always shown | PatientSidebar.tsx:42 |
| Others | ... | Always shown | PatientSidebar.tsx:43-50 |

### Patient Profile Section (inside Intake tab)

`PatientIntakeView` selects sections by `effectiveSubdomain`:

| Condition | Logic | File |
|-----------|-------|------|
| Wellmedr | `hasCustomIntakeSections('wellmedr')` → WELLMEDR_INTAKE_SECTIONS | wellmedr/intakeSections.ts |
| Overtime | `hasOvertimeIntakeSections('ot')` → getOvertimeIntakeSections() | overtime/intakeSections.ts |
| Default | Otherwise → DEFAULT_INTAKE_SECTIONS | PatientIntakeView.tsx:61 |

**Source of subdomain:** `patient.clinic?.subdomain` + `fallbackSubdomainForSections` (from `resolveFallbackSubdomain`).

**Fallback logic (page.tsx:47-60):** When `patient.clinic` is null or subdomain missing, uses env:
- `clinicId === OVERTIME_CLINIC_ID` → `'ot'`
- `clinicId === WELLMEDR_CLINIC_ID` → `'wellmedr'`

**CRITICAL:** `OVERTIME_CLINIC_ID` should be 8 (OT on ot.eonpro.io). `OVERTIME_EONMEDS_CLINIC_ID` is for a separate OT-on-eonmeds.io instance if it exists.

### All Conditional Branches

| File | Line | Condition | Effect |
|------|------|-----------|--------|
| page.tsx | 377-381 | `BLOODWORK_LABS === false` | Hides Labs tab |
| page.tsx | 47-60 | `OVERTIME_CLINIC_ID`, `WELLMEDR_CLINIC_ID` | Fallback subdomain for intake sections |
| PatientIntakeView.tsx | 813-823 | `hasCustomIntakeSections` / `hasOvertimeIntakeSections` | Section set selection |
| wellmedr/intakeSections.ts | 770 | `subdomain === 'wellmedr'` | Wellmedr sections |
| overtime/intakeSections.ts | 1163 | `subdomain === 'ot'` | OT sections |

---

## Phase 2 — Clinic 8 vs 3 vs 7 Data

### DB Fields to Compare

| Field | Purpose |
|-------|---------|
| `subdomain` | **@unique** — clinic 8 (OT) has `'ot'`; clinic 7 (Wellmedr) has `'wellmedr'` |
| `customDomain` | ot.eonpro.io → clinic 8 has customDomain portal.otmens.com |
| `features` (JSON) | `BLOODWORK_LABS: false` hides Labs tab |
| `settings` | UI/themes; no tab gating found |
| `billingPlan` | No tab gating in code |
| `status` | Must be ACTIVE for resolution |

### Verification Queries

```sql
-- Compare clinics 3, 7, 8
SELECT id, name, subdomain, customDomain, status,
       features::text, billingPlan
FROM "Clinic"
WHERE id IN (3, 7, 8);

-- Clinic 8 features.BLOODWORK_LABS
SELECT id, features->>'BLOODWORK_LABS' as bloodwork_labs
FROM "Clinic" WHERE id = 8;
```

### Key Constraint

**Clinic.subdomain is @unique.** Clinic 8 (Overtime) has `subdomain = 'ot'` and `customDomain = portal.otmens.com`. ot.eonpro.io resolves to clinic 8.

---

## Phase 3 — Feature Flag / Settings Audit

### clinic.features (JSON, DB)

| Key | Default | Effect |
|-----|---------|--------|
| BLOODWORK_LABS | true | Hides Labs tab when explicitly false |

No other feature flags gate Profile tab or Patient Profile section.

### Missing Migration Risk

If clinic 8 was created before `BLOODWORK_LABS` was introduced, and its `features` JSON was never updated:
- `getClinicFeatureBoolean(features, 'BLOODWORK_LABS', true)` returns `true` when key is missing
- So Labs tab would still show

**Only explicit `BLOODWORK_LABS: false`** hides the Labs tab.

---

## Phase 4 — Permission Context

- Patient detail page uses `getUserFromCookies()` and `runWithClinicContext(clinicId)`.
- No `requirePermission` or PermissionContext gates the Profile tab or Patient Profile section.
- RBAC does not control tab visibility on the patient detail page.

---

## Phase 5 — Root Cause, Fix, Guardrail

### A) Exact Conditional Causing Tab to Hide for Clinic 8

**If "Patient Profile tab" = Labs tab (bloodwork):**
- `clinic.features.BLOODWORK_LABS === false` for clinic 8
- **Fix:** Set `BLOODWORK_LABS: true` in clinic 8 features (migration or super-admin UI).

**If "Patient Profile tab" = Patient Profile section inside Intake:**
- Clinic 8 has `subdomain ≠ 'ot'` (platform shows clinic 8 has subdomain 'ot'; verify DB).
- `OVERTIME_CLINIC_ID` env not set or wrong; clinic 8 (OT) gets no fallback.
- When `patient.clinic.subdomain` is e.g. `'otmens'`, `hasOvertimeIntakeSections('otmens')` = false.
- Falls through to DEFAULT_INTAKE_SECTIONS — which **includes** Patient Profile.
- So Patient Profile section should still appear.

**Conclusion:** Most likely cause is **BLOODWORK_LABS: false** for clinic 8 (Labs tab hidden). If a different tab is meant, clinic 8's `features` JSON may have an unintended `false` for a flag.

### B) Root Cause

1. **Clinic 8 features.BLOODWORK_LABS = false** — Labs tab hidden.
2. **Clinic 8 missing from OVERTIME fallback** — If OVERTIME_CLINIC_ID not set or wrong, no fallback for patient.clinic null; however, default sections still include Patient Profile.
3. **Clinic 8 subdomain/config mismatch** — verify customDomain (portal.otmens.com) for OT.

### C) Fix

**Immediate (DB):**

```sql
-- Ensure clinic 8 has BLOODWORK_LABS enabled
UPDATE "Clinic"
SET features = jsonb_set(
  COALESCE(features::jsonb, '{}'::jsonb),
  '{BLOODWORK_LABS}',
  'true'
)
WHERE id = 8 AND (features->>'BLOODWORK_LABS')::boolean IS FALSE;
```

**Config:**

- Ensure clinic 8 has correct customDomain (portal.otmens.com).
- Set `OVERTIME_CLINIC_ID=8` in production — clinic 8 is OT on ot.eonpro.io.

**Migration/seed for guardrail:**

- Run `npx tsx scripts/ensure-clinic-feature-defaults.ts` to merge missing defaults.

### D) Guardrail — New Features Default ON Consistently

1. **Script:** `scripts/ensure-clinic-feature-defaults.ts` — for each ACTIVE clinic, merge BLOODWORK_LABS (and future defaults) when key is missing. Run after deploy: `npx tsx scripts/ensure-clinic-feature-defaults.ts`
2. **Env:** Set `OVERTIME_CLINIC_ID=8` and `WELLMEDR_CLINIC_ID=7` in production (verified from /api/clinic/resolve).
3. **Test:** `tests/tenant-isolation/patient-profile-section-consistency.test.ts` asserts all intake configs include Patient Profile section.
4. **Super-admin:** When creating a new clinic, pre-populate `features` with defaults from `api/admin/clinic/features` DEFAULT_FEATURES.
