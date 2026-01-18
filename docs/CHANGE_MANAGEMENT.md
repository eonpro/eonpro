# Change Management Guide

> ⚠️ **BEFORE making ANY code changes, follow this checklist.**

---

## Golden Rule

**If it's working, don't touch it unless absolutely necessary.**

---

## Pre-Change Checklist

Before making ANY change, ask:

1. ✅ **Is this change necessary?** What problem does it solve?
2. ✅ **What could break?** List all features that might be affected
3. ✅ **Is there a simpler solution?** Can we fix the issue without changing core code?
4. ✅ **Do we have a rollback plan?** Can we revert if something breaks?

---

## Critical Working Features (DO NOT BREAK)

### 1. Intake Webhook (EONMEDS)
- **Endpoint**: `/api/webhooks/weightlossintake`
- **Status**: ✅ WORKING (verified 2026-01-18)
- **Test**: Submit form at intake.eonmeds.com
- **Dependencies**: 
  - `WEIGHTLOSSINTAKE_WEBHOOK_SECRET` env var
  - Prisma Patient model
  - PDF generation service
  - SOAP note service

### 2. Authentication System
- **Endpoints**: `/api/auth/login`, `/api/auth/register`
- **Token Storage**: localStorage keys: `token`, `auth-token`, `admin-token`, `super_admin-token`
- **Dependencies**: JWT_SECRET env var

### 3. Patient Management
- **Endpoints**: `/api/patients`, `/api/patients/[id]`
- **Protected**: Requires authentication
- **Test**: View patient list, open patient profile

### 4. Provider Management
- **Endpoints**: `/api/providers`, `/api/providers/[id]`
- **Protected**: Requires authentication (admin, super_admin, provider roles)
- **Test**: View providers list, create new provider

### 5. Stripe Integration
- **Endpoints**: `/api/stripe/*`, `/api/stripe/transactions`
- **Dependencies**: STRIPE_SECRET_KEY env var
- **Test**: View transactions page

### 6. Document Viewing
- **Endpoint**: `/api/patients/[id]/documents/[documentId]`
- **Test**: Click "View PDF" on patient intake

### 7. SOAP Notes
- **Endpoint**: `/api/soap-notes`
- **Dependencies**: OPENAI_API_KEY env var
- **Test**: Generate SOAP note from intake

---

## Change Categories

### 🟢 LOW RISK - Safe to change
- Documentation files (*.md)
- Comments in code
- Log messages
- UI text/labels (not functionality)
- New endpoints that don't affect existing ones
- New optional features with feature flags

### 🟡 MEDIUM RISK - Review carefully
- Frontend component changes
- API response format changes
- Adding new parameters to existing functions
- Database queries (read-only)

### 🔴 HIGH RISK - Extreme caution required
- Authentication/authorization changes
- Database schema changes (migrations)
- API endpoint URL changes
- Environment variable changes
- Webhook handlers
- Payment processing code
- Any change to files in "Critical Working Features"

---

## Testing After Changes

### Quick Smoke Test
Run these after EVERY deployment:

```bash
# 1. Check EONPRO is up
curl -s https://app.eonpro.io/api/health | jq '.status'

# 2. Check webhook health
curl -s "https://app.eonpro.io/api/webhooks/health" \
  -H "X-Webhook-Secret: C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=" | jq '.status'

# 3. Check v1 API health
curl -s https://app.eonpro.io/api/v1/health | jq '.status'
```

### Full Regression Test
After significant changes:

1. [ ] Login as admin
2. [ ] View patient list
3. [ ] Open a patient profile
4. [ ] View patient documents (click View PDF)
5. [ ] View SOAP notes tab
6. [ ] Open prescriptions tab
7. [ ] Check providers dropdown loads
8. [ ] View transactions page
9. [ ] Submit test intake form (if webhook changed)

---

## Rollback Procedure

If something breaks:

1. **Identify the breaking commit**
   ```bash
   git log --oneline -10
   ```

2. **Revert the commit**
   ```bash
   git revert <commit-hash>
   git push
   ```

3. **Force redeploy on Vercel** (if needed)
   - Deployments → Latest → Redeploy

4. **Verify fix**
   - Run smoke tests above

---

## Change Log Template

When making changes, document:

```markdown
## Change: [Brief description]
**Date**: YYYY-MM-DD
**Risk Level**: 🟢/🟡/🔴
**Files Changed**:
- file1.ts
- file2.tsx

**Why**: [Reason for change]

**What Could Break**:
- Feature A
- Feature B

**Testing Done**:
- [ ] Smoke test passed
- [ ] Feature A still works
- [ ] Feature B still works

**Rollback**: git revert <commit>
```

---

## Recent Breaking Changes (Learn From These)

### 2026-01-18: Providers API 401
- **What happened**: Added `withAuth` to `/api/providers` GET endpoint
- **What broke**: Prescription form couldn't load providers (missing auth token in frontend)
- **Root cause**: Changed backend without updating frontend
- **Lesson**: When adding auth to an endpoint, update ALL frontend components that use it

---

## Questions to Ask Before ANY Change

1. "Who/what uses this code?"
2. "What happens if this fails?"
3. "Have I tested this locally first?"
4. "Is there existing code that does something similar I should follow?"
5. "Will this change require updates elsewhere?"
