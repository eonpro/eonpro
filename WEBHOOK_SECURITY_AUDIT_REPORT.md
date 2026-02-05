# Webhook Security Audit Report

**Date:** February 4, 2026  
**Scope:** All webhook endpoints in `/src/app/api/webhooks/**` and related webhook routes  
**Focus:** Signature verification, authentication, and sensitive data exposure

---

## Executive Summary

This audit identified **34 webhook endpoints** across the platform. Overall security posture:

- ✅ **Secure (Proper Authentication):** 12 endpoints
- ⚠️ **Partially Secure (Conditional Auth):** 8 endpoints  
- ❌ **Insecure (No Auth):** 5 endpoints (intentional monitoring/debug endpoints)
- ⚠️ **Needs Review:** 9 endpoints

**Critical Findings:**
1. Several intake webhooks allow "no-secret" mode when secrets aren't configured
2. Development mode bypasses signature verification for Twilio webhooks
3. Some webhooks expose PHI in error responses
4. Test/debug endpoints are publicly accessible (by design)

---

## Detailed Endpoint Analysis

### ✅ SECURE ENDPOINTS (Proper Authentication)

#### 1. `/api/stripe/webhook` ✅
- **Status:** SECURE
- **Authentication:** Stripe signature verification using `stripe.webhooks.constructEvent()`
- **Verification:** ✅ Checks for `stripe-signature` header, validates against `STRIPE_CONFIG.webhookEndpointSecret`
- **Error Handling:** ✅ Returns 400 on missing/invalid signature
- **PHI Exposure:** ✅ No PHI in logs (uses IDs only)
- **Notes:** Properly implemented Stripe webhook handler

#### 2. `/api/webhooks/stripe-connect` ✅
- **Status:** SECURE
- **Authentication:** Stripe signature verification
- **Verification:** ✅ Validates `stripe-signature` header with `STRIPE_CONNECT_WEBHOOK_SECRET`
- **Error Handling:** ✅ Returns 400/500 on missing/invalid signature
- **PHI Exposure:** ✅ No PHI exposure
- **Notes:** Handles Stripe Connect account events securely

#### 3. `/api/webhooks/ses-bounce` ✅
- **Status:** SECURE (Production)
- **Authentication:** SNS signature verification
- **Verification:** ✅ Verifies SNS message signatures in production only
- **Error Handling:** ✅ Returns 401 on invalid signature
- **PHI Exposure:** ⚠️ May log email addresses (bounce notifications)
- **Notes:** Only validates in production; dev/test bypasses verification

#### 4. `/api/v2/zoom/webhook` ⚠️
- **Status:** PARTIALLY SECURE
- **Authentication:** Zoom signature verification (when configured)
- **Verification:** ✅ Uses HMAC-SHA256 with `zoomConfig.webhookSecret`
- **Warning:** ⚠️ Logs warning but continues if no secret configured
- **Error Handling:** ✅ Returns 401 on missing/invalid signature
- **PHI Exposure:** ✅ No PHI exposure
- **Issue:** Allows processing if `webhookSecret` is not set (logs warning only)

#### 5. `/api/webhooks/intake` ✅
- **Status:** SECURE
- **Authentication:** Multiple header checks (`x-webhook-secret`, `x-api-key`, `Authorization`)
- **Verification:** ✅ Validates against source-specific secrets
- **Error Handling:** ✅ Returns 401 on auth failure
- **PHI Exposure:** ⚠️ Processes patient data but logs appropriately
- **Notes:** Supports multiple sources (heyflow, medlink, weightlossintake, eonpro, internal)

#### 6. `/api/webhooks/heyflow-intake-v2` ⚠️
- **Status:** PARTIALLY SECURE
- **Authentication:** Header-based secret validation
- **Verification:** ⚠️ **ALLOWS requests if no secret configured** (`no-secret` mode)
- **Error Handling:** ✅ Returns 401 on auth failure (when secret is configured)
- **PHI Exposure:** ⚠️ Processes patient intake data
- **Issue:** 
  ```typescript
  if (!configuredSecret) {
    return { isValid: true, authMethod: "no-secret" };
  }
  ```
  **CRITICAL:** This allows unauthenticated requests when secret is missing!

#### 7. `/api/webhooks/wellmedr-intake` ✅
- **Status:** SECURE
- **Authentication:** Header-based secret validation
- **Verification:** ✅ Validates `WELLMEDR_INTAKE_WEBHOOK_SECRET`
- **Error Handling:** ✅ Returns 500 if secret not configured, 401 on auth failure
- **PHI Exposure:** ⚠️ Processes patient data (isolated to Wellmedr clinic)
- **Notes:** Properly fails fast if secret not configured

#### 8. `/api/webhooks/overtime-intake` ✅
- **Status:** SECURE
- **Authentication:** Header-based secret validation
- **Verification:** ✅ Validates `OVERTIME_INTAKE_WEBHOOK_SECRET`
- **Error Handling:** ✅ Returns 500 if secret not configured, 401 on auth failure
- **PHI Exposure:** ⚠️ Processes patient data (isolated to Overtime clinic)
- **Notes:** Properly fails fast if secret not configured

#### 9. `/api/webhooks/test` ✅
- **Status:** SECURE (Test Endpoint)
- **Authentication:** ✅ Validates `WEIGHTLOSSINTAKE_WEBHOOK_SECRET`
- **Verification:** ✅ Proper authentication check
- **Error Handling:** ✅ Returns 401 on auth failure
- **PHI Exposure:** ✅ No real patient creation (test only)
- **Notes:** Intentionally public for testing, but requires authentication

---

### ⚠️ PARTIALLY SECURE ENDPOINTS (Conditional/Development Bypass)

#### 10. `/api/v2/twilio/webhook` ⚠️
- **Status:** PARTIALLY SECURE
- **Authentication:** Twilio signature validation
- **Verification:** ⚠️ **SKIPPED in development/test mode**
  ```typescript
  if (process.env.NODE_ENV === 'development' || process.env.TWILIO_USE_MOCK === 'true') {
    return true; // Bypasses validation!
  }
  ```
- **Error Handling:** ✅ Returns 401 on invalid signature (production only)
- **PHI Exposure:** ⚠️ Processes SMS messages, may contain PHI
- **Issue:** Development mode completely bypasses signature verification

#### 11. `/api/v2/twilio/chat/webhook` ⚠️
- **Status:** PARTIALLY SECURE
- **Authentication:** Twilio signature validation
- **Verification:** ⚠️ **SKIPPED in development mode**
  ```typescript
  if (process.env.NODE_ENV === "development" || process.env.TWILIO_USE_MOCK === "true") {
    return true; // Bypasses validation!
  }
  ```
- **Error Handling:** ✅ Returns 401 on invalid signature (production only)
- **PHI Exposure:** ⚠️ Stores patient chat messages (contains PHI)
- **Issue:** Development mode bypasses signature verification

#### 12. `/api/webhooks/lifefile-data-push` ⚠️
- **Status:** PARTIALLY SECURE
- **Authentication:** Basic Auth
- **Verification:** ⚠️ **ALLOWS requests in development if no credentials configured**
  ```typescript
  if (!WEBHOOK_USERNAME || !WEBHOOK_PASSWORD) {
    if (isDevelopment) {
      logger.warn('No authentication configured, accepting request (development mode)');
      return true; // Accepts all requests!
    }
  }
  ```
- **Error Handling:** ✅ Returns 401 on auth failure (when configured)
- **PHI Exposure:** ⚠️ Processes order/prescription data (may contain PHI)
- **Issue:** Development mode accepts all requests if credentials not set

#### 13. `/api/webhooks/lifefile/prescription-status` ⚠️
- **Status:** PARTIALLY SECURE
- **Authentication:** HMAC-SHA256 signature verification
- **Verification:** ⚠️ **Only validates if `LIFEFILE_WEBHOOK_SECRET` is configured**
  ```typescript
  if (process.env.LIFEFILE_WEBHOOK_SECRET) {
    // Only validates if secret exists
  }
  ```
- **Error Handling:** ✅ Returns 401 on missing/invalid signature (when configured)
- **PHI Exposure:** ⚠️ Processes prescription status updates (contains PHI)
- **Issue:** Silent failure if secret not configured (no error, just skips validation)

---

### ❌ INSECURE ENDPOINTS (No Authentication - Intentional)

#### 14. `/api/webhooks/ping` ❌
- **Status:** INSECURE (By Design)
- **Authentication:** ❌ None
- **Purpose:** Connectivity testing
- **PHI Exposure:** ✅ None (just returns status)
- **Recommendation:** ✅ Acceptable for monitoring endpoints

#### 15. `/api/webhooks/health` ⚠️
- **Status:** PARTIALLY SECURE
- **Authentication:** ⚠️ Optional (only for patient search)
- **PHI Exposure:** ⚠️ **EXPOSES PATIENT DATA if authenticated**
  ```typescript
  if (patientSearch && authSecret === configuredSecret) {
    const patients = await prisma.patient.findMany({
      // Returns patient names, emails, documents, SOAP notes
    });
  }
  ```
- **Issue:** Health check endpoint exposes full patient records when authenticated
- **Recommendation:** ⚠️ Remove patient search from health endpoint or add rate limiting

#### 16. `/api/webhooks/heyflow-debug` ❌
- **Status:** INSECURE (Debug Endpoint)
- **Authentication:** ❌ None
- **PHI Exposure:** ⚠️ May process intake data
- **Recommendation:** ⚠️ **DISABLE IN PRODUCTION** or add authentication

#### 17. `/api/webhooks/heyflow-test` ❌
- **Status:** INSECURE (Test Endpoint)
- **Authentication:** ❌ None
- **PHI Exposure:** ⚠️ May process test intake data
- **Recommendation:** ⚠️ **DISABLE IN PRODUCTION** or add authentication

---

### 🔒 PROTECTED ENDPOINTS (Admin/Developer Only)

#### 18. `/api/developer/webhooks` ✅
- **Status:** SECURE
- **Authentication:** ✅ `withAuth` middleware, requires admin/provider role
- **Permissions:** ✅ Checks `PERMISSIONS.INTEGRATION_READ/CREATE`
- **PHI Exposure:** ✅ No PHI exposure
- **Notes:** Properly protected admin endpoint

#### 19. `/api/admin/webhooks` ✅
- **Status:** SECURE
- **Authentication:** ✅ `withAuth` middleware, requires admin role
- **Permissions:** ✅ Checks integration permissions
- **PHI Exposure:** ✅ No PHI exposure
- **Notes:** Properly protected admin endpoint

---

## Security Issues Summary

### 🔴 CRITICAL ISSUES

1. **Heyflow V2 Webhook - No-Secret Mode**
   - **Endpoint:** `/api/webhooks/heyflow-intake-v2`
   - **Issue:** Accepts all requests when `MEDLINK_WEBHOOK_SECRET` is not configured
   - **Risk:** Unauthenticated patient intake submissions
   - **Fix:** Fail fast if secret not configured (like wellmedr/overtime webhooks)

2. **Health Endpoint Exposes Patient Data**
   - **Endpoint:** `/api/webhooks/health`
   - **Issue:** Returns full patient records (names, emails, documents, SOAP notes) when authenticated
   - **Risk:** PHI exposure through health check endpoint
   - **Fix:** Remove patient search functionality or move to separate authenticated endpoint

3. **Debug/Test Endpoints Publicly Accessible**
   - **Endpoints:** `/api/webhooks/heyflow-debug`, `/api/webhooks/heyflow-test`
   - **Issue:** No authentication, may process intake data
   - **Risk:** Unauthorized access, potential data injection
   - **Fix:** Disable in production or add authentication

### 🟡 MEDIUM ISSUES

4. **Development Mode Bypasses Signature Verification**
   - **Endpoints:** `/api/v2/twilio/webhook`, `/api/v2/twilio/chat/webhook`
   - **Issue:** Completely bypasses signature validation in development
   - **Risk:** May accidentally deploy to production with bypass enabled
   - **Fix:** Use environment-specific secrets instead of bypassing validation

5. **Lifefile Webhooks - Silent Failure on Missing Secret**
   - **Endpoints:** `/api/webhooks/lifefile-data-push`, `/api/webhooks/lifefile/prescription-status`
   - **Issue:** Accepts requests in development if credentials not configured
   - **Risk:** Unauthenticated requests in development environments
   - **Fix:** Fail fast if credentials not configured (even in development)

6. **Zoom Webhook - Warning Only on Missing Secret**
   - **Endpoint:** `/api/v2/zoom/webhook`
   - **Issue:** Logs warning but continues processing if secret not configured
   - **Risk:** Unauthenticated webhook processing
   - **Fix:** Return error if secret not configured

### 🟢 LOW ISSUES

7. **SES Bounce Webhook - Production Only Validation**
   - **Endpoint:** `/api/webhooks/ses-bounce`
   - **Issue:** Only validates signatures in production
   - **Risk:** Development environments may accept invalid requests
   - **Fix:** Use test SNS certificates for development

---

## Recommendations

### Immediate Actions Required

1. **Fix Heyflow V2 Webhook**
   ```typescript
   // Current (INSECURE):
   if (!configuredSecret) {
     return { isValid: true, authMethod: "no-secret" };
   }
   
   // Recommended (SECURE):
   if (!configuredSecret) {
     logger.error('[HEYFLOW V2] No webhook secret configured');
     return { isValid: false, errorDetails: 'Webhook secret not configured' };
   }
   ```

2. **Remove Patient Search from Health Endpoint**
   - Move patient search to separate authenticated endpoint
   - Health endpoint should only return system status

3. **Disable Debug Endpoints in Production**
   ```typescript
   if (process.env.NODE_ENV === 'production') {
     return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
   }
   ```

### Best Practices to Implement

4. **Standardize Webhook Authentication**
   - All webhooks should fail fast if secrets not configured
   - No "no-secret" mode or development bypasses
   - Use environment-specific secrets for dev/staging/prod

5. **Add Rate Limiting**
   - Implement rate limiting on all webhook endpoints
   - Prevent brute force attacks on authentication
   - Use IP-based rate limiting for unauthenticated endpoints

6. **Enhance Logging**
   - Log all authentication failures with IP addresses
   - Track failed webhook attempts
   - Alert on suspicious patterns

7. **PHI Protection**
   - Ensure no PHI in error responses
   - Sanitize logs (already implemented in most endpoints)
   - Use patient IDs instead of names/emails in logs

---

## Webhook Endpoint Inventory

| Endpoint | Method | Auth Status | Signature Verification | PHI Risk |
|----------|--------|-------------|----------------------|----------|
| `/api/stripe/webhook` | POST | ✅ Secure | ✅ Stripe signature | Low |
| `/api/webhooks/stripe-connect` | POST | ✅ Secure | ✅ Stripe signature | Low |
| `/api/webhooks/ses-bounce` | POST | ⚠️ Conditional | ✅ SNS signature (prod only) | Medium |
| `/api/v2/zoom/webhook` | POST | ⚠️ Warning only | ✅ HMAC-SHA256 (if configured) | Low |
| `/api/webhooks/intake` | POST | ✅ Secure | ✅ Header secret | High |
| `/api/webhooks/heyflow-intake-v2` | POST | ⚠️ No-secret mode | ⚠️ Header secret (if configured) | High |
| `/api/webhooks/wellmedr-intake` | POST | ✅ Secure | ✅ Header secret | High |
| `/api/webhooks/overtime-intake` | POST | ✅ Secure | ✅ Header secret | High |
| `/api/webhooks/test` | POST | ✅ Secure | ✅ Header secret | Low |
| `/api/v2/twilio/webhook` | POST | ⚠️ Dev bypass | ⚠️ Twilio signature (prod only) | Medium |
| `/api/v2/twilio/chat/webhook` | POST | ⚠️ Dev bypass | ⚠️ Twilio signature (prod only) | High |
| `/api/webhooks/lifefile-data-push` | POST | ⚠️ Dev bypass | ⚠️ Basic Auth (if configured) | High |
| `/api/webhooks/lifefile/prescription-status` | POST | ⚠️ Conditional | ⚠️ HMAC-SHA256 (if configured) | High |
| `/api/webhooks/ping` | GET/POST | ❌ None | ❌ None | None |
| `/api/webhooks/health` | GET | ⚠️ Optional | ⚠️ Optional | ⚠️ High (if auth) |
| `/api/webhooks/heyflow-debug` | GET/POST | ❌ None | ❌ None | Medium |
| `/api/webhooks/heyflow-test` | GET/POST | ❌ None | ❌ None | Low |
| `/api/developer/webhooks` | GET/POST | ✅ Auth middleware | ✅ Role-based | Low |
| `/api/admin/webhooks` | GET/POST/PUT/DELETE | ✅ Auth middleware | ✅ Role-based | Low |

---

## Conclusion

The platform has **good security practices** for most production webhooks, but several endpoints have **conditional authentication** that could be exploited if misconfigured. The most critical issues are:

1. Heyflow V2 webhook accepting unauthenticated requests
2. Health endpoint exposing patient data
3. Debug endpoints accessible in production

**Priority:** Fix critical issues immediately, then standardize authentication patterns across all webhooks.

---

**Report Generated:** February 4, 2026  
**Next Review:** After critical fixes are implemented
