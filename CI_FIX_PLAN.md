# CI/CD Pipeline Fix Plan

**Date**: February 5, 2026  
**Status**: Partially Fixed - Pre-existing TypeScript Errors Remain  
**Goal**: Get CI pipeline passing for production deployment

---

## Current Status

| Pipeline | Status | Issue |
|----------|--------|-------|
| **Security Scan** | ✅ Passing (0 blocking) | All findings resolved via code fixes and .semgrepignore |
| **TypeScript Check** | ❌ Failing (341 errors) | Pre-existing type errors across codebase |
| **Migration Validation** | ❌ Failing | Migration SQL parsing issue |
| **Pre-Deployment Check** | ⏸️ Blocked | 4 failed migrations need manual resolution |
| **Deploy Pipeline** | ⏸️ Waiting | Blocked by CI failures |

---

## Recent Fixes Applied

### Session 1: Initial Fixes
- Fixed Prisma transaction typing (`tx: Prisma.TransactionClient`)
- Fixed enum mismatches (FraudResolutionAction)
- Removed non-existent fields (totalEarnings, orderId)
- Fixed null check patterns for nullable fields

### Session 2: Security & Migration Fixes
- Removed hardcoded production credentials from scripts
- Fixed migration ordering (`20241219` → `20251129`)
- Renamed AppointmentType enum to AppointmentModeType to avoid conflict
- Moved `_template` migration folder out of migrations directory

### Session 3: Security Scan & TypeScript Cleanup
- Fixed H2C smuggling in nginx (both /socket.io/ and default location)
- Added explicit `authTagLength: 16` to all GCM crypto operations
- Created comprehensive `.semgrepignore` for false positives
- Exported `Prisma` namespace from `@/lib/db` for TransactionClient type
- Removed invalid `clinicId: null` queries (Patient.clinicId is now required)
- Updated deprecated endpoints (fix-orphaned-patients, setup-default-clinic)

---

## Security Scan Resolution (COMPLETE)

**From 19 blocking → 0 blocking findings**

| Finding | File | Resolution |
|---------|------|------------|
| H2C Smuggling | `docker/nginx/nginx.conf` | Added websocket-only Upgrade header forwarding |
| GCM Tag Length | Multiple crypto files | Added `authTagLength: 16` to cipher operations |
| child_process | `scripts/pre-migrate.js` | Added to .semgrepignore (hardcoded commands) |
| detect-eval | `src/components/*.tsx` | Added to .semgrepignore (window.location redirects) |
| X-Frame-Options | `src/lib/auth/middleware.ts` | Added to .semgrepignore (setting to 'DENY' is secure) |

---

## Pre-existing TypeScript Errors (341 errors)

These errors existed before our changes and require separate attention:

### High-Volume Files:
1. `src/app/api/auth/login/route.ts` - User type mismatches
2. `src/app/api/admin/setup-wellmedr-clinic/route.ts` - Missing required Clinic fields
3. `src/app/api/affiliate/account/route.ts` - Wrong aggregate field names
4. `src/app/api/finance/` - Various type issues
5. `src/app/api/clinic/list/route.ts` - Enum casing issues

### Common Patterns:
- `profileStatus: 'INCOMPLETE'` should use `ProfileStatus.INCOMPLETE` enum
- Prisma `select` clauses missing required relations
- Nullable fields not properly handled with `?.`
- JSON fields typed as `unknown` instead of specific types

**Recommendation:** Schedule a dedicated TypeScript cleanup sprint to address these 341+ errors.

---

## Blocking Issues Requiring Admin Action

### 1. Production Database Failed Migrations

**Command to run on production:**
```bash
npx prisma migrate resolve --applied 20251129_scheduling_system
npx prisma migrate resolve --applied 20260201_add_sales_rep_role_and_patient_assignment
npx prisma migrate resolve --applied 20260202_add_profile_status
npx prisma migrate resolve --applied 20260201_add_address_validation_log
```

### 2. CI TypeScript Check

Options to unblock deployment:
1. **Quick fix:** Temporarily skip TypeScript check in CI (not recommended)
2. **Proper fix:** Dedicate time to fix all 341 TypeScript errors
3. **Incremental:** Fix errors per-file as they're touched

---

## Files Modified in This Session

```
.semgrepignore                                   # Extended with more false positives
docker/nginx/nginx.conf                          # H2C mitigation on default location
src/app/api/admin/data-integrity/route.ts        # Removed obsolete clinicId:null check
src/app/api/admin/fix-orphaned-patients/route.ts # Deprecated (clinicId now required)
src/app/api/admin/integrations/route.ts          # GCM authTagLength
src/lib/auth/two-factor.ts                       # GCM authTagLength
src/lib/clinic/setup-default-clinic.ts           # Removed Patient update (clinicId required)
src/lib/db.ts                                    # Export Prisma namespace
src/lib/security/phi-encryption.ts               # GCM authTagLength
```

---

## Deployment Checklist

- [x] Fix TypeScript errors (partial - specific fixes applied)
- [x] Fix migration conflict (AppointmentType)
- [x] Remove hardcoded credentials
- [x] Fix security scan findings (19 → 0)
- [ ] **Rotate exposed database passwords** (admin action)
- [ ] **Resolve production failed migrations** (admin action)
- [ ] **Fix remaining 341 TypeScript errors** (requires dedicated sprint)
- [ ] Verify CI passes on main branch
- [ ] Deploy to staging
- [ ] Verify staging functionality
- [ ] Deploy to production

---

## Contact

For questions about this fix plan, contact the development team.
