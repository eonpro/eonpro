# EONPRO Webhook Integration Guide

> **Version:** 2.0  
> **Last Updated:** January 2026  
> **Base URL:** `https://app.eonpro.io/api`

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [Available Webhooks](#available-webhooks)
4. [Payload Formats](#payload-formats)
5. [Field Mapping](#field-mapping)
6. [Error Handling](#error-handling)
7. [Testing Your Integration](#testing-your-integration)
8. [Platform-Specific Guides](#platform-specific-guides)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Get Your Webhook Secret

Contact EONPRO support to receive your unique webhook secret for your clinic.

### 2. Configure Your Platform

Set these values in your platform's webhook settings:

| Setting | Value |
|---------|-------|
| **URL** | `https://app.eonpro.io/api/webhooks/weightlossintake` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Secret Header** | `x-webhook-secret: YOUR_SECRET` |

### 3. Send a Test Request

```bash
curl -X POST https://app.eonpro.io/api/webhooks/weightlossintake \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{
    "submissionId": "test-123",
    "data": {
      "firstName": "Test",
      "lastName": "Patient",
      "email": "test@example.com",
      "phone": "3051234567",
      "dateOfBirth": "1990-01-15",
      "state": "FL"
    }
  }'
```

### 4. Verify Success

Response:
```json
{
  "success": true,
  "requestId": "abc-123-def",
  "patient": {
    "id": 42,
    "patientId": "000042",
    "name": "Test Patient",
    "email": "test@example.com",
    "isNew": true
  }
}
```

---

## Authentication

EONPRO webhooks support three authentication methods (use ONE):

### Option 1: x-webhook-secret Header (Recommended)
```
x-webhook-secret: YOUR_SECRET_KEY
```

### Option 2: x-api-key Header
```
x-api-key: YOUR_SECRET_KEY
```

### Option 3: Authorization Bearer
```
Authorization: Bearer YOUR_SECRET_KEY
```

### Security Best Practices

- **Never expose** your webhook secret in client-side code
- **Rotate secrets** periodically (contact support)
- **Use HTTPS** only - HTTP requests are rejected
- **Verify IP** if your platform supports IP allowlisting

---

## Available Webhooks

### Patient Intake Webhook

**Endpoint:** `POST /api/webhooks/weightlossintake`

Receives patient intake form submissions and automatically:
- Creates or updates patient records
- Generates PDF intake forms
- Tracks referral/promo codes
- Logs all activity for compliance

**Supported Submission Types:**

| Type | Description | Patient Tags |
|------|-------------|--------------|
| `Complete` | Full intake completed | `complete-intake` |
| `Partial` | User dropped off mid-form | `partial-lead`, `needs-followup` |

---

## Payload Formats

EONPRO accepts **multiple payload formats** automatically. Use whichever format your platform outputs.

### Format 1: Data Object (Recommended)

```json
{
  "submissionId": "unique-submission-id",
  "submissionType": "Complete",
  "qualified": "Yes",
  "intakeNotes": "Optional notes about the submission",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "3051234567",
    "dateOfBirth": "1990-01-15",
    "gender": "Male",
    "streetAddress": "123 Main St",
    "city": "Miami",
    "state": "FL",
    "zipCode": "33130",
    "startingWeight": "210",
    "idealWeight": "175"
  }
}
```

### Format 2: Answers Array

```json
{
  "submissionId": "unique-id",
  "answers": [
    { "id": "firstName", "label": "First Name", "value": "John" },
    { "id": "lastName", "label": "Last Name", "value": "Doe" },
    { "id": "email", "label": "Email", "value": "john@example.com" }
  ]
}
```

### Format 3: Sections Array (HeyFlow style)

```json
{
  "submissionId": "unique-id",
  "sections": [
    {
      "title": "Personal Information",
      "fields": [
        { "id": "firstName", "value": "John" },
        { "id": "lastName", "value": "Doe" }
      ]
    },
    {
      "title": "Contact",
      "fields": [
        { "id": "email", "value": "john@example.com" }
      ]
    }
  ]
}
```

### Format 4: MedLink v2 (Root-level fields)

```json
{
  "responseId": "ml2-unique-id",
  "id-b1679347": "John",
  "id-30d7dea8": "Doe",
  "id-62de7872": "john@example.com",
  "phone-input-id-cc54007b": "3051234567"
}
```

---

## Field Mapping

EONPRO automatically maps fields from various naming conventions:

### Patient Core Fields

| EONPRO Field | Accepted Names |
|--------------|----------------|
| `firstName` | `firstName`, `first_name`, `fname`, `First Name` |
| `lastName` | `lastName`, `last_name`, `lname`, `Last Name` |
| `email` | `email`, `email_address`, `emailAddress`, `Email` |
| `phone` | `phone`, `phone_number`, `phoneNumber`, `mobile`, `cell` |
| `dateOfBirth` | `dateOfBirth`, `date_of_birth`, `dob`, `birthDate`, `birthday` |
| `gender` | `gender`, `sex` |
| `streetAddress` | `streetAddress`, `street_address`, `address`, `address1` |
| `city` | `city` |
| `state` | `state`, `stateCode`, `state_code`, `province` |
| `zipCode` | `zipCode`, `zip_code`, `zip`, `postalCode` |

### Date Formats Accepted

- `YYYY-MM-DD` (ISO 8601) → `1990-01-15`
- `MM/DD/YYYY` → `01/15/1990`
- `MM-DD-YYYY` → `01-15-1990`
- `MMDDYYYY` → `01151990`

### Phone Formats Accepted

- `(305) 123-4567` → `3051234567`
- `305-123-4567` → `3051234567`
- `+1 305 123 4567` → `3051234567`
- `13051234567` → `3051234567`

---

## Error Handling

### Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| `200` | Success | Patient created/updated |
| `400` | Bad Request | Check payload format |
| `401` | Unauthorized | Check webhook secret |
| `500` | Server Error | Contact support |

### Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "requestId": "abc-123-def",
  "message": "Detailed error description"
}
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `INVALID_SECRET` | Authentication failed | Check your webhook secret |
| `NO_SECRET_CONFIGURED` | Server misconfigured | Contact support |
| `INVALID_JSON` | Malformed JSON | Validate your JSON |
| `CLINIC_NOT_FOUND` | Clinic not setup | Contact support |
| `PATIENT_ERROR` | Failed to create patient | Check payload data |
| `DB_ERROR` | Database error | Retry in a few seconds |

### Retry Strategy

For `500` errors, implement exponential backoff:

```javascript
async function sendWithRetry(payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': SECRET
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) return await response.json();
      if (response.status === 401) throw new Error('Auth failed');
      
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
```

---

## Testing Your Integration

### Test Endpoint

Use the test endpoint to validate your integration without creating real patients:

```bash
curl -X POST https://app.eonpro.io/api/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{"test": true, "data": {"firstName": "Test"}}'
```

### Webhook Status Check

Check recent webhook activity:

```bash
curl https://app.eonpro.io/api/admin/webhook-status \
  -H "x-setup-secret: YOUR_SECRET"
```

### Common Test Scenarios

1. **Minimal Payload** - Should create patient with defaults
2. **Full Payload** - Should create complete patient record
3. **Duplicate Submission** - Should update, not duplicate
4. **Partial Submission** - Should tag as partial lead
5. **Invalid JSON** - Should return 400 error
6. **Wrong Secret** - Should return 401 error

---

## Platform-Specific Guides

### HeyFlow Integration

```json
{
  "webhook_url": "https://app.eonpro.io/api/webhooks/weightlossintake",
  "headers": {
    "x-webhook-secret": "YOUR_SECRET"
  },
  "payload_template": {
    "submissionId": "{{response_id}}",
    "submissionType": "Complete",
    "data": {
      "firstName": "{{first_name}}",
      "lastName": "{{last_name}}",
      "email": "{{email}}",
      "phone": "{{phone}}",
      "dateOfBirth": "{{date_of_birth}}",
      "state": "{{state}}"
    }
  }
}
```

### Typeform Integration

```json
{
  "url": "https://app.eonpro.io/api/webhooks/weightlossintake",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "x-webhook-secret": "YOUR_SECRET"
  }
}
```

### Airtable Automation

```javascript
// Airtable Script
const WEBHOOK_URL = 'https://app.eonpro.io/api/webhooks/weightlossintake';
const SECRET = 'YOUR_SECRET';

let response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': SECRET
  },
  body: JSON.stringify({
    submissionId: record.id,
    submissionType: record.getCellValue('Type') || 'Complete',
    qualified: record.getCellValue('Qualified'),
    intakeNotes: record.getCellValue('Notes'),
    data: {
      firstName: record.getCellValue('First Name'),
      lastName: record.getCellValue('Last Name'),
      email: record.getCellValue('Email'),
      phone: record.getCellValue('Phone'),
      dateOfBirth: record.getCellValue('DOB'),
      state: record.getCellValue('State')
    }
  })
});

let result = await response.json();
console.log('EONPRO Response:', result);
```

### Zapier Integration

1. **Trigger:** Choose your form platform trigger
2. **Action:** Webhooks by Zapier → POST
3. **Configure:**
   - URL: `https://app.eonpro.io/api/webhooks/weightlossintake`
   - Payload Type: JSON
   - Headers:
     - `x-webhook-secret`: Your secret
   - Data: Map your fields

### Make (Integromat) Integration

1. **HTTP Module:** Make a request
2. **URL:** `https://app.eonpro.io/api/webhooks/weightlossintake`
3. **Method:** POST
4. **Headers:**
   - `Content-Type`: `application/json`
   - `x-webhook-secret`: Your secret
5. **Body:** JSON with your field mapping

---

## Troubleshooting

### Issue: 401 Unauthorized

**Causes:**
- Wrong webhook secret
- Missing secret header
- Secret has extra spaces

**Solution:**
```bash
# Verify your secret works
curl -I -X POST https://app.eonpro.io/api/webhooks/weightlossintake \
  -H "x-webhook-secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Issue: Patient Not Created

**Causes:**
- Field names not recognized
- Data in wrong format

**Solution:**
Check the `warnings` array in the response for field mapping issues.

### Issue: Duplicate Patients

**Causes:**
- Different submissionId for same person
- Typo in email/phone

**Solution:**
EONPRO deduplicates by email, phone, or name+DOB. Ensure consistent data.

### Issue: PDF Not Generated

**Causes:**
- Large payload
- Special characters

**Solution:**
Check `document` field in response. If null, PDF generation failed but patient was still created.

### Getting Help

- **Email:** support@eonpro.io
- **Response Time:** < 24 hours
- **Include:** Your requestId from the response

---

## Appendix: Full Payload Example

```json
{
  "submissionId": "intake-2026-01-18-abc123",
  "submissionType": "Complete",
  "qualified": "Yes",
  "intakeNotes": "Patient referred by Dr. Smith",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "(305) 123-4567",
    "dateOfBirth": "03/15/1985",
    "gender": "Male",
    "streetAddress": "123 Main Street",
    "apartment": "Apt 4B",
    "city": "Miami",
    "state": "FL",
    "zipCode": "33130",
    "startingWeight": "210",
    "idealWeight": "175",
    "height": "5'10\"",
    "chronicConditions": ["High Blood Pressure", "Sleep Apnea"],
    "currentMedications": "Lisinopril 10mg daily",
    "allergies": "Penicillin",
    "previousGLP1": "Yes - Ozempic",
    "sideEffects": "Mild nausea first week",
    "activityLevel": "Moderate - 3x/week",
    "promoCode": "HEALTH2026",
    "howDidYouHear": "Instagram"
  }
}
```

---

*Last Updated: January 2026 | EONPRO v2.0*
