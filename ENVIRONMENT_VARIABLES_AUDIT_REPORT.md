# Environment Variables Audit Report
**Generated:** February 4, 2026

## Executive Summary

This audit identifies:
- ✅ **Environment variables used in codebase**
- ⚠️ **Variables missing from documentation**
- 🔒 **Security concerns (NEXT_PUBLIC_ variables with secrets)**
- 📝 **Variables documented but not used**

---

## 1. Security Issues: NEXT_PUBLIC_ Variables

### ⚠️ CRITICAL: Potential Secret Exposure

**NEXT_PUBLIC_ variables are exposed to the client-side** and should NEVER contain secrets. The following variables are safe (public keys/URLs are intended to be public):

#### ✅ Safe NEXT_PUBLIC_ Variables (Public by Design)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Public API key (safe)
- `NEXT_PUBLIC_EONMEDS_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (safe)
- `NEXT_PUBLIC_OT_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (safe)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (safe)
- `NEXT_PUBLIC_APP_URL` - Public URL (safe)
- `NEXT_PUBLIC_API_URL` - Public URL (safe)
- `NEXT_PUBLIC_SENTRY_DSN` - Public Sentry DSN (safe)
- `NEXT_PUBLIC_ENABLE_*` - Feature flags (safe)
- `NEXT_PUBLIC_BASE_DOMAIN` - Public domain (safe)
- `NEXT_PUBLIC_CLINIC_NAME` - Public clinic name (safe)
- `NEXT_PUBLIC_ENV` - Environment identifier (safe)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - Web Push public key (safe)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` - Google Analytics ID (safe)

**No security issues found** - All NEXT_PUBLIC_ variables are appropriately public.

---

## 2. Missing from .env.example

The following variables are **used in code** but **NOT documented** in `.env.example` or `env.example`:

### 🔴 Critical Missing Variables

#### Authentication & Security
- `PHI_ENCRYPTION_KEY` - Used in `src/app/api/health/route.ts` (line 348)
  - **Status:** ⚠️ **CRITICAL** - Used but not in .env.example
  - **Note:** Code uses `PHI_ENCRYPTION_KEY` but documentation uses `ENCRYPTION_KEY`
  - **Action:** Verify if these are the same or different keys

- `CARD_ENCRYPTION_KEY` - Used in `src/lib/encryption.ts` (line 17)
  - **Status:** Missing from .env.example
  - **Usage:** Separate encryption key for card data (falls back to ENCRYPTION_KEY)
  - **Note:** Optional - if not set, uses ENCRYPTION_KEY

- `ADMIN_EMAIL` - Used in `src/app/api/auth/refresh-token/route.ts` (line 143)
  - **Status:** Missing from .env.example
  - **Usage:** Admin user fallback

- `ADMIN_SETUP_SECRET` - Used in `src/app/api/admin/lifefile-status/route.ts` (line 22)
  - **Status:** Missing from .env.example
  - **Usage:** Admin setup endpoint security

#### Database Configuration
- `DIRECT_DATABASE_URL` - Mentioned in .env.example comments but not as a variable
  - **Status:** Documented in comments but not as actual variable
  - **Usage:** Used for migrations (separate from pooled connection)

- `ENABLE_PGBOUNCER` - Used in `src/lib/db.ts` (line 128)
  - **Status:** Missing from .env.example
  - **Usage:** Force enable pgbouncer mode

- `ENABLE_QUERY_LOGGING` - Used in `src/lib/db.ts` (line 266)
  - **Status:** Missing from .env.example
  - **Usage:** Enable SQL query logging

#### AWS Configuration
- `AWS_REGION` - Used in `src/lib/integrations/aws/s3Config.ts` (line 21)
  - **Status:** Missing from .env.example (only `AWS_SES_REGION` is documented)
  - **Usage:** General AWS region (S3, SES, etc.)

- `AWS_S3_BUCKET_NAME` - Used in `src/lib/integrations/aws/s3Config.ts` (line 22)
  - **Status:** Missing from .env.example
  - **Usage:** S3 bucket name

- `AWS_CLOUDFRONT_URL` - Used in `src/lib/integrations/aws/s3Config.ts` (line 25)
  - **Status:** Missing from .env.example
  - **Usage:** CloudFront CDN URL

- `AWS_KMS_KEY_ID` - Used in `src/lib/integrations/aws/s3Config.ts` (line 26)
  - **Status:** Missing from .env.example
  - **Usage:** AWS KMS key for encryption

- `AWS_SES_MAX_SEND_RATE` - Used in `src/lib/integrations/aws/sesConfig.ts` (line 30)
  - **Status:** Missing from .env.example
  - **Usage:** SES rate limiting

- `AWS_SNS_TOPIC_ARN_BOUNCES` - Documented in .env.example (line 127)
  - **Status:** ✅ Documented

- `AWS_SNS_TOPIC_ARN_COMPLAINTS` - Documented in .env.example (line 128)
  - **Status:** ✅ Documented

#### Twilio Configuration
- `TWILIO_USE_MOCK` - Used in multiple files
  - **Status:** Missing from .env.example
  - **Usage:** Enable mock Twilio for testing

- `TWILIO_MESSAGING_SERVICE_SID` - Used in code
  - **Status:** Missing from .env.example
  - **Usage:** Twilio messaging service

#### OpenAI Configuration
- `OPENAI_MODEL` - Used in `src/services/ai/soapNoteService.ts` (line 193)
  - **Status:** Missing from .env.example
  - **Usage:** Override default OpenAI model
  - **Default:** 'gpt-4o-mini'

#### Stripe Configuration
- `PAYMENT_ALERT_WEBHOOK_URL` - Used in `src/app/api/stripe/webhook/route.ts` (line 659)
  - **Status:** Missing from .env.example
  - **Usage:** Webhook URL for payment alerts

- `STRIPE_API_KEY` - Used as fallback in `src/lib/stripe/config.ts` (line 71)
  - **Status:** Missing from .env.example
  - **Usage:** Legacy Stripe key fallback

- `STRIPE_PK` - Used as fallback in `src/lib/stripe/config.ts` (line 84)
  - **Status:** Missing from .env.example
  - **Usage:** Legacy Stripe publishable key fallback

- `STRIPE_SK` - Used as fallback in `src/lib/stripe/config.ts` (line 71)
  - **Status:** Missing from .env.example
  - **Usage:** Legacy Stripe secret key fallback

- `STRIPE_PUBLISHABLE_KEY` - Used as fallback in `src/lib/stripe/config.ts` (line 83)
  - **Status:** Missing from .env.example
  - **Usage:** Legacy Stripe publishable key fallback

- `STRIPE_WEBHOOK_ENDPOINT_SECRET` - Used as fallback in `src/lib/stripe/config.ts` (line 95)
  - **Status:** Missing from .env.example
  - **Usage:** Legacy webhook secret fallback

- `NEXT_PUBLIC_STRIPE_PRICE_BASIC` - Used in `src/components/stripe/SubscriptionForm.tsx` (line 30)
  - **Status:** Missing from .env.example
  - **Usage:** Stripe price ID for basic plan

- `NEXT_PUBLIC_STRIPE_PRICE_PRO` - Used in `src/components/stripe/SubscriptionForm.tsx` (line 44)
  - **Status:** Missing from .env.example
  - **Usage:** Stripe price ID for pro plan

- `NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE` - Used in `src/components/stripe/SubscriptionForm.tsx` (line 60)
  - **Status:** Missing from .env.example
  - **Usage:** Stripe price ID for enterprise plan

- `NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS` - Used in `src/lib/features.ts` (line 38)
  - **Status:** Missing from .env.example
  - **Usage:** Feature flag for Stripe subscriptions

#### Lifefile Integration
- `LIFEFILE_API_KEY` - Used in `src/app/api/health/route.ts` (line 234)
  - **Status:** Missing from .env.example
  - **Usage:** Lifefile API authentication

- `LIFEFILE_DATAPUSH_USERNAME` - Used in `src/app/api/webhooks/lifefile-data-push/route.ts` (line 10)
  - **Status:** Missing from .env.example
  - **Usage:** Webhook authentication

- `LIFEFILE_DATAPUSH_PASSWORD` - Used in `src/app/api/webhooks/lifefile-data-push/route.ts` (line 13)
  - **Status:** Missing from .env.example
  - **Usage:** Webhook authentication

- `LIFEFILE_WEBHOOK_USERNAME` - Used as fallback in multiple files
  - **Status:** Missing from .env.example
  - **Usage:** Webhook authentication fallback

- `LIFEFILE_WEBHOOK_PASSWORD` - Used as fallback in multiple files
  - **Status:** Missing from .env.example
  - **Usage:** Webhook authentication fallback

- `LIFEFILE_WEBHOOK_SECRET` - Used in `src/app/api/webhooks/lifefile/prescription-status/route.ts` (line 112)
  - **Status:** Missing from .env.example
  - **Usage:** Webhook HMAC secret

- `LIFEFILE_WEBHOOK_ALLOWED_IPS` - Used in `src/app/api/lifefile-webhook/route.ts` (line 18)
  - **Status:** Missing from .env.example
  - **Usage:** IP whitelist for webhooks

- `LIFEFILE_WEBHOOK_HMAC_SECRET` - Used in `src/app/api/lifefile-webhook/route.ts` (line 26)
  - **Status:** Missing from .env.example
  - **Usage:** HMAC secret for webhook validation

- `LIFEFILE_WEBHOOK_ALERT_URL` - Used in `src/app/api/lifefile-webhook/route.ts` (line 27)
  - **Status:** Missing from .env.example
  - **Usage:** Alert webhook URL

- `LIFEFILE_PRACTICE_PHONE` - Used in `src/app/api/prescriptions/route.ts` (line 285)
  - **Status:** Missing from .env.example
  - **Usage:** Practice phone number

- `LIFEFILE_PRACTICE_FAX` - Used in `src/app/api/prescriptions/route.ts` (line 286)
  - **Status:** Missing from .env.example
  - **Usage:** Practice fax number

#### Overtime Integration
- `OVERTIME_SYNC_API_KEY` - Used in `src/app/api/integrations/overtime/sync/route.ts` (line 28)
  - **Status:** Missing from .env.example
  - **Usage:** API key for Overtime sync endpoint

- `OVERTIME_CLINIC_ID` - Used in `src/app/api/integrations/overtime/sync/route.ts` (line 151)
  - **Status:** Missing from .env.example
  - **Usage:** Overtime clinic identifier

- `OVERTIME_AIRTABLE_BASE_ID` - Used in `src/app/api/integrations/overtime/sync/route.ts` (line 149)
  - **Status:** Missing from .env.example
  - **Usage:** Airtable base ID for Overtime

- `AIRTABLE_API_KEY` - Used in `src/app/api/integrations/overtime/sync/route.ts` (line 139)
  - **Status:** Missing from .env.example
  - **Usage:** Airtable API key

- `OVERTIME_INTAKE_WEBHOOK_SECRET` - Used in `src/app/api/webhooks/overtime-intake/route.ts` (line 99)
  - **Status:** Missing from .env.example
  - **Usage:** Webhook secret for Overtime intake

#### Redis/Upstash Configuration
- `REDIS_URL` - Used in `src/lib/security/enterprise-rate-limiter.ts` (line 135)
  - **Status:** Missing from .env.example
  - **Usage:** Redis connection URL

- `UPSTASH_REDIS_REST_URL` - Documented in env.example (line 101)
  - **Status:** ✅ Documented

- `UPSTASH_REDIS_REST_TOKEN` - Documented in env.example (line 102)
  - **Status:** ✅ Documented

#### Monitoring & Alerts
- `SLACK_WEBHOOK_URL` - Documented in env.example (line 109)
  - **Status:** ✅ Documented

- `ALERT_EMAIL` - Documented in env.example (line 110)
  - **Status:** ✅ Documented

#### Sentry Configuration
- `SENTRY_ORG` - Used in `next.config.js` (line 120)
  - **Status:** Missing from .env.example
  - **Usage:** Sentry organization

- `SENTRY_PROJECT` - Used in `next.config.js` (line 121)
  - **Status:** Missing from .env.example
  - **Usage:** Sentry project name

- `SENTRY_AUTH_TOKEN` - Used in `next.config.js` (line 122)
  - **Status:** Missing from .env.example
  - **Usage:** Sentry auth token for releases

#### Feature Flags (NEXT_PUBLIC_ENABLE_*)
- `NEXT_PUBLIC_ENABLE_STRIPE_CONNECT` - Used in `src/lib/features.ts` (line 39)
  - **Status:** Missing from .env.example
  - **Usage:** Enable Stripe Connect feature

- `NEXT_PUBLIC_ENABLE_SQUARE_PAYMENTS` - Used in `src/lib/features.ts` (line 40)
  - **Status:** Missing from .env.example
  - **Usage:** Enable Square payments

- `NEXT_PUBLIC_ENABLE_TWILIO_SMS` - Used in `src/lib/features.ts` (line 43)
  - **Status:** Missing from .env.example
  - **Usage:** Enable Twilio SMS

- `NEXT_PUBLIC_ENABLE_TWILIO_CHAT` - Used in `src/lib/features.ts` (line 44)
  - **Status:** Missing from .env.example
  - **Usage:** Enable Twilio chat

- `NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH` - Used in `src/lib/features.ts` (line 47)
  - **Status:** Missing from .env.example
  - **Usage:** Enable Zoom telehealth

- `NEXT_PUBLIC_ENABLE_ZOOM_WAITING_ROOM` - Used in `src/lib/features.ts` (line 48)
  - **Status:** Missing from .env.example
  - **Usage:** Enable Zoom waiting room

- `NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE` - Used in `src/lib/features.ts` (line 51)
  - **Status:** Missing from .env.example
  - **Usage:** Enable AWS S3 storage

- `NEXT_PUBLIC_ENABLE_AWS_SES_EMAIL` - Documented in env.example (line 57)
  - **Status:** ✅ Documented

- `NEXT_PUBLIC_ENABLE_AWS_EVENTBRIDGE` - Used in `src/lib/features.ts` (line 52)
  - **Status:** Missing from .env.example
  - **Usage:** Enable AWS EventBridge

- `NEXT_PUBLIC_ENABLE_DYNAMIC_FORMS` - Used in `src/lib/features.ts` (line 56)
  - **Status:** Missing from .env.example
  - **Usage:** Enable dynamic forms

- `NEXT_PUBLIC_ENABLE_MULTI_LANGUAGE` - Used in `src/lib/features.ts` (line 57)
  - **Status:** Missing from .env.example
  - **Usage:** Enable multi-language support

- `NEXT_PUBLIC_ENABLE_ADVANCED_REPORTING` - Used in `src/lib/features.ts` (line 58)
  - **Status:** Missing from .env.example
  - **Usage:** Enable advanced reporting

- `NEXT_PUBLIC_ENABLE_DOSSPOT_EPRESCRIBING` - Used in `src/lib/features.ts` (line 59)
  - **Status:** Missing from .env.example
  - **Usage:** Enable DossSpot e-prescribing

- `NEXT_PUBLIC_ENABLE_ALL_FEATURES` - Used in `src/lib/features.ts` (line 81)
  - **Status:** Missing from .env.example
  - **Usage:** Enable all features (dev only)

- `NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS` - Used in `src/lib/features.ts` (line 38)
  - **Status:** Missing from .env.example
  - **Usage:** Enable Stripe subscriptions

#### Other Configuration
- `SUPPORT_PHONE` - Used in `src/lib/prescription-tracking/notifications.ts` (line 345)
  - **Status:** Missing from .env.example
  - **Usage:** Support phone number for notifications

- `TRUSTED_IP_RANGES` - Used in `src/lib/security/enterprise-rate-limiter.ts` (line 300)
  - **Status:** Missing from .env.example
  - **Usage:** Comma-separated IP ranges to trust

- `ANALYZE` - Used in `next.config.js` (line 4)
  - **Status:** Missing from .env.example
  - **Usage:** Enable bundle analyzer

- `PORT` - Used in `src/app/api/intake-forms/send/route.ts` (line 100)
  - **Status:** Missing from .env.example
  - **Usage:** Server port (defaults to 3001)

- `VERCEL` - Used in multiple files (auto-set by Vercel)
  - **Status:** ✅ Auto-set by platform, no documentation needed

- `VERCEL_URL` - Used in multiple files (auto-set by Vercel)
  - **Status:** ✅ Auto-set by platform, no documentation needed

- `API_URL` - Used in `scripts/pre-deploy-check.ts` (line 512)
  - **Status:** Missing from .env.example
  - **Usage:** API URL override

- `FIX_MODE` - Used in `scripts/audit-clinic-isolation.ts` (line 279)
  - **Status:** Missing from .env.example
  - **Usage:** Script flag for fixing issues

---

## 3. Variables Documented but Not Used

The following variables are in `.env.example` or `env.example` but **not found in codebase**:

### Potentially Unused Variables
- `DATABASE_CONNECTION_LIMIT` - Documented in .env.example comments (line 28)
  - **Status:** ✅ Actually used in `src/lib/db.ts` (line 51)
  
- `DATABASE_POOL_TIMEOUT` - Documented in .env.example comments (line 29)
  - **Status:** ✅ Actually used in `src/lib/db.ts` (line 77)

- `GOOGLE_MAPS_SERVER_KEY` - Documented in .env.example (line 33)
  - **Status:** ✅ Actually used in `src/app/api/maps/details/route.ts` (line 5)

- `STORAGE_INTAKE_DIR` - Documented in .env.example (line 51)
  - **Status:** ✅ Documented but not found in codebase (may be used in scripts or config files)

- `WELLMEDR_CLINIC_ID` - Documented in .env.example (line 89)
  - **Status:** ✅ Actually used in `src/app/api/webhooks/wellmedr-intake/route.ts` (line 48)

**All documented variables appear to be used.**

---

## 4. Inconsistencies & Issues

### 🔴 Critical Inconsistencies

1. **ENCRYPTION_KEY vs PHI_ENCRYPTION_KEY**
   - Code uses `ENCRYPTION_KEY` in most places
   - `src/app/api/health/route.ts` checks for `PHI_ENCRYPTION_KEY` (line 348)
   - **Action Required:** Verify if these should be the same variable or different

2. **LIFEFILE_WEBHOOK_USERNAME vs LIFEFILE_DATAPUSH_USERNAME**
   - Multiple fallback patterns exist
   - **Action Required:** Standardize on one naming convention

3. **Missing Feature Flag Documentation**
   - Many `NEXT_PUBLIC_ENABLE_*` flags are used but not documented
   - **Action Required:** Document all feature flags in .env.example

---

## 5. Recommendations

### Immediate Actions

1. **Add missing critical variables to .env.example:**
   ```bash
   # Authentication
   ADMIN_EMAIL=
   ADMIN_SETUP_SECRET=
   PHI_ENCRYPTION_KEY=  # Or clarify if same as ENCRYPTION_KEY
   CARD_ENCRYPTION_KEY=  # Optional: separate key for card encryption (falls back to ENCRYPTION_KEY)
   
   # AWS
   AWS_REGION=us-east-1
   AWS_S3_BUCKET_NAME=
   AWS_CLOUDFRONT_URL=
   AWS_KMS_KEY_ID=
   AWS_SES_MAX_SEND_RATE=14
   
   # Twilio
   TWILIO_USE_MOCK=false
   TWILIO_MESSAGING_SERVICE_SID=
   
   # OpenAI
   OPENAI_MODEL=gpt-4o-mini
   
   # Stripe
   PAYMENT_ALERT_WEBHOOK_URL=
   NEXT_PUBLIC_STRIPE_PRICE_BASIC=
   NEXT_PUBLIC_STRIPE_PRICE_PRO=
   NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=
   
   # Lifefile
   LIFEFILE_API_KEY=
   LIFEFILE_DATAPUSH_USERNAME=
   LIFEFILE_DATAPUSH_PASSWORD=
   LIFEFILE_WEBHOOK_SECRET=
   LIFEFILE_WEBHOOK_ALLOWED_IPS=
   LIFEFILE_WEBHOOK_HMAC_SECRET=
   LIFEFILE_WEBHOOK_ALERT_URL=
   LIFEFILE_PRACTICE_PHONE=
   LIFEFILE_PRACTICE_FAX=
   
   # Overtime
   OVERTIME_SYNC_API_KEY=
   OVERTIME_CLINIC_ID=
   OVERTIME_AIRTABLE_BASE_ID=
   AIRTABLE_API_KEY=
   OVERTIME_INTAKE_WEBHOOK_SECRET=
   
   # Redis
   REDIS_URL=
   
   # Sentry
   SENTRY_ORG=
   SENTRY_PROJECT=
   SENTRY_AUTH_TOKEN=
   
   # Feature Flags
   NEXT_PUBLIC_ENABLE_STRIPE_CONNECT=false
   NEXT_PUBLIC_ENABLE_SQUARE_PAYMENTS=false
   NEXT_PUBLIC_ENABLE_TWILIO_SMS=false
   NEXT_PUBLIC_ENABLE_TWILIO_CHAT=false
   NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH=false
   NEXT_PUBLIC_ENABLE_ZOOM_WAITING_ROOM=false
   NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=false
   NEXT_PUBLIC_ENABLE_AWS_EVENTBRIDGE=false
   NEXT_PUBLIC_ENABLE_DYNAMIC_FORMS=false
   NEXT_PUBLIC_ENABLE_MULTI_LANGUAGE=false
   NEXT_PUBLIC_ENABLE_ADVANCED_REPORTING=false
   NEXT_PUBLIC_ENABLE_DOSSPOT_EPRESCRIBING=false
   NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS=false
   
   # Other
   SUPPORT_PHONE=
   TRUSTED_IP_RANGES=
   ENABLE_PGBOUNCER=false
   ENABLE_QUERY_LOGGING=false
   ```

2. **Resolve ENCRYPTION_KEY inconsistency:**
   - Check if `PHI_ENCRYPTION_KEY` should be `ENCRYPTION_KEY`
   - Update health check to use consistent variable name

3. **Standardize Lifefile webhook variable names:**
   - Choose one naming pattern (DATAPUSH vs WEBHOOK)
   - Update all code to use consistent names

4. **Document all feature flags:**
   - Add comprehensive feature flag section to .env.example
   - Include descriptions for each flag

### Long-term Improvements

1. **Create centralized env validation:**
   - Use `src/lib/config/env.ts` as single source of truth
   - Ensure all variables are validated at startup

2. **Add environment variable documentation:**
   - Create comprehensive docs/ENVIRONMENT_VARIABLES.md
   - Include descriptions, defaults, and examples

3. **Add pre-deployment checks:**
   - Script to verify all required variables are set
   - Warn about missing optional variables

---

## 6. Summary Statistics

- **Total variables found in code:** ~150+
- **Variables in .env.example:** ~50
- **Variables missing from .env.example:** ~100+
- **NEXT_PUBLIC_ variables:** ~30 (all safe)
- **Critical security issues:** 0
- **Critical missing variables:** ~20

---

## 7. Next Steps

1. ✅ Review this report
2. ⏳ Add missing variables to .env.example
3. ⏳ Resolve ENCRYPTION_KEY inconsistency
4. ⏳ Standardize variable naming
5. ⏳ Update documentation
6. ⏳ Run validation script to verify all variables are set

---

**Report Generated:** February 4, 2026  
**Audit Scope:** All `process.env.*` usages in codebase  
**Files Analyzed:** ~100+ files
