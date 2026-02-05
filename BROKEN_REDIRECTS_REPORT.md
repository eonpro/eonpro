# Broken Redirects and Links Report

This report identifies all `router.push()`, `redirect()`, and `Link href` references that point to non-existent pages in `src/app/`.

**Generated:** February 4, 2026  
**Total Broken Links Found:** 34 unique paths

---

## Summary

The analysis found **34 broken redirect paths** across the codebase. These are categorized below:

1. **Missing Pages** - Routes that don't exist and need to be created
2. **Incorrect Paths** - Routes that exist but at different paths
3. **External/Placeholder Links** - Links to external resources or placeholder pages

---

## Broken Redirects by Category

### 1. Missing Pages (Need to be Created)

#### `/unauthorized`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/RoleBasedLayout.tsx`
  - `src/hooks/useAuth.ts`
  - `src/lib/auth/AuthContext.tsx` (2 occurrences)
- **Impact:** HIGH - Used for unauthorized access handling
- **Recommendation:** Create `src/app/unauthorized/page.tsx`

#### `/patient-portal/messages`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** MEDIUM - Patient messaging feature
- **Recommendation:** Create `src/app/patient-portal/messages/page.tsx` or redirect to `/patient-portal/chat`

#### `/patient-portal/messages/new`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** MEDIUM - New message creation
- **Recommendation:** Create `src/app/patient-portal/messages/new/page.tsx` or handle in existing messages page

#### `/patient-portal/appointments/book`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** MEDIUM - Appointment booking
- **Recommendation:** Create `src/app/patient-portal/appointments/book/page.tsx` or handle in existing appointments page

#### `/patient-portal/medications/refill`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** MEDIUM - Medication refill flow
- **Recommendation:** Create `src/app/patient-portal/medications/refill/page.tsx` or handle in existing medications page

#### `/patient-portal/profile`
- **Type:** `Link href`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** LOW - Profile settings link
- **Recommendation:** Create `src/app/patient-portal/profile/page.tsx` or redirect to `/patient-portal/settings`

#### `/patient-portal/security`
- **Type:** `Link href`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** LOW - Security settings link
- **Recommendation:** Create `src/app/patient-portal/security/page.tsx` or redirect to `/patient-portal/settings`

#### `/patient-portal/health-summary`
- **Type:** `Link href`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** LOW - Health summary page
- **Recommendation:** Create `src/app/patient-portal/health-summary/page.tsx` or redirect to `/patient-portal/health-score`

#### `/provider/consultations/new`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/ProviderLayout.tsx`
- **Impact:** MEDIUM - New consultation creation
- **Recommendation:** Create `src/app/provider/consultations/new/page.tsx` or handle in existing consultations page

#### `/provider/soap-notes/new`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/ProviderLayout.tsx`
- **Impact:** MEDIUM - New SOAP note creation
- **Recommendation:** Create `src/app/provider/soap-notes/new/page.tsx` or handle in existing SOAP notes page

#### `/provider/prescriptions/new`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/ProviderLayout.tsx`
- **Impact:** MEDIUM - New prescription creation
- **Recommendation:** Create `src/app/provider/prescriptions/new/page.tsx` or handle in existing prescriptions page

#### `/provider/settings/calendar`
- **Type:** `Link href`
- **Files:**
  - `src/components/ProviderCalendarStatusCard.tsx` (2 occurrences)
- **Impact:** MEDIUM - Calendar settings
- **Recommendation:** Create `src/app/provider/settings/calendar/page.tsx` or redirect to `/provider/settings`

#### `/provider/telehealth`
- **Type:** `Link href`
- **Files:**
  - `src/components/ProviderCalendarStatusCard.tsx`
- **Impact:** LOW - Telehealth link (note: `/telehealth` exists)
- **Recommendation:** Update link to `/telehealth` or create provider-specific telehealth page

#### `/admin/providers`
- **Type:** `Link href`
- **Files:**
  - `src/app/admin/providers/[id]/compensation/page.tsx`
- **Impact:** LOW - Admin providers list
- **Recommendation:** Create `src/app/admin/providers/page.tsx` or redirect to `/providers`

#### `/affiliate/forgot-password`
- **Type:** `Link href`
- **Files:**
  - `src/app/affiliate/login/page.tsx`
- **Impact:** LOW - Password recovery
- **Recommendation:** Create `src/app/affiliate/forgot-password/page.tsx` or use main forgot password flow

---

### 2. Incorrect Paths (Exist at Different Locations)

#### `/patient/login`
- **Type:** `router.push()`
- **Files:**
  - `src/components/layouts/PatientLayout.tsx`
- **Impact:** MEDIUM - Login redirect
- **Current:** `/login` exists
- **Recommendation:** Update to `/login` or create patient-specific login at `/patient/login`

#### `/auth/login`
- **Type:** `router.push()`
- **Files:**
  - `src/app/settings/page.tsx`
- **Impact:** LOW - Login redirect
- **Current:** `/login` exists
- **Recommendation:** Update to `/login`

#### `/prescriptions`
- **Type:** `Link href`
- **Files:**
  - `src/app/not-found.tsx`
- **Impact:** LOW - Generic prescriptions link
- **Current:** `/provider/prescriptions` and `/pharmacy/prescriptions` exist
- **Recommendation:** Update to role-specific path or create generic `/prescriptions` page

---

### 3. External/Placeholder Links (May be Intentional)

#### `/privacy`
- **Type:** `Link href`
- **Files:**
  - `src/app/affiliate/(dashboard)/account/page.tsx`
  - `src/app/affiliate/apply/page.tsx`
  - `src/app/affiliate/login/page.tsx`
  - `src/app/register/page.tsx`
- **Impact:** LOW - Privacy policy link
- **Recommendation:** Create `src/app/privacy/page.tsx` or update to external URL

#### `/terms`
- **Type:** `Link href`
- **Files:**
  - `src/app/affiliate/apply/page.tsx`
  - `src/app/affiliate/login/page.tsx`
  - `src/app/register/page.tsx`
- **Impact:** LOW - Terms of service link
- **Recommendation:** Create `src/app/terms/page.tsx` or update to external URL (note: `/affiliate/terms` exists)

#### `/privacy-policy`
- **Type:** `Link href`
- **Files:**
  - `src/app/patient-portal/settings/page.tsx`
- **Impact:** LOW - Privacy policy link
- **Recommendation:** Create `src/app/privacy-policy/page.tsx` or redirect to `/privacy`

#### `/terms-of-service`
- **Type:** `Link href`
- **Files:**
  - `src/app/patient-portal/settings/page.tsx`
- **Impact:** LOW - Terms of service link
- **Recommendation:** Create `src/app/terms-of-service/page.tsx` or redirect to `/terms`

#### `/hipaa-notice`
- **Type:** `Link href`
- **Files:**
  - `src/app/patient-portal/settings/page.tsx`
- **Impact:** LOW - HIPAA notice link
- **Recommendation:** Create `src/app/hipaa-notice/page.tsx`

---

### 4. Test/Development Routes

#### `/test/twilio`
- **Type:** `Link href`
- **Files:**
  - `src/app/admin/features/page.tsx`
- **Impact:** LOW - Test route
- **Recommendation:** Remove or create test page

#### `/test/languages`
- **Type:** `Link href`
- **Files:**
  - `src/app/settings/languages/page.tsx`
- **Impact:** LOW - Test route
- **Recommendation:** Remove or create test page

---

## Priority Recommendations

### High Priority (Security/Auth Related)
1. **Create `/unauthorized` page** - Critical for proper error handling
2. **Fix `/patient/login` redirect** - May cause login flow issues

### Medium Priority (Feature Completeness)
1. **Create patient portal sub-pages:**
   - `/patient-portal/messages` (or redirect to `/patient-portal/chat`)
   - `/patient-portal/messages/new`
   - `/patient-portal/appointments/book`
   - `/patient-portal/medications/refill`

2. **Create provider sub-pages:**
   - `/provider/consultations/new`
   - `/provider/soap-notes/new`
   - `/provider/prescriptions/new`
   - `/provider/settings/calendar`

### Low Priority (UX Improvements)
1. Create legal pages: `/privacy`, `/terms`, `/privacy-policy`, `/terms-of-service`, `/hipaa-notice`
2. Fix or remove test routes
3. Create missing profile/security pages or redirect to settings

---

## How to Fix

### Option 1: Create Missing Pages
Create the corresponding `page.tsx` files in `src/app/` following the existing patterns.

### Option 2: Redirect to Existing Pages
Update the redirects/links to point to existing pages that serve the same purpose.

### Option 3: Handle in Existing Pages
For "new" routes (e.g., `/provider/consultations/new`), consider handling them as query parameters or modals in the parent page.

---

## Script Usage

To re-run this analysis:
```bash
npx tsx scripts/check-broken-redirects.ts
```

The script checks:
- `router.push()` calls
- `redirect()` calls  
- `Link href` attributes
- Validates against actual pages in `src/app/`
- Handles Next.js route groups `(dashboard)`
- Handles dynamic routes `[id]`
- Excludes API routes `/api/*`
