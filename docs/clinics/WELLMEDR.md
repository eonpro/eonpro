# WELLMEDR Clinic Configuration

> **Clinic Name**: Wellmedr LLC  
> **Subdomain**: wellmedr  
> **Status**: ✅ ACTIVE  
> **Last Verified**: 2026-01-24

---

## Overview

Wellmedr is a GLP-1 weight loss clinic using EONPRO for patient management. They have a custom intake form at https://intake.wellmedr.com that sends patient data to EONPRO via Airtable automation.

---

## Intake Platform

| Field | Value |
|-------|-------|
| **URL** | `https://intake.wellmedr.com` |
| **Airtable Base** | `app3usm1VtzcWOvZW` |
| **Airtable Table** | `tbln93c69GlrNGEqa` |

---

## Webhook Configuration

### EONPRO Side (app.eonpro.io)

| Environment Variable | Value |
|---------------------|-------|
| `WELLMEDR_INTAKE_WEBHOOK_SECRET` | `<configured in production>` |

**Webhook Endpoint**: `https://app.eonpro.io/api/webhooks/wellmedr-intake`

### Airtable Automation Side

Configure the Airtable automation to send a POST request with:

| Setting | Value |
|---------|-------|
| **URL** | `https://app.eonpro.io/api/webhooks/wellmedr-intake` |
| **Method** | `POST` |
| **Headers** | `x-webhook-secret: <your-secret>` |
| **Body** | JSON with all intake form fields |

---

## Data Flow

```
Patient → intake.wellmedr.com → Airtable (tbln93c69GlrNGEqa)
                                         ↓
                              Airtable Automation
                                         ↓
                    app.eonpro.io/api/webhooks/wellmedr-intake
                                         ↓
                    ┌────────────────────────────────────────┐
                    │ Wellmedr Clinic                        │
                    │ - Create/Update Patient                │
                    │ - Generate PDF Intake Form             │
                    │ - Generate SOAP Note (if checkout done)│
                    │ - Track Referral Codes                 │
                    └────────────────────────────────────────┘
```

---

## Features Enabled

| Feature | Status | Notes |
|---------|--------|-------|
| Patient Intake | ✅ | Via webhook from Airtable |
| PDF Generation | ✅ | Auto-generated, stored in S3 |
| SOAP Notes | ✅ | AI-generated for complete submissions |
| Referral Tracking | ✅ | Promo codes tracked |
| Partial Leads | ✅ | Tagged as `partial-lead` when checkout incomplete |
| Lifefile Pharmacy | ✅ | Credentials configured |

---

## Form Field Mapping (47 fields)

### Patient Identity (7 fields → Patient model)

| Wellmedr Field | Database Field | Notes |
|----------------|----------------|-------|
| `first-name` | `firstName` | Capitalized |
| `last-name` | `lastName` | Capitalized |
| `email` | `email` | Lowercase |
| `phone` | `phone` | Digits only |
| `state` | `state` | 2-letter code |
| `dob` | `dob` | YYYY-MM-DD |
| `sex` | `gender` | m/f |

### Body Metrics (5 fields)
- `feet`, `inches` → Height
- `weight` → Current weight (lbs)
- `goal-weight` → Target weight (lbs)
- `bmi` → Calculated BMI

### Vitals & Health (3 fields)
- `avg-blood-pressure-range`
- `avg-resting-heart-rate`
- `weight-related-symptoms`

### Medical History (6 fields)
- `health-conditions`, `health-conditions-2`
- `type-2-diabetes`
- `men2-history` ⚠️ GLP-1 contraindication flag
- `bariatric`, `bariatric-details`

### Lifestyle & Goals (7 fields)
- `reproductive-status`
- `sleep-quality`
- `primary-fitness-goal`
- `weight-loss-motivation`
- `motivation-level`
- `pace`
- `affordability-potency`

### Medication Preferences & GLP-1 History (9 fields)
- `preferred-meds` (Semaglutide/Tirzepatide/Open)
- `injections-tablets`
- `glp1-last-30` (Y/N)
- `glp1-last-30-medication-type`
- `glp1-last-30-medication-dose-mg`
- `glp1-last-30-medication-dose-other`
- `glp1-last-30-other-medication-name`
- `current-meds`, `current-meds-details`

### Risk Screening (3 fields)
- `opioids`, `opioids-details`
- `allergies`

### Compliance & Checkout (5 fields)
- `additional-info`, `additional-info-details`
- `hipaa-agreement`
- `Checkout Completed` ← **Determines if complete submission**
- `Checkout Completed 2`

---

## Submission Types

| Condition | Type | Tags Applied | SOAP Generated |
|-----------|------|--------------|----------------|
| `Checkout Completed` = true | Complete | `complete-intake`, `wellmedr`, `glp1` | ✅ Yes |
| `Checkout Completed` = false | Partial | `partial-lead`, `needs-followup`, `wellmedr`, `glp1` | ❌ No |

---

## Airtable Automation Script

Sample JavaScript for Airtable automation:

```javascript
// Airtable Automation Script - Send to EONPRO
const WEBHOOK_URL = 'https://app.eonpro.io/api/webhooks/wellmedr-intake';
const WEBHOOK_SECRET = 'your-secret-here';

let inputConfig = input.config();
let record = inputConfig.record;

// Build payload from Airtable record
const payload = {
  'submission-id': record.id,
  'submission-date': new Date().toISOString(),
  'first-name': record.getCellValue('First Name'),
  'last-name': record.getCellValue('Last Name'),
  'email': record.getCellValue('Email'),
  'phone': record.getCellValue('Phone'),
  'state': record.getCellValue('State'),
  'dob': record.getCellValue('Date of Birth'),
  'sex': record.getCellValue('Sex'),
  'feet': record.getCellValue('Height Feet'),
  'inches': record.getCellValue('Height Inches'),
  'weight': record.getCellValue('Weight'),
  'goal-weight': record.getCellValue('Goal Weight'),
  'bmi': record.getCellValue('BMI'),
  // ... add all other fields
  'Checkout Completed': record.getCellValue('Checkout Completed'),
};

// Send to EONPRO
const response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': WEBHOOK_SECRET,
  },
  body: JSON.stringify(payload),
});

const result = await response.json();
console.log('EONPRO Response:', result);

// Update Airtable with EONPRO Patient ID
if (result.success && result.eonproPatientId) {
  // Optionally update the record with the EONPRO patient ID
  output.set('eonproPatientId', result.eonproPatientId);
  output.set('eonproDatabaseId', result.eonproDatabaseId);
}
```

---

## Verification

### Check webhook health:
```bash
curl -s "https://app.eonpro.io/api/webhooks/wellmedr-intake" | jq '.'
```

Expected response:
```json
{
  "status": "ok",
  "endpoint": "/api/webhooks/wellmedr-intake",
  "clinic": "Wellmedr",
  "intakeUrl": "https://intake.wellmedr.com",
  "configured": true
}
```

### Test webhook with sample data:
```bash
curl -X POST "https://app.eonpro.io/api/webhooks/wellmedr-intake" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{
    "submission-id": "test-001",
    "first-name": "Test",
    "last-name": "Patient",
    "email": "test@example.com",
    "phone": "5551234567",
    "state": "FL",
    "dob": "1990-01-15",
    "sex": "Male",
    "Checkout Completed": true
  }'
```

---

## Response Format

Successful response includes EONPRO IDs for bidirectional sync:

```json
{
  "success": true,
  "requestId": "uuid",
  "eonproPatientId": "000123",
  "eonproDatabaseId": 123,
  "submissionId": "test-001",
  "patient": {
    "id": 123,
    "patientId": "000123",
    "name": "Test Patient",
    "email": "test@example.com",
    "isNew": true
  },
  "submission": {
    "checkoutCompleted": true,
    "isPartial": false
  },
  "document": {
    "id": 456,
    "filename": "wellmedr-intake-test-001.pdf"
  },
  "soapNote": {
    "id": 789,
    "status": "DRAFT"
  },
  "clinic": {
    "id": 5,
    "name": "Wellmedr"
  },
  "processingTime": "1234ms"
}
```

---

## Contacts

| Role | Contact |
|------|---------|
| Technical Support | EONPRO Team |
| Clinic Admin | Dr. Sigle (rsigle@wellmedr.com) |

---

## History

| Date | Change | Verified By |
|------|--------|-------------|
| 2026-01-24 | Initial webhook setup | System |
| 2026-01-24 | Documented 47 form fields | System |

---

## ⚠️ DO NOT MODIFY

The following are critical and should not be changed without testing:

1. Environment variables (both platforms)
2. Webhook endpoint URL
3. Secret key
4. Clinic lookup (subdomain: `wellmedr`)
5. Field mapping in normalizer
