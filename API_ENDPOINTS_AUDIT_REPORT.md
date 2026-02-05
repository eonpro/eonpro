# API Endpoints Audit Report

**Generated:** 2026-02-04  
**Total fetch() calls found:** 523  
**Unique endpoints called:** 258  
**Route files found:** 429  

## Executive Summary

This audit cross-references all `fetch()` calls to `/api/` endpoints with actual route files in `src/app/api/` to identify:
1. **Missing routes** - Endpoints called but no route.ts file exists
2. **Method mismatches** - Routes exist but don't export the expected HTTP method
3. **Potential 404 errors** - Endpoints that may fail at runtime

## Critical Missing Routes (18)

These endpoints are being called from the frontend but have no corresponding route.ts file:

### 1. `/api/admin/affiliate-settings` ⚠️ **HIGH PRIORITY**
- **Called from:** `src/app/admin/affiliates/settings/page.tsx:72` (GET), `:95` (PUT)
- **Impact:** Affiliate settings page will fail to load/save settings
- **Action Required:** Create route file at `src/app/api/admin/affiliate-settings/route.ts`

### 2. `/api/audit/login`
- **Called from:** `src/lib/auth/AuthContext.tsx:172` (POST)
- **Impact:** Login audit logging may fail silently
- **Action Required:** Verify if this is needed or remove the call

### 3. `/api/auth/refresh`
- **Called from:** `src/lib/auth/AuthContext.tsx:244` (POST)
- **Impact:** Token refresh may fail (though `/api/auth/refresh-token` exists)
- **Action Required:** Check if this should use `/api/auth/refresh-token` instead

### 4. `/api/patients/[id]/documents/[id]` ⚠️ **HIGH PRIORITY**
- **Called from:** 
  - `src/components/PatientDocumentsView.tsx:177` (DELETE)
  - `src/components/PatientDocumentsView.tsx:204` (GET)
  - `src/components/EditPatientForm.tsx:369` (GET)
  - `src/app/patient-portal/documents/page.tsx:169` (DELETE)
  - `src/app/patient-portal/documents/page.tsx:192` (GET)
- **Note:** Routes exist at `/api/patients/[id]/documents/[documentId]/route.ts` - may be a naming mismatch
- **Action Required:** Verify route parameter naming (`[id]` vs `[documentId]`)

### 5. `/api/patients/[id]/documents/[id]/download`
- **Called from:**
  - `src/components/PatientDocumentsView.tsx:233` (GET)
  - `src/app/patient-portal/documents/page.tsx:218` (GET)
- **Note:** Route exists at `/api/patients/[id]/documents/[documentId]/download/route.ts`
- **Action Required:** Verify route parameter naming

### 6. `/api/webhooks/[id]` ⚠️ **MEDIUM PRIORITY**
- **Called from:** `src/app/webhooks/monitor/page.tsx:89` (GET), `:121` (POST)
- **Note:** This is a dynamic endpoint where `[id]` is replaced with specific webhook names (e.g., `heyflow-intake-v2`)
- **Impact:** Webhook monitoring page may fail for some endpoints
- **Action Required:** Consider creating a catch-all route or update frontend to use specific endpoints

### 7. `/api/super-admin/users/[id]/clinics`
- **Called from:** `src/app/super-admin/users/[id]/clinics/page.tsx:113` (GET), `:172` (POST), `:226` (POST)
- **Impact:** User clinic management page will fail
- **Action Required:** Create route file

### 8. `/api/super-admin/clinics/[id]/users/[id]`
- **Called from:** `src/app/super-admin/clinics/[id]/page.tsx:413` (DELETE), `:453` (PUT), `:493` (PUT)
- **Note:** Route exists at `/api/super-admin/clinics/[id]/users/[userId]/route.ts` with PUT and DELETE methods
- **Action Required:** Verify parameter naming (`[id]` vs `[userId]`)

### 9. `/api/super-admin/clinics/[id]/invite-codes/[id]`
- **Called from:** `src/app/super-admin/clinics/[id]/page.tsx:591` (PATCH), `:618` (DELETE)
- **Note:** Routes exist at `/api/super-admin/clinics/[id]/invite-codes/[codeId]/route.ts`
- **Action Required:** Verify parameter naming (`[id]` vs `[codeId]`)

### 10. `/api/audit-logs`
- **Called from:** `src/app/settings/audit/page.tsx:31` (GET)
- **Impact:** Audit logs page will fail to load
- **Action Required:** Create route file or verify correct endpoint name

### 11. `/api/provider/prescription-queue/[id]`
- **Called from:** `src/app/provider/prescription-queue/page.tsx:559` (GET/POST?)
- **Note:** Route exists at `/api/provider/prescription-queue/[invoiceId]/route.ts`
- **Action Required:** Verify parameter naming and method

### 12. `/api/messages/conversations/${selectedMessage}`
- **Called from:** `src/app/provider/messages/page.tsx:85`
- **Note:** This appears to be a malformed endpoint with template literal
- **Action Required:** Fix the endpoint call or create appropriate route

### 13. `/api/affiliate/payout-methods`
- **Called from:** `src/app/portal/affiliate/payouts/page.tsx:106` (GET)
- **Impact:** Affiliate payout methods page will fail
- **Action Required:** Create route file or verify correct endpoint

### 14. `/api/affiliate/commissions`
- **Called from:** `src/app/portal/affiliate/commissions/page.tsx:86` (GET)
- **Impact:** Affiliate commissions page will fail
- **Action Required:** Create route file or verify correct endpoint

### 15. `/api/pharmacy/prescriptions[id]`
- **Called from:** `src/app/pharmacy/prescriptions/page.tsx:33`
- **Note:** Missing `/` before `[id]` - likely a typo
- **Action Required:** Fix endpoint call or create route

### 16. `/api/pay/[id]`
- **Called from:** `src/app/pay/[invoiceId]/page.tsx:45` (GET/POST?)
- **Impact:** Payment page may fail
- **Action Required:** Create route file

### 17. `/api/intake-forms/public/[id]`
- **Called from:** `src/app/intake/[linkId]/page.tsx:65` (GET), `:182` (POST)
- **Note:** Route exists at `/api/intake-forms/public/[linkId]/route.ts`
- **Action Required:** Verify parameter naming (`[id]` vs `[linkId]`)

### 18. `/api/admin/clinic/users/[id]`
- **Called from:** `src/app/admin/settings/page.tsx:497` (DELETE)
- **Note:** Route exists at `/api/admin/clinic/users/[userId]/route.ts`
- **Action Required:** Verify parameter naming and DELETE method export

## Method Mismatches (32)

These routes exist but don't export the expected HTTP method. Some may be false positives if the method detection is incorrect:

### Critical Method Mismatches:

1. **`/api/auth/logout`** - Called as POST, route exists but may not export POST
2. **`/api/auth/send-otp`** - Called as POST, verify route exports POST
3. **`/api/auth/verify-otp`** - Called as POST, verify route exports POST
4. **`/api/providers/verify`** - Called as POST, verify route exports POST
5. **`/api/admin/clinics/[id]`** - Called as DELETE, verify route exports DELETE
6. **`/api/soap-notes/[id]`** - Called as PATCH, verify route exports PATCH

### Other Method Mismatches:

See full audit output for complete list. Many of these may be false positives where:
- The route file exists but method detection failed
- The method is exported but in a different format
- The endpoint should use a different method

## Recommendations

### Immediate Actions:

1. **Create `/api/admin/affiliate-settings/route.ts`** - This is actively used and will cause failures
2. **Verify parameter naming** - Many routes use `[userId]`, `[documentId]`, `[codeId]` but calls use `[id]`
3. **Fix malformed endpoint** - `/api/messages/conversations/${selectedMessage}` needs correction
4. **Fix typo** - `/api/pharmacy/prescriptions[id]` missing `/` before `[id]`

### Verification Needed:

1. Check if `/api/auth/refresh` should use `/api/auth/refresh-token` instead
2. Verify all dynamic route parameters match between calls and route files
3. Ensure all route files export the expected HTTP methods
4. Review error handling in frontend code for these endpoints

### Testing:

1. Test all pages that call missing endpoints
2. Check browser console for 404 errors
3. Verify error handling gracefully handles missing routes
4. Test dynamic endpoints with various parameter values

## Notes

- Some "missing" routes may actually exist but with different parameter names (e.g., `[id]` vs `[userId]`)
- The audit script may have false positives for method detection
- Dynamic routes with template literals may not be detected correctly
- Some endpoints may be intentionally optional (e.g., affiliate endpoints with `.catch(() => null)`)

## Next Steps

1. Review each missing route individually
2. Create missing route files or fix endpoint calls
3. Verify method exports in existing route files
4. Test affected pages after fixes
5. Update error handling if needed
