# Enterprise Tenant Uniformity — Labs Tab Missing on ot.eonpro.io

**Problem:** Labs tab appears for eonmeds.eonpro.io and wellmedr.eonpro.io but not for ot.eonpro.io. Same deployment. Tenant config drift or tenant resolution mismatch.

**Goal:** Prove the exact conditional, fix, and add guardrails so Labs defaults uniformly for all clinics unless explicitly disabled.

**Date:** 2026-02-10

---

## Phase 1 — Visibility Gate (LOCATED)

### Exact Conditional

**File:** `src/app/patients/[id]/page.tsx` (lines ~384–389)

```ts
showLabsTab = getClinicFeatureBoolean(
  patientWithDecryptedPHI.clinic?.features,
  'BLOODWORK_LABS',
  true
);
```

**Logic:** `getClinicFeatureBoolean` in `src/lib/clinic/utils.ts` — **only explicit `false` hides**; missing/undefined/true → visible.

**Source:** `patient.clinic` (clinic the patient belongs to), not request/subdomain.

---

## Phase 2 — Runtime Instrumentation (Proof Path)

**Endpoint:** `GET /api/diagnostics/tenant?patientId=3957` (super_admin only)

**Returns:**
- `host`, `domain`, `resolvedClinicId`
- `patientProof` (when `?patientId=` provided):
  - `patient.id`, `patient.clinicId`, `patient.clinic.subdomain`, `patient.clinic.customDomain`
  - `patient.clinic.features_BLOODWORK_LABS`: `{ raw, rawType, evaluated }`
  - `resolved.features_BLOODWORK_LABS`: `{ raw, rawType, evaluated }`
  - `crossTenant`: `patient.clinicId !== resolvedClinicId`
  - `verdict`: computed root cause (see below)
- `resolved`: clinic from host, `BLOODWORK_LABS: { raw, rawType, evaluated }`
- `buildId`, `gitSha`, `timestamp`

**Verdicts:**
| verdict | Meaning |
|---------|---------|
| `CROSS_TENANT` | patient.clinicId ≠ resolvedClinicId — cross-tenant view (super_admin only can do this) |
| `CONFIG_DRIFT` | patient.clinicId=8, BLOODWORK_LABS raw=false → Labs hidden |
| `MISSING_KEY` | BLOODWORK_LABS missing → default true, Labs should show |
| `NO_ISSUE` | BLOODWORK_LABS=true → Labs should show |

**Execute proof path:**
```bash
# With super_admin Bearer token, from ot.eonpro.io:
curl -H "Authorization: Bearer $TOKEN" "https://ot.eonpro.io/api/diagnostics/tenant?patientId=3957"
```

**Usage:** Call from ot.eonpro.io, eonmeds.eonpro.io, wellmedr.eonpro.io to compare.

---

## Phase 3 — DB Truth Check

**Script:** `scripts/dump-clinic-features-3-7-8.ts`

**Usage:**
```bash
npx tsx scripts/dump-clinic-features-3-7-8.ts
npx tsx scripts/dump-clinic-features-3-7-8.ts --all
```

**Output:** id, name, subdomain, customDomain, status, `BLOODWORK_LABS` raw value, feature keys.

---

## Phase 4 — Root Cause & Fix

### Root Cause

Clinic 8 (ot.eonpro.io) had `BLOODWORK_LABS: false` or missing key in `clinic.features`, causing `getClinicFeatureBoolean(..., 'BLOODWORK_LABS', true)` to evaluate to false when explicitly false, or to default to true when missing (but if stored as false, it hides).

**Fix:**
- Migration: `prisma/migrations/20260210000000_bloodwork_labs_uniformity/migration.sql` — sets `BLOODWORK_LABS=true` for all ACTIVE clinics where null or false.
- Run: `npx prisma migrate deploy`

---

## Phase 5 — Guardrails

### 1. Single Source of Truth

**File:** `src/lib/clinic/feature-defaults.ts`

- `DEFAULT_CLINIC_FEATURES` — central defaults (BLOODWORK_LABS: true, etc.)
- `FEATURE_DEFAULTS_VERSION` — optional stamp

### 2. Super-Admin Sync Action

**Endpoint:** `POST /api/super-admin/clinics/[id]/sync-feature-defaults`

- Merges missing keys only; does **not** overwrite explicit `false`.
- UI: "Sync Default Features" button on super-admin clinic Features tab.

### 3. Script

**File:** `scripts/ensure-clinic-feature-defaults.ts`

- Uses `DEFAULT_CLINIC_FEATURES` from `feature-defaults.ts`.
- Run: `npx tsx scripts/ensure-clinic-feature-defaults.ts` or `--dry-run`.

### 4. Regression Test

**File:** `tests/tenant-isolation/clinic-feature-defaults.test.ts`

- `getClinicFeatureBoolean` defaults (null, undefined, missing, explicit true/false).
- `DEFAULT_CLINIC_FEATURES` includes BLOODWORK_LABS and has only boolean values.
- DB regression: every ACTIVE clinic has all DEFAULT_CLINIC_FEATURES keys (run with `RUN_CLINIC_FEATURE_DB_REGRESSION=1` against a real DB).

---

## Root Cause Verdict (Proof Path Output)

After calling `GET /api/diagnostics/tenant?patientId=3957` from ot.eonpro.io as super_admin:

1. **Exact values returned:** `host`, `resolvedClinicId`, `patient.id`, `patient.clinicId`, `patient.clinic.subdomain`, `patient.clinic.customDomain`, `patient.clinic.features_BLOODWORK_LABS`, `resolved.features_BLOODWORK_LABS`, `crossTenant`, `verdict`.

2. **If crossTenant:** Super_admin can view any patient; access control uses `user.clinicId` (session), not host. Non-super_admin cannot view cross-tenant patients (prisma filters by clinicId). No fix required unless super_admin cross-clinic view by host should be restricted.

3. **If patient.clinicId=8 and BLOODWORK_LABS raw=false:** Run `npx tsx scripts/ensure-clinic-feature-defaults.ts` or Super-admin → clinic 8 → Sync Default Features. Regression test: `RUN_CLINIC_FEATURE_DB_REGRESSION=1 npm run test -- tests/tenant-isolation/clinic-feature-defaults.test.ts`.

---

## Summary

| Item | Location |
|------|----------|
| Visibility gate | `getClinicFeatureBoolean(clinic.features, 'BLOODWORK_LABS', true)` in patients/[id]/page.tsx |
| Feature defaults | `src/lib/clinic/feature-defaults.ts` |
| Sync endpoint | `POST /api/super-admin/clinics/[id]/sync-feature-defaults` |
| Sync UI | Super-admin clinic Features tab |
| Ensure script | `scripts/ensure-clinic-feature-defaults.ts` |
| Diagnostics | `GET /api/diagnostics/tenant` |
