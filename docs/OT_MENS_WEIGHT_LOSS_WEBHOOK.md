# OT Mens - Weight Loss Integration

This document explains the integration for the **OT Mens - Weight Loss** Heyflow form via Airtable.

## Overview

- **Clinic**: Overtime Men's Clinic (subdomain: `ot`)
- **Treatment Type**: Weight Loss (GLP-1 medications)
- **Heyflow ID**: `uvvNo2JSHPctHpG87s0x`
- **Flow Path**: `weightloss-by-otmens`
- **Heyflow URL**: `https://hollyhock-ambulance-ravioli.heyflow.site/weightloss-by-otmens`
- **Airtable Table ID**: `tblnznnhTgy5Li66k`
- **Airtable Table Name**: `OT Mens - Weight Loss`

---

## Integration Methods

There are **two methods** to sync data from Airtable to EONPRO:

### Method 1: Airtable API Sync (Recommended)
Pull data directly from Airtable using our sync API. This is more reliable and doesn't require Airtable automation setup.

### Method 2: Webhook (Push from Airtable)
Set up an Airtable automation to push new records to our webhook endpoint.

---

## Method 1: Airtable API Sync

### Sync Endpoints

#### Sync All Tables
```
POST https://eonpro-kappa.vercel.app/api/integrations/overtime/sync
```

#### Sync Weight Loss Table Only
```
POST https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblnznnhTgy5Li66k
```

#### Get Table Info (Preview)
```
GET https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblnznnhTgy5Li66k
```

### Authentication

Add one of these headers:
```
Authorization: Bearer <OVERTIME_SYNC_API_KEY>
```
or
```
X-Cron-Secret: <CRON_SECRET>
```

### Environment Variables Required

```bash
# Airtable API Key (with read access to Overtime base)
AIRTABLE_API_KEY=pat...your-airtable-api-key

# Overtime Airtable Base ID
OVERTIME_AIRTABLE_BASE_ID=apppl0Heha1sOti59

# Sync API Key (for authentication)
OVERTIME_SYNC_API_KEY=your-sync-api-key

# Webhook Secret (used internally by sync service)
OVERTIME_INTAKE_WEBHOOK_SECRET=your-webhook-secret
```

### Sync Options

```json
{
  "dryRun": false,
  "maxRecords": 100,
  "since": "2026-01-01T00:00:00Z",
  "markAsSynced": true,
  "syncStatusField": "EONPRO Synced At"
}
```

| Option | Type | Description |
|--------|------|-------------|
| `dryRun` | boolean | Preview without creating patients |
| `maxRecords` | number | Limit records to process |
| `since` | ISO date | Only sync records created after this date |
| `markAsSynced` | boolean | Update Airtable with sync timestamp |
| `syncStatusField` | string | Airtable field name for tracking sync |

### cURL Examples

#### Sync Weight Loss Table
```bash
curl -X POST "https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblnznnhTgy5Li66k" \
  -H "Authorization: Bearer your-sync-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "maxRecords": 10,
    "dryRun": false
  }'
```

#### Preview Table Data
```bash
curl "https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblnznnhTgy5Li66k" \
  -H "Authorization: Bearer your-sync-api-key"
```

#### Sync Only Records From Last Week
```bash
curl -X POST "https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblnznnhTgy5Li66k" \
  -H "Authorization: Bearer your-sync-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "since": "2026-01-25T00:00:00Z"
  }'
```

### Sync Response

```json
{
  "success": true,
  "table": {
    "id": "tblnznnhTgy5Li66k",
    "name": "OT Mens - Weight Loss",
    "treatmentType": "weight_loss"
  },
  "result": {
    "recordsProcessed": 10,
    "successCount": 9,
    "errorCount": 1,
    "recordIds": ["rec123", "rec456", "..."],
    "errors": [
      { "recordId": "rec789", "error": "Missing email" }
    ]
  }
}
```

---

## Method 2: Webhook Endpoint

### Production
```
POST https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake
```

### Local Development
```
POST http://localhost:3001/api/webhooks/overtime-intake
```

## Authentication

The webhook requires authentication via one of these methods:

### Option 1: X-Webhook-Secret Header (Recommended)
```
X-Webhook-Secret: <OVERTIME_INTAKE_WEBHOOK_SECRET>
```

### Option 2: Authorization Bearer Token
```
Authorization: Bearer <OVERTIME_INTAKE_WEBHOOK_SECRET>
```

### Option 3: X-API-Key Header
```
X-API-Key: <OVERTIME_INTAKE_WEBHOOK_SECRET>
```

## Environment Variable

Set in `.env.local` for local development:
```bash
OVERTIME_INTAKE_WEBHOOK_SECRET=your-secret-key
OVERTIME_CLINIC_ID=<clinic-id-from-database>
```

---

## Airtable Field Mapping

### Patient Identity Fields

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Response ID` | Primary field / Submission ID | Single line text |
| `First name` | Patient's first name | Single line text |
| `Last name` | Patient's last name | Single line text |
| `email` | Patient's email | Email |
| `phone number` | Phone number | Phone number |
| `DOB` | Date of birth | Single line text |
| `Gender` | Gender | Single select |
| `State` | State of residence | Single line text |

### Address Fields

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Address` | Full address (combined) | Single line text |
| `Address [Street]` | Street address | Single line text |
| `Address [house]` | House number | Single line text |
| `Address [City]` | City | Single line text |
| `Address [State]` | State | Single line text |
| `Address [Country]` | Country | Single line text |
| `Address [Zip]` | ZIP code | Single line text |
| `apartment#` | Apartment/Unit number | Single line text |

### Body Metrics

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Height [feet]` | Height in feet | Number |
| `Height [inches]` | Height in inches | Number |
| `starting weight` | Starting weight | Number |
| `ideal weight` | Ideal/goal weight | Number |
| `BMI` | Body Mass Index | Number |

### GLP-1 History

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `GLP-1 History` | Previous GLP-1 medication experience | Single line text |
| `Type of GLP-1` | Which GLP-1 medication used | Single line text |
| `Happy with GLP-1 Dose` | Satisfaction with current dose | Single line text |
| `Side Effect History` | Side effects experienced | Single line text |

### Semaglutide Specific

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Semaglutide Dose` | Current Semaglutide dosage | Single line text |
| `Semaglutide Side Effects` | Side effects from Semaglutide | Single line text |
| `Semaglutide Success` | Success/effectiveness rating | Single line text |

### Tirzepatide Specific

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Tirzepatide Dose` | Current Tirzepatide dosage | Single line text |
| `Tirzepatide Side Effects` | Side effects from Tirzepatide | Single line text |
| `Tirzepatide Success` | Success/effectiveness rating | Single line text |

### Contraindications (Critical for GLP-1)

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Thyroid Cancer` | Thyroid cancer history | Single line text |
| `Neoplasia type 2 (MEN 2)` | MEN2 history (GLP-1 contraindication) | Single line text |
| `Pancreatitis` | Pancreatitis history | Single line text |
| `Gastroparesis` | Gastroparesis condition | Single line text |
| `Pregnant or Breastfeeding` | Pregnancy/breastfeeding status | Single line text |
| `Type 2 Diabetes` | Type 2 diabetes status | Single line text |

### Medical History

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Allergies` | Known allergies | Single line text |
| `Allergy Type` | Type of allergies | Single line text |
| `Chronic Illness` | Has chronic illness | Single line text |
| `Specific Chronic Illness` | Details of chronic illness | Single line text |
| `Type of Chronic Illness` | Classification of illness | Single line text |
| `Family History Diagnoses` | Family medical history | Single line text |
| `Blood Pressure` | Blood pressure status | Single line text |

### Surgery History

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Past surgery` | Previous surgeries | Single line text |
| `Surgery Type` | Type of surgery | Single line text |

### Mental Health

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Mental Health` | Mental health history | Single line text |
| `Mental health Diagnosis` | Mental health diagnosis | Single line text |

### Medications & Lifestyle

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Medications / Supplements` | Current medications | Single line text |
| `Which Medication /Supplement` | Specific medications | Single line text |
| `Alcohol Use` | Alcohol consumption | Single line text |
| `Activity Level` | Physical activity level | Single line text |

### Treatment Preferences

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Qualifying Conditions` | Conditions qualifying for treatment | Single line text |
| `Personalized Treatment` | Treatment preferences | Single line text |
| `How would your life change by losing weight` | Weight loss motivation | Single line text |

### Referral & Marketing

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `How did you hear about us?` | Marketing attribution | Single line text |
| `Referrer` | Referrer name/source | Single line text |
| `INFLUENCER CODE` | Influencer promo code | Single line text |

### Consent & Metadata

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `18+ Consent` | Age verification | Checkbox |
| `Consent Forms` | Consent forms signed | Checkbox |
| `marketing consent` | Marketing consent | Checkbox |
| `Heyflow ID` | Heyflow flow identifier | Single line text |
| `A/B Test ID` | A/B test identifier | Single line text |
| `A/B Test Version` | A/B test version | Single line text |
| `URL` | Source URL | Single select |
| `URL with parameters` | Full URL with tracking params | Single line text |

---

## Sample Payload

```json
{
  "Response ID": "rec123abc",
  "First name": "John",
  "Last name": "Doe",
  "email": "john.doe@example.com",
  "phone number": "+1 (555) 123-4567",
  "DOB": "01/15/1985",
  "Gender": "Male",
  "State": "Florida",

  "Address [Street]": "123 Main St",
  "Address [City]": "Miami",
  "Address [State]": "FL",
  "Address [Zip]": "33101",

  "starting weight": 220,
  "ideal weight": 175,
  "Height [feet]": 5,
  "Height [inches]": 10,
  "BMI": 31.6,

  "GLP-1 History": "Previously Used",
  "Type of GLP-1": "Semaglutide",
  "Semaglutide Dose": "0.5mg weekly",
  "Semaglutide Side Effects": "Mild nausea",
  "Semaglutide Success": "Somewhat Effective",

  "Thyroid Cancer": "No",
  "Neoplasia type 2 (MEN 2)": "No",
  "Pancreatitis": "No",
  "Gastroparesis": "No",
  "Type 2 Diabetes": "Pre-diabetic",

  "How would your life change by losing weight": "More energy, better health",
  "Activity Level": "Moderate",
  "Alcohol Use": "Occasional",

  "18+ Consent": true,
  "Consent Forms": true,
  "INFLUENCER CODE": "WEIGHTLOSS2024",

  "treatmentType": "weight_loss"
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
  "eonproDatabaseId": 456,
  "submissionId": "rec123abc",

  "treatment": {
    "type": "weight_loss",
    "label": "Weight Loss"
  },

  "patient": {
    "id": 456,
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
    "id": 789,
    "filename": "overtime-intake-rec123abc.pdf",
    "pdfUrl": "https://s3.amazonaws.com/..."
  },

  "soapNote": {
    "id": 101,
    "status": "DRAFT"
  },

  "affiliate": {
    "code": "WEIGHTLOSS2024",
    "tracked": true
  },

  "clinic": {
    "id": 1,
    "name": "Overtime Men's Clinic"
  },

  "processingTimeMs": 1234,
  "message": "Patient created successfully"
}
```

---

## Airtable Automation Setup

### 1. Create Automation Trigger

In your **OT Mens - Weight Loss** Airtable base:
1. Go to **Automations** tab
2. Click **Create automation**
3. Set trigger: **When record created** or **When record enters view**

### 2. Add Webhook Action

Add action: **Run a script** or **Send webhook**

If using **Send webhook**:
- URL: `https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake`
- Method: POST
- Headers:
  ```
  Content-Type: application/json
  X-Webhook-Secret: <your-secret>
  ```
- Body: Use Airtable field tokens to build JSON payload

### 3. Script Example (if using Run Script)

```javascript
const WEBHOOK_URL = 'https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake';
const WEBHOOK_SECRET = 'your-webhook-secret';

let table = base.getTable('OT Mens - Weight Loss');
let record = await input.recordAsync('Record', table);

if (!record) {
  console.log('No record provided');
  return;
}

const payload = {
  'Response ID': record.getCellValueAsString('Response ID'),
  'First name': record.getCellValueAsString('First name'),
  'Last name': record.getCellValueAsString('Last name'),
  'email': record.getCellValueAsString('email'),
  'phone number': record.getCellValueAsString('phone number'),
  'DOB': record.getCellValueAsString('DOB'),
  'Gender': record.getCellValue('Gender')?.name || '',
  'State': record.getCellValueAsString('State'),

  // Address
  'Address [Street]': record.getCellValueAsString('Address [Street]'),
  'Address [City]': record.getCellValueAsString('Address [City]'),
  'Address [State]': record.getCellValueAsString('Address [State]'),
  'Address [Zip]': record.getCellValueAsString('Address [Zip]'),
  'apartment#': record.getCellValueAsString('apartment#'),

  // Body Metrics
  'starting weight': record.getCellValue('starting weight'),
  'ideal weight': record.getCellValue('ideal weight'),
  'Height [feet]': record.getCellValue('Height [feet]'),
  'Height [inches]': record.getCellValue('Height [inches]'),
  'BMI': record.getCellValue('BMI'),

  // GLP-1 History
  'GLP-1 History': record.getCellValueAsString('GLP-1 History'),
  'Type of GLP-1': record.getCellValueAsString('Type of GLP-1'),
  'Semaglutide Dose': record.getCellValueAsString('Semaglutide Dose'),
  'Semaglutide Side Effects': record.getCellValueAsString('Semaglutide Side Effects'),
  'Semaglutide Success': record.getCellValueAsString('Semaglutide Success'),
  'Tirzepatide Dose': record.getCellValueAsString('Tirzepatide Dose'),
  'Tirzepatide Side Effects': record.getCellValueAsString('Tirzepatide Side Effects'),
  'Tirzepatide Success': record.getCellValueAsString('Tirzepatide Success'),

  // Contraindications
  'Thyroid Cancer': record.getCellValueAsString('Thyroid Cancer'),
  'Neoplasia type 2 (MEN 2)': record.getCellValueAsString('Neoplasia type 2 (MEN 2)'),
  'Pancreatitis': record.getCellValueAsString('Pancreatitis'),
  'Gastroparesis': record.getCellValueAsString('Gastroparesis'),
  'Type 2 Diabetes': record.getCellValueAsString('Type 2 Diabetes'),

  // Promo Code
  'INFLUENCER CODE': record.getCellValueAsString('INFLUENCER CODE'),

  // Treatment Type (for detection)
  'treatmentType': 'weight_loss'
};

const response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': WEBHOOK_SECRET
  },
  body: JSON.stringify(payload)
});

const result = await response.json();
console.log('Webhook response:', JSON.stringify(result, null, 2));

// Optionally update record with EONPRO IDs for bidirectional sync
if (result.success && result.eonproPatientId) {
  // You can update a field in Airtable with the EONPRO patient ID
  console.log('EONPRO Patient ID:', result.eonproPatientId);
}
```

---

## Testing

### Using cURL

```bash
curl -X POST https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret" \
  -d '{
    "First name": "Test",
    "Last name": "Patient",
    "email": "test@example.com",
    "phone number": "5551234567",
    "DOB": "01/01/1990",
    "State": "FL",
    "starting weight": 200,
    "ideal weight": 160,
    "GLP-1 History": "Never Used",
    "Thyroid Cancer": "No",
    "treatmentType": "weight_loss"
  }'
```

### Health Check

```bash
curl https://eonpro-kappa.vercel.app/api/webhooks/overtime-intake
```

Response:
```json
{
  "status": "ok",
  "endpoint": "/api/webhooks/overtime-intake",
  "clinic": "Overtime Men's Clinic",
  "treatmentTypes": ["weight_loss", "peptides", "nad_plus", "better_sex", "testosterone", "baseline_bloodwork"],
  "affiliateTracking": {
    "enabled": true,
    "fields": ["promo-code", "PROMO CODE", "influencer-code", "INFLUENCER CODE"]
  }
}
```

---

## Treatment Detection

The webhook automatically detects the treatment type as `weight_loss` if any of these fields are present:
- `GLP-1 History`
- `Type of GLP-1`
- `Semaglutide Dose` / `Semaglutide Side Effects` / `Semaglutide Success`
- `Tirzepatide Dose` / `Tirzepatide Side Effects` / `Tirzepatide Success`
- `Happy with GLP-1 Dose`
- `ideal weight` / `starting weight`
- `How would your life change by losing weight`
- `Neoplasia type 2 (MEN 2)` / `Thyroid Cancer` / `Pancreatitis` / `Gastroparesis`

Or explicitly set `treatmentType: "weight_loss"` in the payload.

---

## Affiliate/Promo Code Tracking

The webhook automatically tracks promo/influencer codes from these fields:
- `INFLUENCER CODE`
- `PROMO CODE`
- `promo-code`
- `influencer-code`
- `referral-code`

When a valid code is found, it's linked to the patient record and tracked for commission reporting.

---

## Data Processing Flow

1. **Authentication** - Verify webhook secret
2. **Clinic Lookup** - Find Overtime clinic in database
3. **Treatment Detection** - Identify as Weight Loss from payload
4. **Normalization** - Map Airtable fields to patient data
5. **Patient Upsert** - Create or update patient record
6. **PDF Generation** - Generate intake form PDF
7. **S3 Upload** - Store PDF in AWS S3 (if enabled)
8. **Document Record** - Create patient document in database
9. **SOAP Note** - Generate AI SOAP note (for complete submissions)
10. **Affiliate Tracking** - Track promo code if present
11. **Audit Log** - Log the intake submission

---

## Security Notes

- All patient data is encrypted at rest
- PHI is never logged
- Webhook secret rotates periodically
- IP-based rate limiting is applied
- All access is audited for HIPAA compliance
