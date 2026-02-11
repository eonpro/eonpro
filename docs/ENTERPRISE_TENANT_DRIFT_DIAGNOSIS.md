# Enterprise Tenant Drift Diagnosis — UI Not Updating for One Subdomain

**Problem:** Clinic #8 (ot.eonpro.io) was reported missing a "Patient Profile" tab that appears for other clinics (#3, #7).

**Verified platform IDs (2026-02-10):** EONMeds=3, Wellmedr=7, Overtime=8.

**Date:** 2026-02-10

---

## Executive Summary

After full codebase analysis, the most likely root causes (ranked) are:

1. **Clinic #8 subdomain mismatch or patient.clinic null** — patient detail page passes `patient.clinic?.subdomain` to PatientIntakeView; if clinic 8's DB row has wrong subdomain or patient.clinic isn't loaded, intake sections differ.
2. **Clinic #8 features JSON** — `BLOODWORK_LABS: false` hides Labs tab (not Profile); no other feature flag controls Profile. Unlikely direct cause.
3. **Stale cached JS/CDN** — ot.eonpro.io serving older build. Single Vercel project; same codebase. Cache keyed without host could serve wrong build.
4. **JWT/clinic mismatch** — User logged in on another subdomain; JWT has wrong clinicId; middleware uses JWT clinic. See `docs/OT_CLINIC_SUBDOMAIN_DIAGNOSIS_AND_PLAN.md`.

---

## Phase 1 — Patient Profile Tab Visibility Conditions

### Tab Structure (PatientSidebar + patients/[id]/page.tsx)

| Tab ID | Label | Visibility Condition | File:Line |
|--------|-------|----------------------|-----------|
| `profile` | Profile | **Always shown** — first in navItems | PatientSidebar.tsx:40 |
| `lab` | Labs | `showLabsTab` from `getClinicFeatureBoolean(patient.clinic?.features, 'BLOODWORK_LABS', true)` | page.tsx:357-362 |
| `intake` | Intake | Always shown | PatientSidebar.tsx:42 |
| `prescriptions` | Prescriptions | Always shown | PatientSidebar.tsx:43 |
| `soap-notes` | Soap Notes | Always shown | PatientSidebar.tsx:44 |
| `progress` | Progress | Always shown | PatientSidebar.tsx:45 |
| `photos` | Photos | Always shown | PatientSidebar.tsx:46 |
| `billing` | Invoices | Always shown | PatientSidebar.tsx:47 |
| `chat` | Chat | Always shown | PatientSidebar.tsx:48 |
| `documents` | Documents | Always shown | PatientSidebar.tsx:49 |
| `appointments` | Appointments | Always shown | PatientSidebar.tsx:50 |

**Only conditional tab:** Labs (BLOODWORK_LABS feature flag).

### "Patient Profile" as Intake Section (inside Intake tab)

Within the Intake tab, `PatientIntakeView` renders sections. The "Patient Profile" **section** is controlled by:

| Condition | Logic | File:Line |
|-----------|-------|-----------|
| `hasCustomIntakeSections(clinicSubdomain)` | `clinicSubdomain?.toLowerCase() === 'wellmedr'` → WELLMEDR_INTAKE_SECTIONS (includes Patient Profile) | wellmedr/intakeSections.ts:530 |
| `hasOvertimeIntakeSections(clinicSubdomain)` | `clinicSubdomain?.toLowerCase() === 'ot'` → getOvertimeIntakeSections() (BASE_SECTIONS includes Patient Profile) | overtime/intakeSections.ts:788 |
| Default | DEFAULT_INTAKE_SECTIONS (includes Patient Profile) | PatientIntakeView.tsx:59 |

**Source of clinicSubdomain:** `patientWithDecryptedPHI.clinic?.subdomain` (page.tsx:1009).

**CRITICAL:** If `patient.clinic` is null or `patient.clinic.subdomain` is not exactly `'ot'` (case-insensitive), OT-specific intake sections are not used. Default sections still include Patient Profile.

---

## Phase 2 — Tenant Resolution for ot.eonpro.io

### Subdomain → ClinicId Flow

1. **Login** — `/api/auth/login` extracts subdomain from `Host` via `extractSubdomain(host)`. For `ot.eonpro.io` → `ot`. Resolves clinic via `basePrisma.clinic.findFirst({ where: { subdomain: { equals: 'ot', mode: 'insensitive' }, status: 'ACTIVE' } })`.
2. **JWT** — Built with `clinicId: activeClinicId`. If resolve found clinic 8 (OT), JWT has clinicId 8.
3. **Auth middleware** — Uses JWT's clinicId. Subdomain override only when `userHasAccessToClinic(user, subdomainClinicId)`; then `effectiveClinicId = subdomainClinicId`.
4. **Patient page** — Uses `getUserFromCookies()` → user; `runWithClinicContext(clinicId)` where clinicId = user.clinicId (or undefined for super_admin). Patient fetched includes `clinic: { id, subdomain, name, features }`.

### Verification Checklist (run on ot.eonpro.io)

```bash
# 1. Resolve clinic for domain
curl -s 'https://ot.eonpro.io/api/clinic/resolve?domain=ot.eonpro.io' | jq .

# Expected: clinicId: 8, subdomain: "ot", name: "Overtime Mens Health"

# 2. DB check
# SELECT id, name, subdomain, status, features FROM "Clinic" WHERE id = 8;

# 3. Version/build consistency (after fix deployed)
curl -s 'https://ot.eonpro.io/api/version' | jq .
```

---

## Phase 3 — Deployment / Environment Drift

### Vercel Configuration

- **vercel.json:** Single `buildCommand: npm run vercel-build`. No domain-specific build.
- **Domains:** All `*.eonpro.io` should point to same Vercel project. Check: Vercel → Project → Settings → Domains.
- **Branch:** Production deploy from `main`. No branch-specific aliases for ot.eonpro.io.

### Verification Steps

1. Vercel project: confirm ot.eonpro.io, app.eonpro.io, wellmedr.eonpro.io all in same project.
2. After deploy: `curl -s https://ot.eonpro.io/api/version` and `curl -s https://app.eonpro.io/api/version` — compare `buildId` and `commit`.
3. Env: `NEXT_PUBLIC_*` and feature flags are project-level, not per-domain.

---

## Phase 4 — Caching / CDN / Service Worker

### Mechanisms

| Layer | Behavior | Subdomain Impact |
|-------|----------|------------------|
| Next.js static | `/_next/static/*` — immutable paths with build hash | Same build = same hash. Different build = different hash. If ot.eonpro.io served from different deployment, different hash. |
| CDN (Vercel) | Cache by path. Host may affect cache key. | If host not in key, one domain could serve another's cached response. |
| `/api/clinic/resolve` | `Cache-Control: no-store` | No cache. |
| Service worker | None found in codebase | N/A. |

### Recommendation

Ensure Vercel project uses single production deployment for all domains. No preview/branch aliases for ot.eonpro.io.

---

## Phase 5 — Tenant-Scoped Config / Feature Flags

### Clinic.features (JSON, DB)

- **BLOODWORK_LABS** — Controls Labs tab. Default true. Only explicit `false` hides.
- No feature flag for Profile tab or Patient Profile section.

### Intake Section Selection

- **Wellmedr:** subdomain `wellmedr` → WELLMEDR_INTAKE_SECTIONS.
- **OT:** subdomain `ot` → getOvertimeIntakeSections(treatmentType).
- **Default:** All other clinics.

All three include a "Patient Profile" section. **Missing Patient Profile section is only possible if `activeSections` is empty or filtered unexpectedly** — no such logic exists.

---

## Phase 6 — Root Cause, Fix, Guardrail

### A) Root Causes (Ranked)

| # | Cause | Likelihood | Evidence |
|---|-------|------------|----------|
| 1 | **patient.clinic null for clinic 8 patients** | High | Query uses `include: { clinic: { select: {...} } }`. If Patient.clinicId wrong or clinic deleted, clinic is null. Then clinicSubdomain undefined → default sections (still have Patient Profile). **Unless** the user means the main Profile *tab* (sidebar) is missing — then different cause. |
| 2 | **Clinic 8 subdomain ≠ 'ot' in DB** | Medium | `hasOvertimeIntakeSections` requires exact match. Subdomain `overtime` or `OT` (stored) vs `ot` (expected) — case-insensitive match should work. Verify `SELECT subdomain FROM "Clinic" WHERE id = 7`. |
| 3 | **Stale JS / wrong deployment** | Medium | Same codebase; if ot.eonpro.io pointed to preview or old prod, would serve different JS. Add `/api/version` to confirm. |
| 4 | **JWT clinic mismatch** | Medium | User logged in on app.eonpro.io; opens ot.eonpro.io without re-login. JWT has other clinic. Patient list filtered by user.clinicId — but if super_admin or provider with multi-clinic, could see clinic 8 patients. Patient page uses patient's clinic for intake sections, not user's. So this wouldn't directly hide Profile tab. |
| 5 | **Different "Profile" meaning** | Low | User might mean: Profile tab content differs (e.g. WeightProgressSummary, PatientPrescriptionSummary), or a different UI element. Clarify with user. |

### B) Exact Fix

**Immediate:**

1. **Verify clinic 8 DB:** `subdomain = 'ot'` (or `'OT'`), `status = 'ACTIVE'`.
2. **Verify patient.clinic:** For a clinic 8 patient, ensure `patient.clinic` is populated. Run:
   ```sql
   SELECT p.id, p."clinicId", c.subdomain, c.name
   FROM "Patient" p
   LEFT JOIN "Clinic" c ON c.id = p."clinicId"
   WHERE p."clinicId" = 8 LIMIT 5;
   ```
3. **Force re-login on ot.eonpro.io:** Clear cookies, visit https://ot.eonpro.io/login, log in. Ensures JWT has clinicId 8.
4. **Hard refresh:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows) to bypass cache.

**If issue persists — defensive code:**

- In PatientIntakeView, when `clinicSubdomain` is null but `patient.clinicId` is 8, explicitly use OT sections (fallback via OVERTIME_CLINIC_ID=8).

### C) Guardrail

1. **`/api/version` endpoint** — Returns `buildId`, `commit`, `clinicId` (from request context), `subdomain` for consistency checks.
2. **Migration/seed** — Ensure all clinics with subdomain `ot` have consistent `features` (e.g. BLOODWORK_LABS defaults).
3. **Automated test** — `tests/tenant-isolation/patient-profile-section-consistency.test.ts` asserts all intake configs (Wellmedr, Overtime, default) include a "Patient Profile" section. Run: `npx vitest run tests/tenant-isolation/patient-profile-section-consistency.test.ts`
