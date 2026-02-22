# WELLMEDR Clinic Configuration

> **Clinic Name**: Wellmedr LLC  
> **Subdomain**: wellmedr  
> **Status**: ✅ ACTIVE  
> **Last Verified**: 2026-01-24

---

## Overview

Wellmedr is a GLP-1 weight loss clinic using EONPRO for patient management. They have a custom
intake form at https://intake.wellmedr.com (Fillout). Intake data can reach EONPRO in two ways:
**direct Fillout webhook** (recommended) or **via Airtable** (legacy).

---

## Intake Platform

| Field              | Value                         |
| ------------------ | ----------------------------- |
| **URL**            | `https://intake.wellmedr.com` |
| **Form provider**  | Fillout                       |
| **Airtable Base**  | `app3usm1VtzcWOvZW` (optional) |
| **Airtable Table** | `tbln93c69GlrNGEqa` (optional) |

---

## Webhook Configuration

### EONPRO Side (app.eonpro.io)

| Environment Variable             | Value                        |
| -------------------------------- | ---------------------------- |
| `WELLMEDR_INTAKE_WEBHOOK_SECRET` | `<configured in production>` |

**Webhook Endpoint**: `https://app.eonpro.io/api/webhooks/wellmedr-intake`

The same endpoint accepts **both** Fillout payloads (questions array) and Airtable payloads (flat kebab-case JSON).

### Option A: Direct Fillout webhook (no Airtable)

To avoid Airtable, configure Fillout to send submissions directly to EONPRO:

1. In Fillout: open your intake form → **Integrations** / **Connect** → **Webhooks**.
2. Add webhook: **URL** `https://app.eonpro.io/api/webhooks/wellmedr-intake`, **Method** POST.
3. Add header `x-webhook-secret` with value = `WELLMEDR_INTAKE_WEBHOOK_SECRET` (from EONPRO env).
4. Fillout sends `submissionId`, `submissionTime`, and `questions` array; EONPRO converts this automatically.

Use the same question IDs as Wellmedr fields where possible (e.g. `first-name`, `last-name`, `email`, `Checkout Completed`).

#### How to verify Fillout intakes are reaching the platform

1. **Application logs (Vercel / log aggregator)**  
   Search for:
   - `[WELLMEDR-INTAKE ...] Webhook received` — any wellmedr-intake request.
   - `[WELLMEDR-INTAKE ...] Fillout payload detected, converting to flat format` — **Fillout only** (Airtable sends flat JSON, so this line appears only for Fillout).

2. **Audit logs (database)**  
   Query `AuditLog` where:
   - `action IN ('PATIENT_INTAKE_RECEIVED', 'PARTIAL_INTAKE_RECEIVED')`
   - `details->>'source' = 'wellmedr-intake'`  
   To see **Fillout only**: also filter `details->>'payloadSource' = 'fillout'`.  
   (Airtable submissions have `payloadSource: 'airtable'`.)

3. **Admin Intakes page**  
   On **wellmedr.eonpro.io** → **Admin** → **Intakes**: new patients from the webhook appear here (source `webhook`, `sourceMetadata.type: 'wellmedr-intake'`). This does not distinguish Fillout vs Airtable in the UI.

4. **Test script**  
   Send a mock Fillout payload to confirm the endpoint and adapter:
   ```bash
   BASE_URL=https://wellmedr.eonpro.io WELLMEDR_INTAKE_WEBHOOK_SECRET=your-secret npx tsx scripts/test-fillout-wellmedr-intake.ts
   ```
   A 200 response and a new test patient in Admin → Intakes means Fillout → EONPRO is working.

#### Fillout webhook not working – checklist

1. **Webhook fires on real submissions**  
   Fillout only sends when a form is **submitted**. "Test fetch" uses a fixed payload and may return `"status": "duplicate"`; that only confirms the URL and secret work. Do a **new** submission (new name + email) on the live form and check Admin → Intakes in 1–2 minutes.

2. **Correct form**  
   The webhook must be on the **same** form patients use (e.g. the live Intake form). If you have multiple forms or a copy, ensure the one with the webhook is the one linked from intake.wellmedr.com.

3. **Body format**  
   EONPRO accepts:
   - **Default Fillout payload** (recommended): `submissionId`, `submissionTime`, `questions: [{ id, value }, ...]`. Do **not** replace the body with a custom mapping if you want best compatibility; use the default so the Fillout adapter runs.
   - **Custom / flat body**: flat JSON with keys like `First Name`, `Last Name`, `Email` (or `first-name`, `last-name`, `email`) also works. If you use custom Body mapping, include at least first name, last name, email, and (if applicable) `Checkout Completed`.

4. **Fillout delivery logs**  
   In Fillout, check the webhook’s delivery or logs (if available). Look for requests to `app.eonpro.io` and the response code (200 = OK, 401 = wrong secret, 4xx/5xx = other error).

5. **EONPRO logs**  
   In your host (e.g. Vercel) logs, search for `[WELLMEDR-INTAKE]`. You should see "Webhook received" when a request hits. "Authentication FAILED" = wrong or missing `x-webhook-secret`. "Fillout payload detected" = payload is in Fillout format and was converted.

6. **Secret match**  
   The value in Fillout’s **Headers** → `x-webhook-secret` must match **exactly** the env var `WELLMEDR_INTAKE_WEBHOOK_SECRET` in EONPRO (no extra spaces, same character set). Regenerating the secret in one place requires updating it in the other.

### Option B: Airtable automation (legacy)

Configure the Airtable automation to send a POST request with:

| Setting     | Value                                                |
| ----------- | ---------------------------------------------------- |
| **URL**     | `https://app.eonpro.io/api/webhooks/wellmedr-intake` |
| **Method**  | `POST`                                               |
| **Headers** | `x-webhook-secret: <your-secret>`                    |
| **Body**    | JSON with all intake form fields (flat, kebab-case)  |

---

## Data Flow

**Direct Fillout:** Patient → intake.wellmedr.com (Fillout) → `app.eonpro.io/api/webhooks/wellmedr-intake` → Wellmedr clinic (create patient, PDF, SOAP, referrals).

**Via Airtable:** Patient → intake.wellmedr.com → Airtable (tbln93c69GlrNGEqa) → Airtable Automation → same webhook URL → same Wellmedr processing.

### ⚠️ TWO Automations Required for Prescription Queue

| Automation | Webhook | Purpose | When It Runs |
| --------- | ------- | ------- | ------------- |
| **Intake** | `wellmedr-intake` | Creates patient, SOAP note | When intake record has data (Checkout Completed) |
| **Invoice** | `wellmedr-invoice` | Creates invoice → **Rx Queue** | When payment detected (`method_payment_id` has `pm_*`) |

**The intake webhook alone does NOT put patients in the prescription queue.** Patients appear in the Rx Queue only after the **invoice webhook** creates a paid invoice. Ensure both automations are configured.

---

## Airtable Intake Script Troubleshooting

### "Patient not created when they pay" / "Not in prescription queue"

1. **Check trigger timing**
   - Trigger: "When record matches conditions" with `Checkout Completed` is checked
   - Or: "When record is updated" + condition `Checkout Completed` is checked
   - If you use "When record is created" only, the record may be created before payment (partial lead). Use "record updated" so it runs again when Checkout Completed becomes true.

2. **Table name**
   - Set `CONFIG.TABLE_NAME` in the script to your **exact** Airtable table name (e.g. `Onboarding`, `2026 Q1 Fillout Intake - 1`).

3. **Invoice automation**
   - The prescription queue is populated by **invoices**, not intakes. You must have the **Invoice** automation (see "Invoice Webhook" section below) that sends to `wellmedr-invoice` when payment is recorded. Without it, patients are created but never appear in Rx Queue.

4. **Field names**
   - Ensure your Airtable columns match: `first-name`, `last-name`, `email`, `phone`, `Checkout Completed`. Case and hyphens matter.

5. **Webhook secret**
   - The script's `WEBHOOK_SECRET` must exactly match `WELLMEDR_INTAKE_WEBHOOK_SECRET` in EONPRO (Vercel env vars). A 401 error means mismatch.

6. **Input variable**
   - The automation must pass `recordId` to the script. Map it to "Record ID" from the trigger step.

### Script Location

- `scripts/airtable/wellmedr-intake-automation.js`

---

## Features Enabled

| Feature           | Status | Notes                                             |
| ----------------- | ------ | ------------------------------------------------- |
| Patient Intake    | ✅     | Via webhook from Airtable                         |
| PDF Generation    | ✅     | Auto-generated, stored in S3                      |
| SOAP Notes        | ✅     | AI-generated for complete submissions             |
| Referral Tracking | ✅     | Promo codes tracked                               |
| Partial Leads     | ✅     | Tagged as `partial-lead` when checkout incomplete |
| Lifefile Pharmacy | ✅     | Credentials configured                            |

---

## S3 Document Storage (wellmedr-documents)

Patient documents (lab results, PDFs, imaging) are stored in AWS S3.

### Bucket Configuration

| Setting  | Value              |
| -------- | ------------------ |
| **Bucket** | `wellmedr-documents-{ACCOUNT_ID}` (e.g. `wellmedr-documents-147997129811`) |
| **Region** | `us-east-2` (Ohio)   |

*Note: S3 bucket names are globally unique. If `wellmedr-documents` is taken, the script uses `wellmedr-documents-{your-aws-account-id}`.*

### Deploy the Bucket

Run the script (requires AWS CLI with create-bucket permissions):

```bash
chmod +x scripts/aws/create-wellmedr-documents-bucket.sh
./scripts/aws/create-wellmedr-documents-bucket.sh
```

The script prints the actual bucket name. Use that value in Vercel.

### Vercel Environment Variables

Set in **Vercel** → Project → **Settings** → **Environment Variables** (Production):

| Variable | Value |
| -------- | ----- |
| `NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE` | `true` |
| `AWS_S3_DOCUMENTS_BUCKET_NAME` | `wellmedr-documents-147997129811` *(or output from script)* |
| `AWS_S3_BUCKET_NAME` | same as above |
| `AWS_REGION` | `us-east-2` |
| `AWS_ACCESS_KEY_ID` | (IAM access key) |
| `AWS_SECRET_ACCESS_KEY` | (IAM secret key) |

**Redeploy** after changing `NEXT_PUBLIC_*` variables.

### Verify

```bash
curl -s -H "Authorization: Bearer YOUR_TOKEN" \
  "https://app.eonpro.io/api/diagnostics/document-upload"
```

Expect `"ok": true` when configured correctly.

---

## Form Field Mapping (47 fields)

### Patient Identity (7 fields → Patient model)

| Wellmedr Field | Database Field | Notes         |
| -------------- | -------------- | ------------- |
| `first-name`   | `firstName`    | Capitalized   |
| `last-name`    | `lastName`     | Capitalized   |
| `email`        | `email`        | Lowercase     |
| `phone`        | `phone`        | Digits only   |
| `state`        | `state`        | 2-letter code |
| `dob`          | `dob`          | YYYY-MM-DD    |
| `sex`          | `gender`       | m/f           |

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

| Condition                    | Type     | Tags Applied                                         | SOAP Generated |
| ---------------------------- | -------- | ---------------------------------------------------- | -------------- |
| `Checkout Completed` = true  | Complete | `complete-intake`, `wellmedr`, `glp1`                | ✅ Yes         |
| `Checkout Completed` = false | Partial  | `partial-lead`, `needs-followup`, `wellmedr`, `glp1` | ❌ No          |

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
  email: record.getCellValue('Email'),
  phone: record.getCellValue('Phone'),
  state: record.getCellValue('State'),
  dob: record.getCellValue('Date of Birth'),
  sex: record.getCellValue('Sex'),
  feet: record.getCellValue('Height Feet'),
  inches: record.getCellValue('Height Inches'),
  weight: record.getCellValue('Weight'),
  'goal-weight': record.getCellValue('Goal Weight'),
  bmi: record.getCellValue('BMI'),
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

| Role              | Contact                         |
| ----------------- | ------------------------------- |
| Technical Support | EONPRO Team                     |
| Clinic Admin      | Dr. Sigle (rsigle@wellmedr.com) |

---

## History

| Date       | Change                                               | Verified By |
| ---------- | ---------------------------------------------------- | ----------- |
| 2026-01-24 | Initial webhook setup                                | System      |
| 2026-01-24 | Documented 47 form fields                            | System      |
| 2026-01-26 | Added invoice webhook for Airtable payment sync      | System      |
| 2026-01-27 | Added Lifefile shipping webhook for tracking updates | System      |

---

## Invoice Webhook (Airtable → EONPRO)

### Purpose

Creates invoices on patient profiles when a payment is detected in Airtable. **Comprehensive prescription matching**: The webhook uses `product`, `medication_type`, and `plan` to match the prescription to what the patient paid for. For 6-month and 12-month plans, it automatically schedules future refills at 90-day intervals (pharmacy BUD limit).

### Airtable Data Model (Orders + Products)

Your base typically has:

| Table    | Key Fields                                                                 | Purpose                                                                 |
| -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Orders** | `submission_id`, `payment_status`, `order_status`, `customer_email`, `customer_name`, `created_at`, `shipping_address`, `billing_address`, `method_payment_id` | Patient orders with payment status                                     |
| **Products** | `product` (semaglutide, tirzepatide), `medication_type` (injections), `plan` (6-month, monthly, quarterly, 12-month), `$ price`, `stripe_price_id` | Product catalog with medication, plan duration, and Stripe price mapping |

**Linking**: Orders link to Products via `stripe_price_id` (or a lookup/linked record). When building the webhook payload, resolve the Order's price to the Product record to get `product`, `medication_type`, and `plan`.

### Webhook Configuration

| Setting      | Value                                                    |
| ------------ | -------------------------------------------------------- |
| **Endpoint** | `https://app.eonpro.io/api/webhooks/wellmedr-invoice`    |
| **Method**   | `POST`                                                   |
| **Headers**  | `x-webhook-secret: <your-secret>`                        |
| **Trigger**  | When `method_payment_id` field has a value like `pm_...` |

### Airtable Automation Script

Use **input variables** in your Airtable "Run script" action. Map each variable to the correct field:

| Variable             | Airtable Field                             | Required | Notes |
| -------------------- | ------------------------------------------ | -------- | ----- |
| `customer_email`     | Email / Customer Email                     | Yes      |       |
| `payment_method_id`  | Payment Method ID / Stripe pm_*             | Yes      |       |
| `patient_name`       | Patient Name / Customer Name / Name         | No*      |       |
| `customer_name`      | Customer Name (fallback if no patient_name) | No       |       |
| `product`            | Product / Medication name                  | No       | **Use medication name** (Tirzepatide 2.5mg, Semaglutide 0.25mg), NOT plan-only (1mo/3mo Injections) |
| `medication_type`    | Medication Type / Medication               | No       | Strength or full drug (e.g. "2.5mg", "Tirzepatide 2.5mg"). Alt: `medication`, `treatment`, `product_name` |
| `plan`               | Plan / Duration                            | No       | 1mo, 3mo, 6-month, 12-month, Monthly, Quarterly, Annual. **Required for refill scheduling** |
| `price`              | Price / Amount                              | No       |
| `shipping_address`   | Shipping Address                            | **Yes*** | **Required for prescription shipping.** Without this, patients have no address on file and prescriptions cannot be fulfilled. |
| `created_at`         | Created At / Payment Date                   | No       |
| `submission_id`      | Submission ID                               | No       |
| `stripe_price_id`    | Stripe Price ID                             | No       |

\* **patient_name is strongly recommended** – EONPRO matches by email first, then by name when email fails. This helps when the payment email differs slightly from the intake record.

\* **shipping_address is effectively required** – Without it, the patient profile has no address and the prescription cannot be shipped. Map this to the Airtable Shipping Address field. Supports JSON objects and comma-separated strings (e.g., "123 Main St, Apt 4B, New York, NY, 10001").

### Refill Scheduling (6-Month and 12-Month Plans)

**Pharmacy constraint**: Medications have a 90-day Beyond Use Date (BUD). The pharmacy can only ship 3 months at a time.

| Plan      | Shipments   | Refill dates (from prescription date)        |
| --------- | ----------- | -------------------------------------------- |
| 6-month   | 2           | Initial + 90 days                            |
| 12-month  | 4           | Initial + 90, 180, 270 days                  |

When the webhook receives a 6-month or 12-month plan, it automatically:
1. Creates the invoice (queues initial prescription in Rx Queue)
2. Schedules future RefillQueue entries at 90, 180, 270 days
3. The refill cron moves due refills to the Refill Queue when their date arrives

No manual lookup needed – refills appear in Admin → Refill Queue when due.

```javascript
// WellMedR Invoice Webhook - Airtable Automation Script
// =====================================================
// Trigger: When payment_method_id field has a pm_* value
// Action: Send to EONPRO to create invoice and queue for prescription

const WEBHOOK_URL = 'https://app.eonpro.io/api/webhooks/wellmedr-invoice';
const WEBHOOK_SECRET = 'YOUR_WELLMEDR_INTAKE_WEBHOOK_SECRET'; // Must match EONPRO env

let config = input.config();

// Validate payment method (must start with pm_)
if (!config.payment_method_id || !config.payment_method_id.toString().startsWith('pm_')) {
  console.log('❌ Skipping - payment_method_id is empty or invalid');
  return;
}

if (!config.customer_email) {
  console.log('❌ Skipping - customer_email is empty');
  return;
}

// Parse shipping_address - handle both JSON and string formats
let shippingAddress = {};
let customerName = '';

if (config.shipping_address) {
  const rawAddress = String(config.shipping_address).trim();
  if (rawAddress.startsWith('{')) {
    try {
      shippingAddress = JSON.parse(rawAddress);
      customerName = shippingAddress.firstName && shippingAddress.lastName
        ? `${shippingAddress.firstName} ${shippingAddress.lastName}`
        : '';
    } catch (e) {
      console.log('⚠ JSON parse failed:', e.message);
    }
  } else {
    const parts = rawAddress.split(',').map((p) => p.trim());
    if (parts.length >= 4) {
      shippingAddress = { address: parts[0], city: parts[1], state: parts[2], zipCode: parts[3] };
    } else if (parts.length === 3 && /\d/.test(parts[0])) {
      const stateZip = parts[2].split(/\s+/);
      shippingAddress = { address: parts[0], city: parts[1], state: stateZip[0] || '', zipCode: stateZip[1] || '' };
    } else {
      shippingAddress = { address: rawAddress };
    }
  }
}

// Patient name: prefer explicit patient_name, then customer_name, then from address
const patientName = (config.patient_name || config.customer_name || customerName || '').trim();

// IMPORTANT: product = medication name (Tirzepatide 2.5mg), plan = duration (1mo, 3mo)
// If your Product column has "1mo Injections", map Medication/Medication Type to medication_type instead
const payload = {
  customer_email: String(config.customer_email).trim(),
  method_payment_id: String(config.payment_method_id),
  patient_name: patientName || undefined,
  customer_name: patientName || config.customer_name || undefined,
  product: config.product || config.medication || '', // Prefer medication name over plan-only
  medication_type: config.medication_type || config.medication || config.treatment || '',
  plan: config.plan || '',
  price: config.price || '',
  stripe_price_id: config.stripe_price_id || '',
  submission_id: config.submission_id || '',
  total_discount: config.total_discount || '',
  coupon_code: config.coupon_code || '',
  address: shippingAddress.address || '',
  address_line2: shippingAddress.apt || shippingAddress.address_line2 || '',
  city: shippingAddress.city || '',
  state: shippingAddress.state || '',
  zip: shippingAddress.zipCode || shippingAddress.zip || '',
  country: 'US',
  payment_date: config.created_at || '',
};

console.log('Sending to EONPRO:', payload.customer_email, patientName || '(no name)');

try {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (response.ok && result.success) {
    console.log('✅ SUCCESS - Invoice:', result.invoice?.id, 'Patient:', result.patient?.name);
  } else {
    console.log('❌ FAILED:', response.status, result.error || result.message);
    if (result.searchedEmail) console.log('   Searched email:', result.searchedEmail);
    if (result.searchedName) console.log('   Searched name:', result.searchedName);
  }
} catch (error) {
  console.log('❌ REQUEST ERROR:', error.message);
}
```

### Airtable Automation Setup

1. **Go to Automations** in your Airtable base
2. **Create new automation** named "Create EONPRO Invoice on Payment"
3. **Add Trigger**: "When record matches conditions"
   - Table: `Orders` (or your payments table)
   - Condition: `payment_method_id` is not empty AND starts with `pm_`
4. **Add Action**: "Run script"
   - Paste the script above
   - In **Input variables**, add each variable and map it to the matching Airtable field (see table above). At minimum: `customer_email`, `payment_method_id`. **Add `patient_name`** for better matching when email differs from intake.
5. **Add input variables**: Map `product`, `medication_type`, `plan`, `stripe_price_id`, `created_at`. **If Orders link to Products** (or you look up by stripe_price_id), map the linked Product's `product`, `medication_type`, and `plan` fields – these are critical for Rx Queue display and refill scheduling.
6. **Test** with a sample record that has `pm_*` in payment_method_id
7. **Turn on** the automation

**Script with linked Product**: If your Order record has a linked "Product" or "Price" record, resolve product/plan from it:

```javascript
// Resolve product and plan from linked Product record (if Orders → Product link exists)
let product = config.product || '';
let medication_type = config.medication_type || '';
let plan = config.plan || '';
if (config.linked_product && config.linked_product.length > 0) {
  const p = config.linked_product[0];
  product = p.fields?.product || p.product || product;
  medication_type = p.fields?.medication_type || p.medication_type || medication_type;
  plan = p.fields?.plan || p.plan || plan;
}
// Then use product, medication_type, plan in payload
```

### Response Format

Successful response:

```json
{
  "success": true,
  "requestId": "wellmedr-inv-1706300000000",
  "message": "Invoice created and marked as paid",
  "invoice": {
    "id": 123,
    "amount": 29900,
    "amountFormatted": "$299.00",
    "status": "PAID",
    "isPaid": true
  },
  "patient": {
    "id": 456,
    "patientId": "000789",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "product": "Tirzepatide 5mg",
  "paymentMethodId": "pm_1StwAHDfH4PWyxxdppqIGipS",
  "processingTime": "234ms"
}
```

### Error Responses

| Status | Error                         | Resolution                                       |
| ------ | ----------------------------- | ------------------------------------------------ |
| 401    | Unauthorized                  | Check webhook secret in headers                  |
| 404    | Patient not found             | Patient must be created via intake webhook first |
| 400    | Missing customer_email        | Ensure email field is mapped correctly           |
| 400    | Invalid payment method format | Only pm\_\* values are accepted                  |
| 500    | Database error                | Check EONPRO server logs                         |

### Troubleshooting "Not Working"

1. **401 Unauthorized**
   - The `x-webhook-secret` header must match `WELLMEDR_INTAKE_WEBHOOK_SECRET` or `WELLMEDR_INVOICE_WEBHOOK_SECRET` in EONPRO's environment.
   - Ensure the secret in your Airtable script matches production exactly (no extra spaces, correct casing).

2. **404 Patient not found**
   - The patient must already exist from the intake webhook. Check that the intake automation ran before the payment automation.
   - Add `patient_name` to your Airtable script – EONPRO matches by email first, then by name as fallback.
   - Verify `customer_email` in the payment record matches the email used in the intake form.
   - If emails differ (e.g., typo, different provider), include `patient_name` – EONPRO will try name-based matching.

3. **Script runs but no invoice appears**
   - Check Airtable automation run history for errors.
   - Verify the response: `result.success === true` means success.
   - Ensure `prescriptionProcessed: false` on the invoice so it shows in the prescription queue.

4. **Rx Queue shows "1mo Injections" or "3mo Injections" instead of medication name**
   - **Root cause**: The `product` field in Airtable contains plan/duration (1mo, 3mo) instead of the medication name.
   - **Fix (Airtable)**: Map `product` to the **medication name** (Tirzepatide 2.5mg, Semaglutide 0.25mg). Map `plan` to duration (1mo, 3mo, Monthly, Quarterly).
   - **Fix (alternate)**: If your base has medication in a separate column (e.g. "Medication", "Treatment"), add that as `medication_type` in the script – the webhook accepts `medication`, `treatment`, and `product_name` as alternates.
   - **Fallback**: EONPRO derives medication from the patient's intake form when the invoice has plan-only product. Ensure the intake ran before payment so the preferred medication is in the document.

5. **Patient addresses missing in Rx Queue**
   - **Root cause**: The `shipping_address` input variable is not mapped in the Airtable automation, so the webhook receives no address data.
   - **Fix (Airtable)**: Add `shipping_address` as an input variable in the "Run script" action and map it to the **Shipping Address** field in your Orders table. This is the most important fix.
   - **Backfill existing patients**: Call `POST /api/admin/sync-wellmedr-addresses?dryRun=true` to preview, then `?dryRun=false` to apply. This syncs addresses from invoice metadata and optionally from Airtable directly.
   - **Backfill requires env var**: `AIRTABLE_API_KEY` must be set in Vercel for the Airtable source (Base ID `app3usm1VtzcWOvZW` and Orders table `tblDO00gC6FZianoF` are hardcoded). The metadata source works without it.
   - **Fallback**: The prescription queue detail endpoint automatically falls back to invoice metadata addresses when the patient record has no address.

6. **Health check**
   - `GET https://app.eonpro.io/api/webhooks/wellmedr-invoice` returns endpoint status and `configured: true` when the secret is set.

---

---

## Lifefile Shipping Webhook (Lifefile → EONPRO)

### Purpose

Receives shipping/tracking updates from Lifefile and stores them at the patient profile level. This
allows providers to see prescription fulfillment history for each patient.

### Webhook Configuration

| Setting            | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| **Endpoint**       | `https://app.eonpro.io/api/webhooks/wellmedr-shipping` |
| **Method**         | `POST`                                                 |
| **Authentication** | Basic Auth (username:password)                         |
| **Content-Type**   | `application/json`                                     |

### Environment Variables

```bash
# Shipping webhook credentials (for Lifefile to call EONPRO)
WELLMEDR_SHIPPING_WEBHOOK_USERNAME=wellmedr_shipping
WELLMEDR_SHIPPING_WEBHOOK_PASSWORD=<secure-password>
```

### Expected Payload from Lifefile

```json
{
  "trackingNumber": "1Z999AA10123456784",
  "orderId": "LF-12345",
  "deliveryService": "UPS",
  "brand": "Wellmedr",
  "status": "shipped",
  "estimatedDelivery": "2026-01-30",
  "trackingUrl": "https://www.ups.com/track?tracknum=1Z999AA10123456784",
  "medication": {
    "name": "Semaglutide",
    "strength": "0.5mg",
    "quantity": "4",
    "form": "injection"
  },
  "patientEmail": "patient@example.com",
  "timestamp": "2026-01-27T10:30:00Z",
  "notes": "Optional notes about the shipment"
}
```

### Field Reference

| Field               | Required | Description                                |
| ------------------- | -------- | ------------------------------------------ |
| `trackingNumber`    | ✅ Yes   | Carrier tracking number                    |
| `orderId`           | ✅ Yes   | Lifefile order ID (LF-xxxxx)               |
| `deliveryService`   | ✅ Yes   | Carrier name (UPS, FedEx, USPS, etc.)      |
| `brand`             | No       | Clinic brand name (defaults to "Wellmedr") |
| `status`            | No       | Shipping status (defaults to "shipped")    |
| `estimatedDelivery` | No       | Expected delivery date (ISO 8601)          |
| `actualDelivery`    | No       | Actual delivery date (ISO 8601)            |
| `trackingUrl`       | No       | Direct link to carrier tracking page       |
| `medication`        | No       | Medication details object                  |
| `patientEmail`      | No       | Patient email for lookup (fallback)        |
| `patientId`         | No       | EONPRO patient ID (fallback)               |
| `timestamp`         | No       | Event timestamp                            |
| `notes`             | No       | Additional notes                           |

### Supported Status Values

| Status             | Description                  |
| ------------------ | ---------------------------- |
| `pending`          | Shipment not yet processed   |
| `label_created`    | Shipping label generated     |
| `shipped`          | Package picked up by carrier |
| `in_transit`       | Package in transit           |
| `out_for_delivery` | Package out for delivery     |
| `delivered`        | Package delivered            |
| `returned`         | Package returned to sender   |
| `exception`        | Delivery exception occurred  |
| `cancelled`        | Shipment cancelled           |

### Sample cURL Request (from Lifefile)

```bash
curl -X POST https://app.eonpro.io/api/webhooks/wellmedr-shipping \
  -H "Authorization: Basic $(echo -n 'wellmedr_shipping:<password>' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "1Z999AA10123456784",
    "orderId": "LF-12345",
    "deliveryService": "UPS",
    "brand": "Wellmedr",
    "status": "shipped",
    "estimatedDelivery": "2026-01-30",
    "medication": {
      "name": "Semaglutide",
      "strength": "0.5mg",
      "quantity": "4"
    }
  }'
```

### Response Format

**Success Response (200):**

```json
{
  "success": true,
  "requestId": "wellmedr-ship-1706360000000",
  "message": "Shipping update created",
  "shippingUpdate": {
    "id": 123,
    "trackingNumber": "1Z999AA10123456784",
    "carrier": "UPS",
    "status": "SHIPPED",
    "trackingUrl": null
  },
  "patient": {
    "id": 456,
    "patientId": "000789",
    "name": "John Doe"
  },
  "order": {
    "id": 789,
    "lifefileOrderId": "LF-12345"
  },
  "processingTime": "125ms"
}
```

**Error Responses:**

| Status | Error                   | Resolution                                                       |
| ------ | ----------------------- | ---------------------------------------------------------------- |
| 401    | Unauthorized            | Check Basic Auth credentials                                     |
| 400    | Invalid payload         | Check required fields (trackingNumber, orderId, deliveryService) |
| 202    | Patient/order not found | Ensure patient exists before sending shipping updates            |
| 500    | Internal error          | Check EONPRO server logs                                         |

### Where Data is Stored

1. **PatientShippingUpdate table**: All shipping updates stored at patient profile level
2. **Order table**: Also updates `trackingNumber`, `trackingUrl`, `shippingStatus` if order exists
3. **OrderEvent table**: Creates audit event for order history

### Viewing Shipping History

Shipping updates are visible in the EONPRO patient profile:

- Navigate to Patient → Prescriptions tab
- "Shipping History" section shows all updates
- Click tracking numbers to open carrier tracking pages

### Health Check

```bash
curl https://app.eonpro.io/api/webhooks/wellmedr-shipping
```

Expected response:

```json
{
  "status": "ok",
  "endpoint": "/api/webhooks/wellmedr-shipping",
  "clinic": "Wellmedr",
  "lifefileEnabled": true,
  "configured": true,
  "authentication": "Basic Auth"
}
```

---

## ⚠️ DO NOT MODIFY

The following are critical and should not be changed without testing:

1. Environment variables (both platforms)
2. Webhook endpoint URLs:
   - Intake: `/api/webhooks/wellmedr-intake`
   - Invoice: `/api/webhooks/wellmedr-invoice`
   - Shipping: `/api/webhooks/wellmedr-shipping`
3. Secret key (shared between webhooks)
4. Clinic lookup (subdomain: `wellmedr`)
5. Field mapping in normalizer
6. Invoice creation flow (finds patient by email → creates invoice → marks as paid)
7. Shipping webhook Basic Auth credentials
