# {CLINIC_NAME} Clinic Configuration

> **Clinic ID**: {ID}  
> **Subdomain**: {subdomain}  
> **Status**: 🔧 PENDING / ✅ ACTIVE  
> **Last Verified**: {DATE}

---

## Overview

{Brief description of the clinic and their use case}

---

## Intake Platform

| Field | Value |
|-------|-------|
| **URL** | `https://{intake-url}` |
| **Vercel Project** | `{vercel-project}` |
| **GitHub Repo** | `{github-repo}` |

---

## Webhook Configuration

### EONPRO Side (app.eonpro.io)

| Environment Variable | Value |
|---------------------|-------|
| `{CLINIC}_WEBHOOK_SECRET` | `{secret}` |

**Webhook Endpoint**: `https://app.eonpro.io/api/webhooks/{endpoint}`

### Intake Platform Side

| Environment Variable | Value |
|---------------------|-------|
| `EONPRO_WEBHOOK_URL` | `https://app.eonpro.io/api/webhooks/{endpoint}` |
| `EONPRO_WEBHOOK_SECRET` | `{secret}` |

---

## Data Flow

```
Patient → {intake-url} → {submission-path}
                              ↓
              app.eonpro.io/api/webhooks/{endpoint}
                              ↓
              ┌─────────────────────────────────┐
              │ {CLINIC_NAME} Clinic (ID: {ID}) │
              │ - Create Patient                │
              │ - Generate PDF Intake Form      │
              │ - Generate SOAP Note            │
              └─────────────────────────────────┘
```

---

## Features Enabled

| Feature | Status | Notes |
|---------|--------|-------|
| Patient Intake | ⬜ | |
| PDF Generation | ⬜ | |
| SOAP Notes | ⬜ | |
| Referral Tracking | ⬜ | |
| Stripe Integration | ⬜ | |
| Lifefile Pharmacy | ⬜ | |

---

## Verification

### Check webhook health:
```bash
curl -s "https://app.eonpro.io/api/webhooks/health" \
  -H "X-Webhook-Secret: {secret}" | jq '.'
```

---

## Contacts

| Role | Contact |
|------|---------|
| Technical Support | |
| Clinic Admin | |

---

## History

| Date | Change | Verified By |
|------|--------|-------------|
| {DATE} | Initial setup | |

---

## ⚠️ DO NOT MODIFY

The following are critical and should not be changed without testing:

1. Environment variables (both platforms)
2. Webhook endpoint URL
3. Secret key
4. Clinic ID assignment
