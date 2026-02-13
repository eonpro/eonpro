# Overtime Men's Clinic Integration

This document describes the integration between Overtime Men's Clinic's Heyflow/Airtable intake
system and EONPRO.

## Overview

Overtime Men's Clinic uses Heyflow forms to collect patient intake information. This data flows to 6
separate Airtable tables (one per treatment type), and then to EONPRO.

## Integration Methods

| Method           | Description                    | Pros                                 | Cons                          |
| ---------------- | ------------------------------ | ------------------------------------ | ----------------------------- |
| **API Sync** ⭐  | EONPRO pulls from Airtable API | Single config, no Airtable scripting | Polling delay (1-15 min)      |
| **Webhook Push** | Airtable pushes to EONPRO      | Real-time                            | Requires 6 automation scripts |

---

## Method 1: Airtable API Sync (Recommended)

EONPRO connects directly to Airtable to pull intake records. No automation scripts needed.

### Environment Variables

```bash
# Required - Airtable Personal Access Token
AIRTABLE_API_KEY=patXXXXXXXXXXXXX.XXXXXXXX...

# Optional
OVERTIME_AIRTABLE_BASE_ID=apppl0Heha1sOti59     # Already configured
OVERTIME_CLINIC_ID=<clinic-uuid>                 # For clinic lookup
OVERTIME_SYNC_API_KEY=<your-api-key>            # For sync endpoint auth
CRON_SECRET=<cron-secret>                       # For scheduled syncs
```

### Sync All Tables

```bash
POST /api/integrations/overtime/sync
Authorization: Bearer <OVERTIME_SYNC_API_KEY>
Content-Type: application/json

{
  "dryRun": false,
  "treatmentTypes": ["weight_loss", "peptides"],
  "maxRecordsPerTable": 100,
  "since": "2026-01-01T00:00:00Z"
}
```

### Sync Single Table

```bash
POST /api/integrations/overtime/sync/tblnznnhTgy5Li66k
Authorization: Bearer <OVERTIME_SYNC_API_KEY>

{
  "maxRecords": 50,
  "dryRun": true
}
```

### Table IDs

| Treatment   | Table ID            | Table Name                |
| ----------- | ------------------- | ------------------------- |
| Weight Loss | `tblnznnhTgy5Li66k` | OT Mens - Weight Loss     |
| Peptides    | `tbl5wJs4jGsPegseO` | OT Mens - Peptide Therapy |
| NAD+        | `tbl8WmRKhlcb5bQ9e` | OT Mens - NAD             |
| Better Sex  | `tblwZg0EuVlmz0I01` | OT Mens - Better Sex      |
| TRT         | `tblYfQCW70CR86Cnt` | OT Mens - TRT             |
| Baseline    | `tbl3LS20Y4nMVbqv1` | OT Mens - Baseline        |

### Setting Up Cron (Vercel)

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/integrations/overtime/sync",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### Response Example

```json
{
  "success": true,
  "summary": {
    "startedAt": "2026-02-01T22:00:00Z",
    "completedAt": "2026-02-01T22:00:45Z",
    "durationMs": 45000,
    "totalRecords": 127,
    "successCount": 125,
    "errorCount": 2
  },
  "results": [
    {
      "table": "OT Mens - Weight Loss",
      "treatmentType": "weight_loss",
      "recordsProcessed": 42,
      "successCount": 42,
      "errorCount": 0
    }
  ]
}
```

---

## Method 2: Webhook Push (Alternative)

Airtable automation scripts push data to EONPRO in real-time.

### Treatment Types

| Treatment Type     | Airtable Table       | Description                                  |
| ------------------ | -------------------- | -------------------------------------------- |
| Weight Loss        | `weight_loss`        | GLP-1 weight loss program                    |
| Peptides           | `peptides`           | Peptide therapy for performance and wellness |
| NAD+               | `nad_plus`           | NAD+ therapy for energy and cellular health  |
| Better Sex         | `better_sex`         | Sexual health and ED treatment               |
| Testosterone       | `testosterone`       | Testosterone replacement therapy (TRT)       |
| Baseline/Bloodwork | `baseline_bloodwork` | Lab work and baseline health assessment      |

---

## Webhook Endpoint

### Production

```
POST https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake
```

### Local Development

```
POST http://localhost:3001/api/webhooks/overtime-intake
```

### Health Check

```
GET https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake
```

---

## Authentication

The webhook requires authentication via one of these headers:

### Option 1: X-Webhook-Secret Header (Recommended)

```
X-Webhook-Secret: <your-secret>
```

### Option 2: Authorization Bearer Token

```
Authorization: Bearer <your-secret>
```

### Option 3: X-API-Key Header

```
X-API-Key: <your-secret>
```

---

## Environment Variables

Add these to your EONPRO `.env` file:

```bash
# Overtime Intake Webhook Authentication
OVERTIME_INTAKE_WEBHOOK_SECRET=<generate-with-openssl-rand-hex-32>

# Optional: Clinic ID for extra security validation
OVERTIME_CLINIC_ID=<clinic-id-from-database>
```

Generate a new secret:

```bash
openssl rand -hex 32
```

---

## Payload Format

### Recommended Format

Include the `treatmentType` field to explicitly specify which treatment the intake is for:

```json
{
  "treatmentType": "weight_loss",
  "submission-id": "intake-2026-001",
  "first-name": "John",
  "last-name": "Doe",
  "email": "john.doe@example.com",
  "phone": "5551234567",
  "dob": "1990-01-15",
  "sex": "Male",
  "state": "FL",
  "weight": "220",
  "goal-weight": "180",
  "PROMO CODE": "PARTNER10",
  "Checkout Completed": true
}
```

### Treatment Type Detection

If `treatmentType` is not provided, the system will auto-detect based on field presence:

| Treatment    | Detection Fields                                           |
| ------------ | ---------------------------------------------------------- |
| Weight Loss  | `glp1-last-30`, `goal-weight`, `weight-loss-motivation`    |
| Peptides     | `peptide-experience`, `peptide-goals`, `preferred-peptide` |
| NAD+         | `nad-experience`, `cognitive-goals`, `iv-experience`       |
| Better Sex   | `ed-history`, `ed-severity`, `libido-level`                |
| Testosterone | `trt-symptoms`, `previous-trt`, `testosterone-level`       |
| Baseline     | `lab-location`, `fasting-available`, `reason-for-labs`     |

---

## Required Patient Fields

| Field                       | Required    | Description                            |
| --------------------------- | ----------- | -------------------------------------- |
| `first-name` or `firstName` | Yes         | Patient's first name                   |
| `last-name` or `lastName`   | Yes         | Patient's last name                    |
| `email`                     | Yes         | Patient's email (used for matching)    |
| `phone`                     | Recommended | Phone number                           |
| `dob` or `dateOfBirth`      | Recommended | Format: YYYY-MM-DD or MM/DD/YYYY       |
| `sex` or `gender`           | Optional    | M/F/Male/Female                        |
| `state`                     | Recommended | State code (FL) or full name (Florida) |

---

## Promo Code / Affiliate Tracking

### Supported Fields

The webhook checks these fields for affiliate/promo codes:

- `PROMO CODE`
- `promo-code`
- `promoCode`
- `INFLUENCER CODE`
- `influencer-code`
- `influencerCode`
- `referral-code`

### How It Works

1. When an intake comes in with a promo code, the system:
   - Looks up the code in the `Influencer` or `DiscountCode` table
   - Creates a `ReferralTracking` record linking the patient to the affiliate
   - The affiliate dashboard automatically shows the new referral

2. The affiliate can see:
   - Total referrals from this promo code
   - Conversion status (partial lead vs completed checkout)
   - Commission earnings (if configured)

### Example

```json
{
  "first-name": "John",
  "last-name": "Doe",
  "email": "john@example.com",
  "PROMO CODE": "PARTNER10",
  "treatmentType": "weight_loss"
}
```

Response includes affiliate tracking status:

```json
{
  "success": true,
  "affiliate": {
    "code": "PARTNER10",
    "tracked": true
  }
}
```

---

## Treatment-Specific Fields

### Weight Loss

```json
{
  "treatmentType": "weight_loss",
  "goal-weight": "180",
  "glp1-experience": "Never Used",
  "glp1-last-30": "No",
  "glp1-medication-type": "Semaglutide",
  "preferred-meds": "Tirzepatide",
  "injections-tablets": "Injections",
  "weight-loss-motivation": "Health improvement",
  "men2-history": "No",
  "thyroid-cancer": "No",
  "bariatric-surgery": "No"
}
```

### Peptides

```json
{
  "treatmentType": "peptides",
  "peptide-experience": "Some",
  "previous-peptides": "BPC-157",
  "peptide-goals": "Recovery and performance",
  "primary-goal": "Recovery",
  "injection-comfort": "Very Comfortable",
  "preferred-peptide": "CJC-1295"
}
```

### NAD+

```json
{
  "treatmentType": "nad_plus",
  "nad-experience": "None",
  "iv-experience": "Some",
  "energy-level": "Low",
  "cognitive-goals": "Mental clarity, focus",
  "recovery-goals": "Athletic recovery",
  "chronic-fatigue": "Moderate",
  "brain-fog": "Frequent"
}
```

### Better Sex

```json
{
  "treatmentType": "better_sex",
  "ed-history": "Occasional",
  "ed-duration": "6-12 months",
  "ed-severity": "Mild",
  "libido-level": "Low",
  "performance-anxiety": "Occasional",
  "previous-ed-meds": "Tried Viagra",
  "preferred-medication": "Tadalafil",
  "nitrate-use": "No"
}
```

### Testosterone Replacement

```json
{
  "treatmentType": "testosterone",
  "trt-symptoms": "Fatigue, low libido, brain fog",
  "fatigue-level": "Moderate",
  "libido-changes": "Decreased",
  "previous-trt": "None",
  "total-testosterone": "350 ng/dL",
  "free-testosterone": "8.5 pg/mL",
  "preferred-administration": "Injections",
  "prostate-history": "None",
  "fertility-concerns": "No"
}
```

### Baseline/Bloodwork

```json
{
  "treatmentType": "baseline_bloodwork",
  "lab-location": "Quest near me",
  "preferred-lab": "Quest Diagnostics",
  "fasting-available": "Yes",
  "mobile-phlebotomy": "No",
  "reason-for-labs": "Baseline health check",
  "treatment-interest": "TRT, Weight Loss",
  "has-recent-labs": "No"
}
```

---

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "eonproPatientId": "000123",
  "eonproDatabaseId": 123,
  "submissionId": "intake-2026-001",
  "treatment": {
    "type": "weight_loss",
    "label": "Weight Loss"
  },
  "patient": {
    "id": 123,
    "patientId": "000123",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "isNew": true
  },
  "submission": {
    "checkoutCompleted": true,
    "isPartial": false
  },
  "document": {
    "id": 456,
    "filename": "overtime-intake-2026-001.pdf",
    "pdfUrl": "https://s3.amazonaws.com/..."
  },
  "soapNote": {
    "id": 789,
    "status": "DRAFT"
  },
  "affiliate": {
    "code": "PARTNER10",
    "tracked": true
  },
  "clinic": {
    "id": 5,
    "name": "Overtime Men's Clinic"
  },
  "processingTimeMs": 1234,
  "message": "Patient created successfully"
}
```

### Error Responses

**401 Unauthorized**

```json
{
  "error": "Unauthorized",
  "code": "INVALID_SECRET",
  "requestId": "..."
}
```

**500 Server Error**

```json
{
  "error": "Failed to create patient: ...",
  "code": "PATIENT_ERROR",
  "requestId": "...",
  "queued": true
}
```

---

## Airtable Automation Setup

### Step 1: Create Automation

1. Go to your Airtable base
2. Click "Automations" in the top navigation
3. Click "Create automation"

### Step 2: Set Trigger

Select "When a record is created" for each treatment table.

### Step 3: Add Action

Select "Run a script" and paste the appropriate automation script.

### Example Script (Weight Loss Table)

```javascript
// Overtime Men's Clinic - Weight Loss Intake Webhook
// Sends new records to EONPRO for patient creation

const WEBHOOK_URL = 'https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake';
const WEBHOOK_SECRET = 'YOUR_SECRET_HERE'; // Get from EONPRO admin

// Get the record that triggered this automation
let inputConfig = input.config();
let record = inputConfig.record;

// Build the payload
const payload = {
  // Treatment type for proper routing
  treatmentType: 'weight_loss',

  // Submission metadata
  'submission-id': record.id,
  'submission-date': new Date().toISOString(),

  // Patient info (map your Airtable field names here)
  'first-name': record.getCellValue('First Name') || '',
  'last-name': record.getCellValue('Last Name') || '',
  email: record.getCellValue('Email') || '',
  phone: record.getCellValue('Phone') || '',
  dob: record.getCellValue('Date of Birth') || '',
  sex: record.getCellValue('Sex') || '',
  state: record.getCellValue('State') || '',

  // Weight Loss specific fields
  weight: record.getCellValue('Current Weight') || '',
  'goal-weight': record.getCellValue('Goal Weight') || '',
  'glp1-last-30': record.getCellValue('GLP-1 Last 30 Days') || '',
  'preferred-meds': record.getCellValue('Preferred Medication') || '',

  // Promo/Affiliate code - IMPORTANT!
  'PROMO CODE': record.getCellValue('PROMO CODE') || record.getCellValue('Influencer Code') || '',

  // Checkout status
  'Checkout Completed': record.getCellValue('Checkout Completed') || false,
};

// Send to EONPRO
let response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': WEBHOOK_SECRET,
  },
  body: JSON.stringify(payload),
});

let result = await response.json();

// Log result
if (result.success) {
  console.log(`✓ Patient created/updated: ${result.eonproPatientId}`);
  console.log(`  Treatment: ${result.treatment.label}`);
  if (result.affiliate?.tracked) {
    console.log(`  Affiliate tracked: ${result.affiliate.code}`);
  }
} else {
  console.error(`✗ Error: ${result.error}`);
}

// Optionally update the Airtable record with EONPRO ID
output.set('eonproPatientId', result.eonproPatientId || '');
output.set('eonproDatabaseId', result.eonproDatabaseId || '');
```

### Step 4: Map Input Variables

In the automation, click "Input variables" and map:

- `record` → The record that triggered the automation

### Step 5: Test

1. Create a test record in Airtable
2. Check the automation run history
3. Verify the patient appears in EONPRO

---

## Testing the Webhook

### Using cURL

```bash
curl -X POST https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret-key" \
  -d '{
    "treatmentType": "weight_loss",
    "submission-id": "test-001",
    "first-name": "Test",
    "last-name": "Patient",
    "email": "test@example.com",
    "phone": "5551234567",
    "state": "FL",
    "weight": "200",
    "goal-weight": "170",
    "PROMO CODE": "TEST10",
    "Checkout Completed": true
  }'
```

### Health Check

```bash
curl https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake
```

---

## What Happens When Intake is Received

1. **Authentication**: Webhook secret is verified
2. **Clinic Lookup**: Overtime clinic is found (subdomain: `ot`)
3. **Treatment Detection**: Treatment type is determined from payload
4. **Patient Upsert**: Patient is created or updated based on email/phone match
5. **PDF Generation**: Intake form PDF is generated and uploaded to S3
6. **Document Storage**: Structured data is stored for the Intake tab
7. **SOAP Note**: AI generates preliminary SOAP note (for complete submissions)
8. **Affiliate Tracking**: Promo code is linked to affiliate for commission tracking
9. **Response**: Returns patient ID and all processing details

---

## Troubleshooting

### 401 Unauthorized

- Check webhook secret is correctly configured in both Airtable and EONPRO
- Ensure header name matches (X-Webhook-Secret, Authorization, or X-API-Key)

### Patient Not Created

- Verify required fields are present (firstName, lastName, email)
- Check server logs for normalization errors
- Ensure the email is valid format

### Promo Code Not Tracked

- Verify the promo code exists in EONPRO's Influencer or DiscountCode table
- Check the field name matches one of the supported variations
- Look for tracking errors in the response warnings

### Wrong Treatment Type Detected

- Explicitly include `treatmentType` field in payload
- Ensure field names match the detection patterns

---

## Security Considerations

1. **Always use HTTPS** in production
2. **Rotate webhook secrets** periodically
3. **Clinic isolation** is enforced - all data goes to Overtime clinic only
4. **PHI encryption** is applied to patient data at rest
5. **Audit logging** tracks all webhook activity

---

## Support

For issues with this integration:

1. Check server logs for detailed error messages
2. Test with the health check endpoint first
3. Include `requestId` from response when reporting issues
4. Contact EONPRO support with webhook logs
