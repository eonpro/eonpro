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
| 2026-01-26 | Added invoice webhook for Airtable payment sync | System |
| 2026-01-27 | Added Lifefile shipping webhook for tracking updates | System |

---

## Invoice Webhook (Airtable → EONPRO)

### Purpose
Creates invoices on patient profiles when a payment is detected in Airtable.

### Webhook Configuration

| Setting | Value |
|---------|-------|
| **Endpoint** | `https://app.eonpro.io/api/webhooks/wellmedr-invoice` |
| **Method** | `POST` |
| **Headers** | `x-webhook-secret: <your-secret>` |
| **Trigger** | When `method_payment_id` field has a value like `pm_...` |

### Airtable Automation Script

```javascript
// WellMedR Invoice Webhook - Airtable Automation Script
// =====================================================
// Trigger: When "method_payment_id" field is not empty and matches pm_* pattern
// Action: Send patient data to EONPRO to create invoice

const WEBHOOK_URL = 'https://app.eonpro.io/api/webhooks/wellmedr-invoice';
const WEBHOOK_SECRET = 'YOUR_WELLMEDR_INTAKE_WEBHOOK_SECRET'; // Same as intake webhook

// Get the record that triggered this automation
let inputConfig = input.config();
let record = inputConfig.record;

// Get field values from the record
const methodPaymentId = record.getCellValueAsString('method_payment_id');

// Only proceed if method_payment_id looks like a Stripe payment method
if (!methodPaymentId || !methodPaymentId.startsWith('pm_')) {
  console.log('Skipping - no valid payment method ID found');
  output.set('status', 'skipped');
  output.set('reason', 'No valid pm_* payment method ID');
  return;
}

// Build the payload from Airtable record
const payload = {
  // Required fields
  customer_email: record.getCellValueAsString('customer_email'),
  method_payment_id: methodPaymentId,
  
  // Optional fields - adjust field names to match your Airtable
  customer_name: record.getCellValueAsString('customer_name') || 
                 record.getCellValueAsString('cardholder_name'),
  cardholder_name: record.getCellValueAsString('cardholder_name'),
  product: record.getCellValueAsString('product'),
  amount: parseAmountToCents(record.getCellValue('amount') || record.getCellValue('amount_paid')),
  submission_id: record.getCellValueAsString('submission_id'),
  order_status: record.getCellValueAsString('order_status'),
  subscription_status: record.getCellValueAsString('subscription_status'),
};

// Validate required email
if (!payload.customer_email) {
  console.error('Missing customer_email - cannot create invoice');
  output.set('status', 'error');
  output.set('reason', 'Missing customer_email');
  return;
}

console.log('Sending invoice request for:', payload.customer_email);
console.log('Product:', payload.product);
console.log('Amount:', payload.amount ? `$${(payload.amount / 100).toFixed(2)}` : 'default');

// Send to EONPRO
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
    console.log('✅ Invoice created successfully!');
    console.log('Invoice ID:', result.invoice?.id);
    console.log('Patient:', result.patient?.name);
    console.log('Amount:', result.invoice?.amountFormatted);
    console.log('Status:', result.invoice?.status);
    
    output.set('status', 'success');
    output.set('invoiceId', result.invoice?.id);
    output.set('eonproPatientId', result.patient?.id);
    output.set('amount', result.invoice?.amountFormatted);
  } else {
    console.error('❌ Invoice creation failed:', result.error || result.message);
    output.set('status', 'error');
    output.set('error', result.error || result.message);
  }
} catch (error) {
  console.error('❌ Request failed:', error.message);
  output.set('status', 'error');
  output.set('error', error.message);
}

// Helper function to parse amount to cents
function parseAmountToCents(amount) {
  if (!amount) return null;
  
  // If it's a number
  if (typeof amount === 'number') {
    // If it looks like dollars (less than 1000), convert to cents
    if (amount < 1000) {
      return Math.round(amount * 100);
    }
    return Math.round(amount);
  }
  
  // If it's a string, parse it
  if (typeof amount === 'string') {
    // Remove currency symbols and commas
    const cleaned = amount.replace(/[$,]/g, '').trim();
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) {
      // If it looks like dollars, convert to cents
      if (parsed < 1000) {
        return Math.round(parsed * 100);
      }
      return Math.round(parsed);
    }
  }
  
  return null;
}
```

### Airtable Automation Setup

1. **Go to Automations** in your Airtable base
2. **Create new automation** named "Create EONPRO Invoice on Payment"
3. **Add Trigger**: "When record matches conditions"
   - Table: `Orders`
   - Condition: `method_payment_id` is not empty AND starts with "pm_"
4. **Add Action**: "Run script"
   - Paste the script above
   - Configure input: `record` = the triggering record
5. **Configure output** (optional):
   - `status` - success/error/skipped
   - `invoiceId` - EONPRO invoice ID
   - `eonproPatientId` - EONPRO patient ID
   - `amount` - Invoice amount
   - `error` - Error message if failed
6. **Test** with a sample record
7. **Turn on** the automation

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

| Status | Error | Resolution |
|--------|-------|------------|
| 401 | Unauthorized | Check webhook secret in headers |
| 404 | Patient not found | Patient must be created via intake webhook first |
| 400 | Missing customer_email | Ensure email field is mapped correctly |
| 400 | Invalid payment method format | Only pm_* values are accepted |
| 500 | Database error | Check EONPRO server logs |

---

---

## Lifefile Shipping Webhook (Lifefile → EONPRO)

### Purpose
Receives shipping/tracking updates from Lifefile and stores them at the patient profile level. This allows providers to see prescription fulfillment history for each patient.

### Webhook Configuration

| Setting | Value |
|---------|-------|
| **Endpoint** | `https://app.eonpro.io/api/webhooks/wellmedr-shipping` |
| **Method** | `POST` |
| **Authentication** | Basic Auth (username:password) |
| **Content-Type** | `application/json` |

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

| Field | Required | Description |
|-------|----------|-------------|
| `trackingNumber` | ✅ Yes | Carrier tracking number |
| `orderId` | ✅ Yes | Lifefile order ID (LF-xxxxx) |
| `deliveryService` | ✅ Yes | Carrier name (UPS, FedEx, USPS, etc.) |
| `brand` | No | Clinic brand name (defaults to "Wellmedr") |
| `status` | No | Shipping status (defaults to "shipped") |
| `estimatedDelivery` | No | Expected delivery date (ISO 8601) |
| `actualDelivery` | No | Actual delivery date (ISO 8601) |
| `trackingUrl` | No | Direct link to carrier tracking page |
| `medication` | No | Medication details object |
| `patientEmail` | No | Patient email for lookup (fallback) |
| `patientId` | No | EONPRO patient ID (fallback) |
| `timestamp` | No | Event timestamp |
| `notes` | No | Additional notes |

### Supported Status Values

| Status | Description |
|--------|-------------|
| `pending` | Shipment not yet processed |
| `label_created` | Shipping label generated |
| `shipped` | Package picked up by carrier |
| `in_transit` | Package in transit |
| `out_for_delivery` | Package out for delivery |
| `delivered` | Package delivered |
| `returned` | Package returned to sender |
| `exception` | Delivery exception occurred |
| `cancelled` | Shipment cancelled |

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

| Status | Error | Resolution |
|--------|-------|------------|
| 401 | Unauthorized | Check Basic Auth credentials |
| 400 | Invalid payload | Check required fields (trackingNumber, orderId, deliveryService) |
| 202 | Patient/order not found | Ensure patient exists before sending shipping updates |
| 500 | Internal error | Check EONPRO server logs |

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
