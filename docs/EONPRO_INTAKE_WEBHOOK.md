# EONPRO Intake Webhook Integration

This document explains how to configure your external intake platform to send patient intake forms
to EONPRO.

## Webhook Endpoint

### Production

```
POST https://eonpro-kappa.vercel.app/api/webhooks/eonpro-intake
```

### Local Development

```
POST http://localhost:3001/api/webhooks/eonpro-intake
```

## Authentication

The webhook requires authentication via one of these methods:

### Option 1: X-Webhook-Secret Header (Recommended)

```
X-Webhook-Secret: f472179eb675f8412331e6c24648a680124a85b57e0100683e35440df6e32c1c
```

### Option 2: Authorization Bearer Token

```
Authorization: Bearer f472179eb675f8412331e6c24648a680124a85b57e0100683e35440df6e32c1c
```

### Option 3: X-API-Key Header

```
X-API-Key: f472179eb675f8412331e6c24648a680124a85b57e0100683e35440df6e32c1c
```

## Environment Variable

The secret is already configured in Vercel production. For local development, set in `.env.local`:

```bash
EONPRO_INTAKE_WEBHOOK_SECRET=f472179eb675f8412331e6c24648a680124a85b57e0100683e35440df6e32c1c
```

To generate a new secret (if rotating):

```bash
openssl rand -hex 32
```

---

## Payload Formats

The webhook accepts multiple payload formats for flexibility.

### Format 1: Flat Data Object (Recommended)

```json
{
  "submissionId": "intake-2024-001",
  "submittedAt": "2024-01-15T10:30:00Z",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "5551234567",
    "dateOfBirth": "1990-01-15",
    "gender": "Male",
    "streetAddress": "123 Main St",
    "apartment": "Apt 4B",
    "city": "Miami",
    "state": "FL",
    "zipCode": "33101",
    "currentMedications": "Metformin 500mg daily",
    "allergies": "Penicillin, Shellfish",
    "medicalConditions": "Type 2 Diabetes, Hypertension",
    "reasonForVisit": "Weight management consultation",
    "chiefComplaint": "Difficulty losing weight despite diet changes",
    "medicalHistory": "Diagnosed with diabetes in 2020",
    "familyHistory": "Father - heart disease; Mother - diabetes",
    "surgicalHistory": "Appendectomy 2015",
    "currentSymptoms": "Fatigue, increased thirst, frequent urination",
    "painLevel": "3/10",
    "weight": "220",
    "height": "5'10\"",
    "bloodPressure": "140/90",
    "tobaccoUse": "Never",
    "alcoholUse": "Social - 2-3 drinks/week",
    "exerciseFrequency": "2-3 times per week",
    "promoCode": "WEIGHTLOSS2024"
  }
}
```

### Format 2: Sections with Fields

```json
{
  "submissionId": "intake-2024-002",
  "submittedAt": "2024-01-15T11:00:00Z",
  "sections": [
    {
      "title": "Personal Information",
      "fields": [
        { "id": "firstName", "label": "First Name", "value": "Jane" },
        { "id": "lastName", "label": "Last Name", "value": "Smith" },
        { "id": "email", "label": "Email", "value": "jane.smith@email.com" },
        { "id": "phone", "label": "Phone", "value": "5559876543" },
        { "id": "dob", "label": "Date of Birth", "value": "1985-06-20" },
        { "id": "gender", "label": "Gender", "value": "Female" }
      ]
    },
    {
      "title": "Address",
      "fields": [
        { "id": "address1", "label": "Street Address", "value": "456 Oak Ave" },
        { "id": "city", "label": "City", "value": "Orlando" },
        { "id": "state", "label": "State", "value": "FL" },
        { "id": "zip", "label": "ZIP Code", "value": "32801" }
      ]
    },
    {
      "title": "Medical History",
      "fields": [
        { "id": "medications", "label": "Current Medications", "value": "Lisinopril 10mg" },
        { "id": "allergies", "label": "Allergies", "value": "None known" },
        { "id": "conditions", "label": "Medical Conditions", "value": "Hypertension" },
        { "id": "surgeries", "label": "Previous Surgeries", "value": "None" }
      ]
    },
    {
      "title": "Chief Complaint",
      "fields": [
        {
          "id": "reason",
          "label": "Reason for Visit",
          "value": "Annual checkup and medication refill"
        },
        { "id": "symptoms", "label": "Current Symptoms", "value": "Occasional headaches" }
      ]
    }
  ]
}
```

### Format 3: Answers Array

```json
{
  "submissionId": "intake-2024-003",
  "answers": [
    { "id": "q1", "label": "First Name", "value": "Robert" },
    { "id": "q2", "label": "Last Name", "value": "Johnson" },
    { "id": "q3", "label": "Email", "value": "robert.j@email.com" },
    { "id": "q4", "label": "Phone Number", "value": "5552223333" },
    { "id": "q5", "label": "Date of Birth", "value": "1975-03-10" },
    { "id": "q6", "label": "Street Address", "value": "789 Pine Rd" },
    { "id": "q7", "label": "City", "value": "Tampa" },
    { "id": "q8", "label": "State", "value": "Florida" },
    { "id": "q9", "label": "ZIP", "value": "33602" }
  ]
}
```

---

## Required Patient Fields

The following fields are required (or will default to placeholders):

| Field           | Required    | Description                                           |
| --------------- | ----------- | ----------------------------------------------------- |
| firstName       | Yes         | Patient's first name                                  |
| lastName        | Yes         | Patient's last name                                   |
| email           | Yes         | Patient's email (used for matching existing patients) |
| phone           | Recommended | Phone number (digits only or formatted)               |
| dateOfBirth/dob | Recommended | Format: YYYY-MM-DD or MM/DD/YYYY                      |
| gender          | Optional    | M/F/Male/Female                                       |

## Address Fields

| Field                    | Description                            |
| ------------------------ | -------------------------------------- |
| streetAddress / address1 | Street address                         |
| apartment / address2     | Unit/Apt number                        |
| city                     | City name                              |
| state                    | State code (FL) or full name (Florida) |
| zipCode / zip            | ZIP/Postal code                        |

## Medical Fields (Captured as Intake Data)

All additional fields are captured and displayed in the patient's intake form:

- currentMedications
- allergies
- medicalConditions / chronicConditions
- reasonForVisit
- chiefComplaint
- medicalHistory
- familyHistory
- surgicalHistory
- currentSymptoms
- painLevel
- weight / height / BMI
- bloodPressure / heartRate
- tobaccoUse / alcoholUse
- exerciseFrequency
- mentalHealthHistory
- promoCode / referralCode

---

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "patientId": 123,
    "documentId": 456,
    "soapNoteId": 789,
    "submissionId": "intake-2024-001",
    "pdfUrl": "/storage/intake-pdfs/intake-2024-001.pdf",
    "patientCreated": true
  },
  "message": "Intake processed successfully"
}
```

### Error Response (401 - Unauthorized)

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing webhook secret"
}
```

### Error Response (400 - Bad Request)

```json
{
  "error": "Invalid payload",
  "message": "Payload must be a non-empty object"
}
```

### Error Response (500 - Server Error)

```json
{
  "success": false,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Processing failed",
  "message": "Detailed error message"
}
```

---

## What Happens When Intake is Received

1. **Patient Lookup/Creation**: The system checks if a patient with the email already exists
   - If exists: Updates patient information
   - If new: Creates a new patient record

2. **PDF Generation**: An intake form PDF is generated with all submitted data

3. **Document Storage**: The PDF and structured data are stored and linked to the patient

4. **SOAP Note Generation**: AI automatically generates a preliminary SOAP note (optional)

5. **Response**: Returns patient ID, document ID, and PDF URL

---

## Testing the Webhook

### Using cURL

```bash
curl -X POST http://localhost:3001/api/webhooks/eonpro-intake \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret-key" \
  -d '{
    "submissionId": "test-001",
    "data": {
      "firstName": "Test",
      "lastName": "Patient",
      "email": "test@example.com",
      "phone": "5551234567",
      "dateOfBirth": "1990-01-01",
      "city": "Miami",
      "state": "FL",
      "zipCode": "33101",
      "reasonForVisit": "Test intake submission"
    }
  }'
```

### Health Check

```bash
curl http://localhost:3001/api/webhooks/eonpro-intake
```

Response:

```json
{
  "status": "healthy",
  "endpoint": "/api/webhooks/eonpro-intake",
  "method": "POST",
  "version": "1.0"
}
```

---

## Integration Code Examples

### JavaScript/Node.js

```javascript
const sendIntake = async (intakeData) => {
  const response = await fetch('https://eonpro-kappa.vercel.app/api/webhooks/eonpro-intake', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': process.env.EONPRO_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      submissionId: `intake-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      data: intakeData,
    }),
  });

  return response.json();
};

// Usage
const result = await sendIntake({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '5551234567',
  reasonForVisit: 'Weight loss consultation',
});

console.log('Patient created:', result.data.patientId);
```

### Python

```python
import requests
import os
from datetime import datetime

def send_intake(intake_data):
    url = "https://eonpro-kappa.vercel.app/api/webhooks/eonpro-intake"
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Secret": os.environ["EONPRO_WEBHOOK_SECRET"]
    }
    payload = {
        "submissionId": f"intake-{datetime.now().timestamp()}",
        "submittedAt": datetime.now().isoformat(),
        "data": intake_data
    }

    response = requests.post(url, json=payload, headers=headers)
    return response.json()

# Usage
result = send_intake({
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "5551234567",
    "reasonForVisit": "Weight loss consultation"
})

print(f"Patient created: {result['data']['patientId']}")
```

### PHP

```php
<?php
function sendIntake($intakeData) {
    $url = "https://eonpro-kappa.vercel.app/api/webhooks/eonpro-intake";

    $payload = json_encode([
        "submissionId" => "intake-" . time(),
        "submittedAt" => date('c'),
        "data" => $intakeData
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Webhook-Secret: ' . getenv('EONPRO_WEBHOOK_SECRET')
    ]);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

// Usage
$result = sendIntake([
    "firstName" => "John",
    "lastName" => "Doe",
    "email" => "john@example.com",
    "phone" => "5551234567",
    "reasonForVisit" => "Weight loss consultation"
]);

echo "Patient created: " . $result["data"]["patientId"];
```

---

## Troubleshooting

### 401 Unauthorized

- Check that the webhook secret is correctly configured
- Ensure header name matches (X-Webhook-Secret or Authorization)
- Verify the secret value matches on both sides

### 400 Bad Request

- Ensure the body is valid JSON
- Check that required fields are included (firstName, lastName, email)

### Patient Not Created

- Check server logs for normalization errors
- Verify email is unique or use a different submissionId

### PDF Not Generated

- Check storage permissions
- Verify the storage directory exists

---

## Environment Variables

Add these to your EONPRO `.env` file:

```bash
# Webhook Authentication
EONPRO_INTAKE_WEBHOOK_SECRET=generate-a-32-char-secret

# Storage (if using local storage)
INTAKE_PDF_STORAGE_PATH=./storage/intake-pdfs

# AI Features (for SOAP note generation)
OPENAI_API_KEY=your-openai-key
```

---

## Security Best Practices

1. **Always use HTTPS** in production
2. **Rotate webhook secrets** periodically
3. **Validate the source** IP if possible
4. **Log all webhook requests** for audit trails
5. **Rate limit** webhook endpoints to prevent abuse
6. **Validate payload size** (current limit: ~10MB)

---

## Support

If you encounter issues:

1. Check the server logs for detailed error messages
2. Test with the health check endpoint first
3. Use the cURL examples to verify connectivity
4. Contact support with the `requestId` from the response
