# Comprehensive API Endpoints Audit Report

**Generated:** 2026-02-04  
**Total fetch() calls found:** 534  
**Unique endpoints called:** 257  
**Route files found:** 431

## Executive Summary

This audit cross-references all `fetch()` calls to `/api/` endpoints with actual route files in `src/app/api/` to identify:
1. **Missing routes** - Endpoints called but no route.ts file exists
2. **Path mismatches** - Routes exist but paths don't match exactly
3. **Dynamic parameter mismatches** - Routes exist but parameter names differ (e.g., `[id]` vs `[userId]`)
4. **Method mismatches** - Routes exist but don't export the expected HTTP method

---

## 🔴 CRITICAL ISSUES

### 1. Dynamic Parameter Mismatches (9 found)

These endpoints are being called with generic `[id]` parameters, but the actual routes use more specific parameter names. **These will work at runtime** (Next.js matches dynamic segments regardless of name), but **this is a code quality issue** that can cause confusion.

#### `/api/patients/[id]/documents/[id]` → `/api/patients/[id]/documents/[documentId]`
- **Called from:**
  - `src/components/PatientDocumentsView.tsx:177` (DELETE)
  - `src/components/PatientDocumentsView.tsx:204` (GET)
  - `src/components/EditPatientForm.tsx:369` (GET)
  - `src/app/patient-portal/documents/page.tsx:169` (DELETE)
  - `src/app/patient-portal/documents/page.tsx:192` (GET)
- **Route file:** `src/app/api/patients/[id]/documents/[documentId]/route.ts`
- **Issue:** Fetch calls use `[id]` but route expects `[documentId]`
- **Fix:** Update fetch calls to use `documentId` variable name, or rename route parameter to `[id]`

#### `/api/patients/[id]/documents/[id]/download` → `/api/patients/[id]/documents/[documentId]/download`
- **Called from:**
  - `src/components/PatientDocumentsView.tsx:233` (GET)
  - `src/app/patient-portal/documents/page.tsx:218` (GET)
- **Route file:** `src/app/api/patients/[id]/documents/[documentId]/download/route.ts`
- **Issue:** Same as above - parameter name mismatch

#### `/api/super-admin/users/[id]/clinics` → `/api/super-admin/users/[userId]/clinics`
- **Called from:**
  - `src/app/super-admin/users/[id]/clinics/page.tsx:113` (GET)
  - `src/app/super-admin/users/[id]/clinics/page.tsx:172` (POST)
  - `src/app/super-admin/users/[id]/clinics/page.tsx:226` (POST)
- **Route file:** `src/app/api/super-admin/users/[userId]/clinics/route.ts`
- **Issue:** Page uses `[id]` but route uses `[userId]`
- **Fix:** Update page to use `userId` or rename route to `[id]`

#### `/api/super-admin/clinics/[id]/users/[id]` → `/api/super-admin/clinics/[id]/users/[userId]`
- **Called from:**
  - `src/app/super-admin/clinics/[id]/page.tsx:413` (DELETE)
  - `src/app/super-admin/clinics/[id]/page.tsx:453` (PUT)
  - `src/app/super-admin/clinics/[id]/page.tsx:493` (PUT)
- **Route file:** `src/app/api/super-admin/clinics/[id]/users/[userId]/route.ts`
- **Issue:** Second parameter should be `userId`, not `id`

#### `/api/super-admin/clinics/[id]/invite-codes/[id]` → `/api/super-admin/clinics/[id]/invite-codes/[codeId]`
- **Called from:**
  - `src/app/super-admin/clinics/[id]/page.tsx:591` (PATCH)
  - `src/app/super-admin/clinics/[id]/page.tsx:618` (DELETE)
- **Route file:** `src/app/api/super-admin/clinics/[id]/invite-codes/[codeId]/route.ts`
- **Issue:** Parameter should be `codeId`, not `id`

#### `/api/provider/prescription-queue/[id]` → `/api/provider/prescription-queue/[invoiceId]`
- **Called from:**
  - `src/app/provider/prescription-queue/page.tsx:559`
- **Route file:** `src/app/api/provider/prescription-queue/[invoiceId]/route.ts`
- **Issue:** Parameter should be `invoiceId`, not `id`

#### `/api/pay/[id]` → `/api/pay/[invoiceId]`
- **Called from:**
  - `src/app/pay/[invoiceId]/page.tsx:45`
- **Route file:** `src/app/api/pay/[invoiceId]/route.ts`
- **Issue:** Page uses `invoiceId` in path but fetch uses generic `[id]` - this is actually correct since the page path matches

#### `/api/intake-forms/public/[id]` → `/api/intake-forms/public/[linkId]`
- **Called from:**
  - `src/app/intake/[linkId]/page.tsx:65` (GET)
  - `src/app/intake/[linkId]/page.tsx:182` (POST)
- **Route file:** `src/app/api/intake-forms/public/[linkId]/route.ts`
- **Issue:** Page uses `linkId` but fetch calls use generic `[id]` - this is actually correct

#### `/api/admin/clinic/users/[id]` → `/api/admin/clinic/users/[userId]`
- **Called from:**
  - `src/app/admin/settings/page.tsx:497` (DELETE)
- **Route file:** `src/app/api/admin/clinic/users/[userId]/route.ts`
- **Issue:** Parameter should be `userId`, not `id`

---

## ⚠️ MISSING ROUTES (4 found)

### 1. `/api/audit/login` ⚠️ **HIGH PRIORITY**
- **Called from:** `src/lib/auth/AuthContext.tsx:172` (POST)
- **Impact:** Login audit logging may fail silently
- **Action Required:** 
  - Verify if this endpoint is needed
  - If yes, create `src/app/api/audit/login/route.ts`
  - If no, remove the fetch call

### 2. `/api/webhooks/[id]` ⚠️ **MEDIUM PRIORITY**
- **Called from:**
  - `src/app/webhooks/monitor/page.tsx:89` (GET)
  - `src/app/webhooks/monitor/page.tsx:121` (POST)
- **Impact:** Webhook monitoring page will fail
- **Issue:** This is a dynamic route that doesn't exist. Webhooks are specific routes like `/api/webhooks/heyflow-intake`
- **Action Required:**
  - Create a dynamic route handler at `src/app/api/webhooks/[id]/route.ts`, OR
  - Update the webhook monitor page to use specific webhook endpoints

### 3. `/api/messages/conversations/${selectedMessage?.patientId}` ✅ **FALSE POSITIVE**
- **Called from:** `src/app/provider/messages/page.tsx:85`
- **Status:** This is actually correct! The fetch call uses a template literal: `/api/messages/conversations/${selectedMessage?.patientId}`
- **Route exists:** `src/app/api/messages/conversations/[patientId]/route.ts`
- **Action Required:** None - this is working correctly

### 4. `/api/pharmacy/prescriptions[id]` ✅ **FALSE POSITIVE**
- **Called from:** `src/app/pharmacy/prescriptions/page.tsx:33`
- **Status:** This is a parsing error in the audit script. The actual fetch call is `/api/pharmacy/prescriptions`
- **Route exists:** `src/app/api/pharmacy/prescriptions/route.ts`
- **Action Required:** None - this is working correctly

---

## ⚠️ METHOD MISMATCHES (33 found) - MOSTLY FALSE POSITIVES

These routes exist but the audit script couldn't detect exported HTTP methods. This is because:

**Root Cause:** The audit script only looks for `export const GET = ...` pattern, but many routes use `export async function GET()` pattern instead.

**Verified Examples:**
- `/api/auth/logout` ✅ Uses `export async function POST()` - **EXISTS**
- `/api/auth/session` ✅ Uses `export async function GET()` - **EXISTS**
- `/api/clinic/switch` ✅ Uses `export async function POST()` - **EXISTS**

**Action Required:** Update audit script to detect both patterns:
- `export const GET = ...`
- `export async function GET()`
- `export function GET()`

**Note:** Most of these are false positives. The routes exist and export methods correctly, just in a different format.

### Routes to Verify Manually:

1. `/api/v2/twilio/chat/token` - Called as POST
2. `/api/clinic/switch` - Called as POST (but `/api/auth/switch-clinic` exists)
3. `/api/auth/session` - Called as GET
4. `/api/auth/logout` - Called as POST ✅ **EXISTS** - verify export
5. `/api/auth/refresh-token` - Called as POST ✅ **EXISTS** - verify export
6. `/api/internal/tickets/[id]/sla` - Called as POST
7. `/api/internal/tickets/[id]/escalate` - Called as POST
8. `/api/providers/[id]/set-password` - Called as POST
9. `/api/stripe/payments/process` - Called as POST
10. `/api/subscriptions/[id]/pause` - Called as POST
11. `/api/subscriptions/[id]/resume` - Called as POST
12. `/api/soap-notes/[id]` - Called as PATCH
13. `/api/payment-methods/default` - Called as PUT
14. `/api/stripe/invoices/[id]` - Called as POST
15. `/api/v2/invoices/[id]/actions` - Called as POST ✅ **EXISTS**
16. `/api/ai/chat` - Called as POST
17. `/api/v2/twilio/send-sms` - Called as POST
18. `/api/v2/stripe/create-subscription` - Called as POST
19. `/api/providers/verify` - Called as POST
20. `/api/auth/send-otp` - Called as POST
21. `/api/auth/verify-otp` - Called as POST
22. `/api/influencers/auth/login` - Called as POST
23. `/api/influencers/bank-accounts/[id]` - Called as DELETE
24. `/api/influencers/bank-accounts/[id]/set-default` - Called as PUT
25. `/api/v2/aws/ses/send` - Called as POST
26. `/api/v2/aws/ses/preview` - Called as POST
27. `/api/affiliate/auth/login` - Called as POST
28. `/api/affiliate/apply` - Called as POST
29. `/api/affiliate/auth/logout` - Called as POST
30. `/api/admin/influencers/[id]` - Called as PUT
31. `/api/admin/influencers/[id]/reset-password` - Called as POST
32. `/api/admin/clinics/[id]` - Called as DELETE
33. `/api/v2/invoices/[id]` - Called as DELETE

---

## ✅ VERIFIED WORKING ROUTES

These routes exist and are correctly matched:

- `/api/admin/affiliate-settings` ✅ (GET, PUT)
- `/api/auth/switch-clinic` ✅ (POST)
- `/api/pharmacy/prescriptions` ✅ (GET)
- `/api/messages/conversations/[patientId]` ✅ (GET)
- `/api/affiliate/payouts` ✅
- `/api/affiliate/account/payout-method` ✅
- `/api/affiliate/tax-documents` ✅
- `/api/affiliate/summary` ✅
- `/api/admin/audit-logs` ✅
- `/api/auth/logout` ✅
- `/api/auth/login` ✅
- `/api/auth/session` ✅ (verify method export)
- `/api/auth/refresh-token` ✅ (verify method export)
- And 211+ more routes...

---

## 📋 RECOMMENDATIONS

### Immediate Actions:

1. **Fix Dynamic Parameter Mismatches** (Priority: Medium)
   - Standardize parameter names across fetch calls and routes
   - Prefer descriptive names (`userId`, `documentId`) over generic `[id]` when there are multiple dynamic segments

2. **Create Missing Routes** (Priority: High)
   - `/api/audit/login` - Verify if needed, create if yes
   - `/api/webhooks/[id]` - Create dynamic handler OR update monitor page

3. **Verify Method Exports** (Priority: Low)
   - Manually verify the 33 "method mismatch" routes
   - Update audit script to better detect wrapped exports

### Code Quality Improvements:

1. **Standardize Dynamic Route Parameters**
   - Use consistent naming: `[id]` for single resource, `[userId]`, `[documentId]` for nested resources
   - Document parameter naming conventions

2. **Improve Audit Script**
   - Better detection of wrapped exports (`withAuth`, `withProviderAuth`, etc.)
   - Better handling of template literals in fetch calls
   - Report actual vs expected parameter names

3. **Add Type Safety**
   - Consider using typed API clients to catch mismatches at compile time
   - Use shared types for route parameters

---

## 📊 Statistics

- **Total fetch() calls:** 534
- **Unique endpoints called:** 257
- **Route files found:** 431
- **Missing routes:** 2 (2 false positives)
- **Parameter mismatches:** 9
- **Method mismatches:** 33 (likely false positives - verify manually)
- **Working routes:** 211+

---

## 🔍 How to Verify Routes Manually

To verify if a route exists and exports the correct method:

```bash
# Check if route file exists
ls -la src/app/api/[path]/route.ts

# Check exported methods
grep -E "export const (GET|POST|PUT|PATCH|DELETE)" src/app/api/[path]/route.ts
```

Example:
```bash
# Verify /api/auth/logout
ls -la src/app/api/auth/logout/route.ts
grep -E "export const (GET|POST|PUT|PATCH|DELETE)" src/app/api/auth/logout/route.ts
```

---

**Report Generated By:** Enhanced API Endpoints Audit Script  
**Script Location:** `scripts/audit-api-endpoints-enhanced.ts`
