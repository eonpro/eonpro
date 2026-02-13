# EONPRO API Reference

> **Version:** 2.0.0  
> **Base URL:** `https://app.eonpro.io/api`  
> **Last Updated:** January 2026

## Overview

The EONPRO API provides programmatic access to the healthcare platform for:

- **Webhooks:** Receive patient intake data from external forms
- **Patients:** Create, read, update patient records
- **Documents:** Manage patient documents and intake PDFs
- **Prescriptions:** Create and track prescriptions via Lifefile
- **Billing:** Manage invoices and payments via Stripe

---

## Authentication

### JWT Authentication (for UI/Apps)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "provider@clinic.com",
  "password": "your-password"
}
```

Response:

```json
{
  "token": "eyJhbG...",
  "user": { "id": 1, "email": "...", "role": "provider" }
}
```

Use the token in subsequent requests:

```http
Authorization: Bearer eyJhbG...
```

### Webhook Authentication

For webhook endpoints, use a secret key:

```http
x-webhook-secret: YOUR_SECRET_KEY
```

Or:

```http
x-api-key: YOUR_SECRET_KEY
```

Or:

```http
Authorization: Bearer YOUR_SECRET_KEY
```

---

## Webhooks

### POST /api/webhooks/weightlossintake

Receive patient intake form submissions.

**Authentication:** Webhook secret required

**Request:**

```http
POST /api/webhooks/weightlossintake
Content-Type: application/json
x-webhook-secret: YOUR_SECRET

{
  "submissionId": "unique-id-123",
  "submissionType": "Complete",
  "qualified": "Yes",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "3051234567",
    "dateOfBirth": "1990-01-15",
    "state": "FL"
  }
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "requestId": "abc-123-def",
  "patient": {
    "id": 42,
    "patientId": "000042",
    "name": "John Doe",
    "email": "john@example.com",
    "isNew": true
  },
  "submission": {
    "type": "complete",
    "qualified": "Yes",
    "isPartial": false
  },
  "document": {
    "id": 15,
    "filename": "patient_42_unique-id-123.pdf",
    "url": "database://intake-pdfs/..."
  },
  "clinic": {
    "id": 3,
    "name": "EONMEDS"
  },
  "processingTime": "1523ms",
  "warnings": []
}
```

**Error Response (401):**

```json
{
  "error": "Unauthorized",
  "code": "INVALID_SECRET",
  "requestId": "abc-123-def"
}
```

---

### POST /api/webhooks/test

Test webhook integration without creating real patients.

**Request:**

```http
POST /api/webhooks/test
Content-Type: application/json
x-webhook-secret: YOUR_SECRET

{
  "test": true,
  "data": {
    "firstName": "Test",
    "lastName": "Patient"
  }
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "test": true,
  "requestId": "test-123",
  "message": "Webhook test successful!",
  "validation": {
    "authentication": { "status": "PASSED" },
    "payload": { "status": "PASSED", "format": "data_object" },
    "normalization": { "status": "PASSED" }
  },
  "wouldCreate": {
    "patient": {
      "firstName": "Test",
      "lastName": "Patient",
      "email": "unknown@example.com"
    }
  },
  "hints": ["📧 No email found. Try: email, email_address"]
}
```

---

## Patients

### GET /api/patients

List all patients (paginated).

**Authentication:** JWT required (admin/provider)

**Query Parameters:** | Parameter | Type | Description | |-----------|------|-------------| | `page`
| number | Page number (default: 1) | | `limit` | number | Items per page (default: 20, max: 100) |
| `search` | string | Search by name, email, or phone | | `status` | string | Filter by status | |
`tags` | string | Filter by tags (comma-separated) |

**Response:**

```json
{
  "patients": [
    {
      "id": 1,
      "patientId": "000001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "3051234567",
      "tags": ["complete-intake", "eonmeds"],
      "createdAt": "2026-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

### GET /api/patients/{id}

Get a single patient by ID.

**Authentication:** JWT required

**Response:**

```json
{
  "id": 1,
  "patientId": "000001",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "3051234567",
  "dob": "1990-01-15",
  "gender": "m",
  "address1": "123 Main St",
  "city": "Miami",
  "state": "FL",
  "zip": "33130",
  "tags": ["complete-intake"],
  "documents": [
    {
      "id": 5,
      "filename": "intake_form.pdf",
      "category": "MEDICAL_INTAKE_FORM"
    }
  ],
  "orders": [],
  "soapNotes": []
}
```

---

### POST /api/patients

Create a new patient.

**Authentication:** JWT required (admin/provider)

**Request:**

```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "3059876543",
  "dob": "1985-06-20",
  "gender": "f",
  "address1": "456 Oak Ave",
  "city": "Miami",
  "state": "FL",
  "zip": "33140"
}
```

**Response (201 Created):**

```json
{
  "id": 43,
  "patientId": "000043",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "createdAt": "2026-01-18T15:30:00Z"
}
```

---

## Documents

### GET /api/patients/{patientId}/documents

List patient documents.

**Authentication:** JWT required

**Response:**

```json
{
  "documents": [
    {
      "id": 15,
      "filename": "intake_form.pdf",
      "category": "MEDICAL_INTAKE_FORM",
      "mimeType": "application/pdf",
      "createdAt": "2026-01-15T10:30:00Z",
      "url": "/api/patients/1/documents/15"
    }
  ]
}
```

---

### GET /api/patients/{patientId}/documents/{documentId}

Download a document.

**Authentication:** JWT required

**Response:** Binary file with appropriate Content-Type header.

---

## SOAP Notes

### GET /api/soap-notes

Get SOAP notes for a patient.

**Authentication:** JWT required (provider)

**Query Parameters:** | Parameter | Type | Description | |-----------|------|-------------| |
`patientId` | number | Required. Patient ID | | `includeRevisions` | boolean | Include revision
history | | `approvedOnly` | boolean | Only return approved notes |

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "patientId": 42,
      "subjective": "Patient reports...",
      "objective": "BMI: 32.1...",
      "assessment": "Candidate for GLP-1...",
      "plan": "Start semaglutide 0.25mg...",
      "createdAt": "2026-01-15T10:30:00Z"
    }
  ]
}
```

---

### POST /api/soap-notes

Create a SOAP note (manual or AI-generated).

**Authentication:** JWT required (provider)

**Request (AI Generated):**

```json
{
  "patientId": 42,
  "generateFromIntake": true
}
```

**Request (Manual):**

```json
{
  "patientId": 42,
  "generateFromIntake": false,
  "manualContent": {
    "subjective": "Patient reports...",
    "objective": "Examination findings...",
    "assessment": "Clinical assessment...",
    "plan": "Treatment plan..."
  }
}
```

---

## Prescriptions

### POST /api/prescriptions

Create a prescription via Lifefile pharmacy integration.

**Authentication:** JWT required (provider)

**Request:**

```json
{
  "patientId": 42,
  "providerId": 1,
  "medication": "Semaglutide",
  "dosage": "0.25mg",
  "quantity": 4,
  "refills": 3,
  "instructions": "Inject subcutaneously once weekly"
}
```

---

## Rate Limiting

| Endpoint Type  | Limit | Window     |
| -------------- | ----- | ---------- |
| Authentication | 5     | 15 minutes |
| Standard API   | 120   | 1 minute   |
| Webhooks       | 1000  | 1 minute   |
| File Upload    | 10    | 1 minute   |

Rate limit headers:

```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 118
X-RateLimit-Reset: 2026-01-18T15:31:00Z
```

---

## Error Codes

| Code               | HTTP Status | Description              |
| ------------------ | ----------- | ------------------------ |
| `AUTH_REQUIRED`    | 401         | Authentication required  |
| `INVALID_SECRET`   | 401         | Invalid webhook secret   |
| `FORBIDDEN`        | 403         | Insufficient permissions |
| `NOT_FOUND`        | 404         | Resource not found       |
| `VALIDATION_ERROR` | 400         | Invalid request data     |
| `RATE_LIMITED`     | 429         | Too many requests        |
| `SERVER_ERROR`     | 500         | Internal server error    |

---

## SDKs and Code Examples

### Node.js / TypeScript

```typescript
const EONPRO_API = 'https://app.eonpro.io/api';
const WEBHOOK_SECRET = process.env.EONPRO_WEBHOOK_SECRET;

// Send patient intake
async function sendIntake(data: PatientIntake) {
  const response = await fetch(`${EONPRO_API}/webhooks/weightlossintake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      submissionId: `intake-${Date.now()}`,
      data,
    }),
  });

  return response.json();
}
```

### Python

```python
import requests

EONPRO_API = 'https://app.eonpro.io/api'
WEBHOOK_SECRET = os.environ['EONPRO_WEBHOOK_SECRET']

def send_intake(data):
    response = requests.post(
        f'{EONPRO_API}/webhooks/weightlossintake',
        headers={
            'Content-Type': 'application/json',
            'x-webhook-secret': WEBHOOK_SECRET,
        },
        json={
            'submissionId': f'intake-{int(time.time())}',
            'data': data,
        }
    )
    return response.json()
```

### cURL

```bash
curl -X POST https://app.eonpro.io/api/webhooks/weightlossintake \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{
    "submissionId": "test-123",
    "data": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com"
    }
  }'
```

---

## Support

- **Documentation:** https://app.eonpro.io/docs
- **Email:** support@eonpro.io
- **Status:** https://status.eonpro.io

---

_© 2026 EONPRO. All rights reserved._
