# EONMEDS Clinic Configuration

> **Clinic ID**: 3  
> **Subdomain**: eonmeds  
> **Status**: ✅ ACTIVE  
> **Last Verified**: 2026-01-18

---

## Overview

EONMEDS is a weight loss clinic using EONPRO for patient management. They have a custom intake form
that sends patient data to EONPRO.

---

## Intake Platform

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **URL**            | `https://intake.eonmeds.com`         |
| **Vercel Project** | `eonpro1s-projects/weightlossintake` |
| **GitHub Repo**    | `eonpro/weightlossintake`            |

---

## Webhook Configuration

### EONPRO Side (app.eonpro.io)

| Environment Variable              | Value                                          |
| --------------------------------- | ---------------------------------------------- |
| `WEIGHTLOSSINTAKE_WEBHOOK_SECRET` | `C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=` |

**Webhook Endpoint**: `https://app.eonpro.io/api/webhooks/weightlossintake`

### Intake Platform Side (intake.eonmeds.com)

| Environment Variable    | Value                                                 |
| ----------------------- | ----------------------------------------------------- |
| `EONPRO_WEBHOOK_URL`    | `https://app.eonpro.io/api/webhooks/weightlossintake` |
| `EONPRO_WEBHOOK_SECRET` | `C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=`        |

---

## Data Flow

```
Patient → intake.eonmeds.com → /api/airtable → sendToEonpro()
                                                    ↓
                              app.eonpro.io/api/webhooks/weightlossintake
                                                    ↓
                              ┌─────────────────────────────────┐
                              │ EONMEDS Clinic (ID: 3)          │
                              │ - Create Patient                │
                              │ - Generate PDF Intake Form      │
                              │ - Generate SOAP Note            │
                              │ - Track Referral Codes          │
                              └─────────────────────────────────┘
```

---

## Features Enabled

| Feature            | Status | Notes                                 |
| ------------------ | ------ | ------------------------------------- |
| Patient Intake     | ✅     | Via webhook                           |
| PDF Generation     | ✅     | Auto-generated                        |
| SOAP Notes         | ✅     | AI-generated for complete submissions |
| Referral Tracking  | ✅     | Promo codes tracked                   |
| Partial Leads      | ✅     | Tagged as `partial-lead`              |
| Stripe Integration | ✅     | Connected                             |
| Lifefile Pharmacy  | 🔧     | Pending configuration                 |

---

## Clinic-Specific Settings

### Tags Applied to Patients

- `complete-intake` - Full form submission
- `partial-lead` - Incomplete submission
- `needs-followup` - Partial leads needing contact
- `eonmeds` - Clinic identifier

### SOAP Note Format

Uses the EONMEDS telehealth weight management template with:

- GLP-1 medication assessment
- BMI calculation
- Medical necessity documentation
- Provider attestation section

---

## Verification

### Check webhook health:

```bash
curl -s "https://app.eonpro.io/api/webhooks/health" \
  -H "X-Webhook-Secret: C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=" | jq '.'
```

### Check intake platform EMR config:

```bash
curl -s "https://intake.eonmeds.com/api/emr/health"
# Should show: "configured": true
```

### Search for EONMEDS patients:

```bash
curl -s "https://app.eonpro.io/api/webhooks/health?patient=SEARCH_NAME" \
  -H "X-Webhook-Secret: C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=" | jq '.patients'
```

---

## Contacts

| Role              | Contact     |
| ----------------- | ----------- |
| Technical Support | EONPRO Team |
| Clinic Admin      | TBD         |

---

## History

| Date       | Change                                    | Verified By |
| ---------- | ----------------------------------------- | ----------- |
| 2026-01-18 | Initial webhook setup                     | System      |
| 2026-01-18 | Fixed env var name (`EONPRO_WEBHOOK_URL`) | System      |
| 2026-01-18 | First successful patient: Winnie French   | System      |

---

## ⚠️ DO NOT MODIFY

The following are critical and should not be changed without testing:

1. Environment variables (both platforms)
2. Webhook endpoint URL
3. Secret key
4. Clinic ID assignment in webhook code
