# Enterprise Incident: Tenant Feature Flag Inconsistency (Labs Tab Missing)

**Incident:** Labs tab missing on ot.eonpro.io patient page  
**Date:** 2026-02-11  
**Status:** Resolved — Root cause: per-tenant BLOODWORK_LABS=false for clinic 8

---

## Phase 1 — Database Fingerprinting

### Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/diagnostics/db-fingerprint` | super_admin | Datasource hash, db identity, pg_is_in_recovery, migrations |
| `GET /api/diagnostics/tenant-runtime?patientId=X` | super_admin | Tenant resolution + patient proof + showLabsTab + dbFingerprintRef |
| `GET /api/diagnostics/tenant?patientId=X` | super_admin | Same + verdict (includes dbFingerprintRef) |

### How to Prove DB Drift

1. Call from app.eonpro.io (super-admin):
   ```bash
   curl -H "Authorization: Bearer $TOKEN" "https://app.eonpro.io/api/diagnostics/db-fingerprint"
   ```
2. Call from ot.eonpro.io:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" "https://ot.eonpro.io/api/diagnostics/db-fingerprint"
   ```
3. Compare `datasource.hash`, `dbIdentity.current_database`, `is_read_replica`.
4. If hashes differ → different DBs / env drift. Fix: ensure same DATABASE_URL.

---

## Phase 2 — Tenant Runtime Proof

Call tenant-runtime with patientId:
```bash
curl -H "Authorization: Bearer $TOKEN" "https://ot.eonpro.io/api/diagnostics/tenant-runtime?patientId=3957"
```

Returns:
- `host`, `resolvedClinicId`, `resolvedClinicRow` (features.BLOODWORK_LABS raw+type)
- `patientProof`: patient.id, patient.clinicId, patient.clinic, showLabsTab
- `crossTenant`: patient.clinicId !== resolvedClinicId
- `dbFingerprintRef`: same hash as db-fingerprint

---

## Phase 3 — Clinic Identity Audit

```bash
npx tsx scripts/audit-clinic-identity.ts
```

Prints all ACTIVE clinics with BLOODWORK_LABS value. Collision report:
- same customDomain across rows
- same subdomain across rows
- same name across rows

---

## Phase 4 — Patient Ownership Proof

```bash
npx tsx scripts/patient-owner-proof.ts <patientId>
```

Prints patient.clinicId, clinic row, BLOODWORK_LABS raw+type, showLabsTab evaluated.

---

## Phase 5 — Caching (Finding)

**No clinic.features cache found.** Redis is used for:
- Rate limiting
- Notifications count
- Presence (websocket)

Patient page fetches `patient` with `include: { clinic: { features } }` — direct Prisma, no cache. Tenant resolution (resolveClinic) is direct DB. **Cache is not the root cause.**

---

## Phase 6 — Fix (Deterministic)

| Case | Fix |
|------|-----|
| **A: Different datasource hashes** | Ensure ot.eonpro.io and app.eonpro.io use same DATABASE_URL. If read replica: writes hit primary; add warning when pg_is_in_recovery=true. |
| **B: Duplicate clinic rows** | Fix domain mapping. Add unique constraint on customDomain (schema has it). |
| **C: patient.clinic has BLOODWORK_LABS=false** | Run `npx tsx scripts/ensure-clinic-feature-defaults.ts` or Super-admin → Sync Default Features for that clinic. |
| **D: Cache stale** | N/A — no clinic feature cache. |

---

## Phase 7 — Guardrails Implemented

1. **db-fingerprint**: Super-admin can verify which DB each surface uses.
2. **tenant-runtime**: Patient proof + showLabsTab + dbFingerprintRef.
3. **Read-replica alert**: sync-feature-defaults logs warning when pg_is_in_recovery=true.
4. **audit-clinic-identity.ts**: Collision detection for duplicate domains/names.
5. **patient-owner-proof.ts**: Patient ownership and BLOODWORK_LABS proof.
6. **Regression test**: `RUN_CLINIC_FEATURE_DB_REGRESSION=1 npm run test -- tests/tenant-isolation/clinic-feature-defaults.test.ts`

---

## Root Cause (Confirmed)

- Labs visibility: `patient.clinic.features.BLOODWORK_LABS` (getClinicFeatureBoolean, default true).
- ot.eonpro.io resolves to clinic 8 (Overtime).
- Only `BLOODWORK_LABS === false` hides the tab.
- **Clinic 8 had BLOODWORK_LABS: false** → Labs hidden.
- Fix: Set BLOODWORK_LABS=true via migration or sync-feature-defaults.
