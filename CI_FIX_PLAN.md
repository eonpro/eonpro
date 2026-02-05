# CI/CD Pipeline Fix Plan

**Date**: February 5, 2026  
**Status**: In Progress  
**Goal**: Get CI pipeline passing for production deployment

---

## Executive Summary

The CI pipeline has multiple blocking issues that need to be resolved before deployment:
1. ~~TypeScript errors (37+ errors)~~ **FIXED**
2. ~~Migration conflict (AppointmentType)~~ **FIXED**
3. Missing GitHub Secret (`DIRECT_DATABASE_URL`) - **REQUIRES ADMIN ACTION**
4. Security scan blocking findings (19 issues) - **REQUIRES REVIEW**

---

## Completed Fixes

### 1. TypeScript Errors (FIXED)

**Files Modified:**
- `src/app/api/admin/affiliates/[id]/route.ts` - Fixed orderId reference
- `src/app/api/admin/affiliates/applications/[id]/approve/route.ts` - Fixed Prisma transaction typing
- `src/app/api/admin/affiliates/fraud-queue/route.ts` - Fixed FraudResolutionAction enum values
- `src/app/api/admin/affiliates/route.ts` - Fixed Prisma transaction typing
- `src/app/api/admin/data-integrity/route.ts` - Fixed null check pattern
- `src/app/api/admin/fix-orphaned-patients/route.ts` - Fixed null check pattern
- `src/app/api/admin/patient-photos/[id]/verify/route.ts` - Fixed audit log field names
- `src/app/api/admin/patients/[id]/sales-rep/route.ts` - Fixed salesRep include
- `src/app/api/admin/refill-queue/[id]/approve/route.ts` - Fixed notes parameter type
- `src/app/api/admin/regenerate-patient-docs/route.ts` - Fixed Buffer type handling
- `src/app/api/admin/setup-wellmedr-clinic/route.ts` - Fixed Clinic create fields
- `src/app/api/admin/sync-stripe-profiles/route.ts` - Fixed limit parameter type
- `src/app/api/affiliate/account/route.ts` - Removed non-existent totalEarnings field
- `src/app/api/affiliate/commissions/route.ts` - Removed promoCode from select
- `src/app/api/affiliate/dashboard/route.ts` - Calculate totalEarnings from Commission table
- `src/app/api/affiliate/earnings/route.ts` - Calculate totalEarnings from Commission table
- `src/app/api/affiliate/trends/route.ts` - Fixed nullable bigint types
- `src/app/api/affiliate/withdraw/route.ts` - Fixed AffiliatePayoutMethod field names

**Common Patterns Fixed:**
1. `prisma.$transaction(async (tx: typeof prisma) => ...)` → `prisma.$transaction(async (tx: Prisma.TransactionClient) => ...)`
2. `clinicId: { equals: null }` → `clinicId: null`
3. Non-existent model fields removed and calculated from related tables
4. Enum values aligned with Prisma schema

### 2. Migration Conflict (FIXED)

**Issue:** The `_template` migration folder was being picked up by Prisma, and the `20241219_scheduling_system` migration had a naming conflict between an ENUM and TABLE both named `AppointmentType`.

**Fix:**
- Moved `prisma/migrations/_template` to `prisma/migration_template`
- Renamed `AppointmentType` enum to `AppointmentModeType` in the migration SQL (aligning with schema)

### 3. Security Credential Exposure (FIXED)

**CRITICAL:** Production database passwords were committed to the repository.

**Files Fixed:**
- `scripts/check-messages-tmp.ts` - Removed hardcoded DATABASE_URL
- `setup-database.js` - Removed hardcoded DATABASE_URL fallback and default admin password

**ACTION REQUIRED:** 
- Rotate the exposed database passwords immediately
- Previous passwords exposed:
  - `398Xakf$57` (check-messages-tmp.ts)
  - `3lvzN)sk8EBgPR4z]TyR2AUn~_4m` (setup-database.js)

---

## Remaining Issues (Require Admin/Manual Action)

### 4. Missing GitHub Secret: `DIRECT_DATABASE_URL`

**Status:** Blocking CI  
**Required Action:** Add to GitHub repository secrets

The Prisma schema uses `directUrl` for migrations, which requires a direct PostgreSQL connection (not pooled).

**Configuration:**
```
# GitHub Secret: DIRECT_DATABASE_URL
# Format: postgresql://username:password@host:5432/database?sslmode=require
#
# For AWS Aurora:
# - Use port 5432 (direct connection)
# - NOT port 6543 (pooled connection)
#
# Example:
# postgresql://postgres:PASSWORD@eonpro-production.cluster-xxx.us-east-2.rds.amazonaws.com:5432/eonpro?sslmode=require
```

### 5. Security Scan Findings (19 blocking)

**Status:** Blocking CI  
**Required Action:** Review and remediate or add to ignore list

**Findings:**

| File | Issue | Severity | Recommendation |
|------|-------|----------|----------------|
| `docker/nginx/nginx.conf` | H2C smuggling conditions | Medium | Review WebSocket config, restrict Upgrade headers |
| `docker/nginx/nginx.conf` | $host variable usage | Low | Consider using explicit server_name |
| `scripts/pre-migrate.js` | child_process with variable | Low | False positive - internal script, not user input |
| `setup-database.js` | bcrypt hash detected | Low | Removed in latest fix |
| `src/app/api/admin/integrations/route.ts` | GCM no tag length | Medium | Add authTagLength to createDecipheriv |
| `src/components/EditPatientForm.tsx` | setTimeout with redirect | Low | False positive - controlled redirect |

**To suppress false positives, add a `.semgrepignore` file:**
```
# Internal scripts - no user input
scripts/pre-migrate.js
scripts/check-health.js

# Controlled redirects
src/components/EditPatientForm.tsx
```

---

## CI Workflow Fixes Applied

### Node.js Memory for TypeScript

Added to `.github/workflows/ci.yml`:
```yaml
- name: Run TypeScript type check
  run: npm run type-check
  env:
    NODE_OPTIONS: '--max-old-space-size=8192'
```

### DIRECT_DATABASE_URL in CI

Added to all database-using jobs in CI workflows:
```yaml
env:
  DATABASE_URL: postgresql://test:test@localhost:5432/test_db
  DIRECT_DATABASE_URL: postgresql://test:test@localhost:5432/test_db
```

---

## Deployment Checklist

Before deploying to production:

- [x] Fix TypeScript errors
- [x] Fix migration conflict
- [x] Remove hardcoded credentials
- [ ] **Rotate exposed database passwords**
- [ ] **Add `DIRECT_DATABASE_URL` to GitHub Secrets**
- [ ] Review/remediate security scan findings
- [ ] Verify CI passes on main branch
- [ ] Run pre-deploy checks
- [ ] Deploy to staging first
- [ ] Verify staging functionality
- [ ] Deploy to production

---

## Commits Made

1. `fix: resolve TypeScript errors for CI pipeline` - Initial TypeScript fixes
2. `security: Remove hardcoded database credentials` - Critical security fix
3. `fix(ci): Increase Node.js memory and add DIRECT_DATABASE_URL` - CI workflow fixes
4. `fix: Resolve remaining TypeScript errors in affiliate and admin routes` - Comprehensive TypeScript fixes
5. `fix(migrations): Resolve AppointmentType enum/table naming conflict` - Migration fixes

---

## Contact

For questions about this fix plan, contact the development team.
