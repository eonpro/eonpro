# OT Mens - Better Sex Integration

This document explains the integration for the **OT Mens - Better Sex** Heyflow form via Airtable.

## Overview

- **Clinic**: Overtime Men's Clinic (subdomain: `ot`)
- **Treatment Type**: Better Sex (ED/Sexual Health)
- **Heyflow ID**: `5ypJkFxQN4V4U4PB7R4u`
- **Flow Path**: `bettersex`
- **Heyflow URL**: `https://hollyhock-ambulance-ravioli.heyflow.site/bettersex`
- **Airtable Table ID**: `tblwZg0EuVlmz0I01`
- **Airtable Table Name**: `OT Mens - Better Sex`

---

## Airtable API Sync

### Sync Endpoint

```
POST https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblwZg0EuVlmz0I01
```

### Authentication

```
Authorization: Bearer <OVERTIME_SYNC_API_KEY>
```

### cURL Example

```bash
curl -X POST "https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblwZg0EuVlmz0I01" \
  -H "Authorization: Bearer your-sync-api-key" \
  -H "Content-Type: application/json" \
  -d '{}'
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
| `Address` | Full address | Single line text |
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

### Symptoms & Sexual Health

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Symptoms` | Current symptoms | Single line text |
| `How long have you notice` | Symptom duration | Single line text |
| `How often do these sexual issues occur?` | Symptom frequency | Single line text |
| `goals` | Treatment goals | Single line text |

### Physical Activity & Lifestyle

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Physical Active` | Physical activity level | Single line text |
| `Smoke/Nicotine` | Smoking/nicotine use | Single line text |
| `Drinking` | Alcohol consumption | Single line text |

### Cardiovascular Health (Critical for ED Medications)

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Heart condition` | Heart condition history | Single line text |
| `Chest Pains` | Chest pain history | Single line text |
| `meds with nitrates or nitroglycerin` | Nitrate medication use (CONTRAINDICATION) | Single line text |

### Chronic Conditions

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Chronic Disease` | Has chronic disease | Single line text |
| `Chronic Illnesses` | Chronic illness details | Single line text |
| `Specific Conditions` | Specific medical conditions | Single line text |
| `Cancer` | Cancer history | Single line text |

### Medications & Allergies

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Medications` | Current medications | Single line text |
| `List of Medications` | Detailed medication list | Single line text |
| `Allergies` | Has allergies | Single line text |
| `Which allergies` | Allergy details | Single line text |

### Lab Work

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `Labwork` | Recent lab work status | Single line text |

### Referral & Marketing

| Airtable Field | Description | Type |
|----------------|-------------|------|
| `How did you hear about us?` | Marketing attribution | Single line text |
| `Who reccomended OT Mens Health to you?` | Referrer (note typo in Airtable) | Single line text |
| `Referrer` | Referrer URL | Single line text |

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
| `URL with parameters` | Full URL with tracking | Single line text |
| `IntakeQ Client ID` | IntakeQ integration ID | Number |
| `IntakeQ Status` | IntakeQ sync status | Single line text |

---

## Sample Payload

```json
{
  "Response ID": "rec123abc",
  "First name": "John",
  "Last name": "Doe",
  "email": "john.doe@example.com",
  "phone number": "+1 (555) 123-4567",
  "DOB": "01/15/1975",
  "Gender": "Male",
  "State": "Florida",

  "Address [Street]": "123 Main St",
  "Address [City]": "Miami",
  "Address [State]": "FL",
  "Address [Zip]": "33101",

  "Symptoms": "Difficulty maintaining erection",
  "How long have you notice": "6 months",
  "How often do these sexual issues occur?": "Frequently",
  "goals": "Improve sexual performance",

  "Physical Active": "Moderate",
  "Smoke/Nicotine": "Never",

  "Heart condition": "No",
  "Chest Pains": "No",
  "meds with nitrates or nitroglycerin": "No",

  "Chronic Disease": "No",
  "Medications": "None",

  "18+ Consent": true,
  "Consent Forms": true,

  "treatmentType": "better_sex"
}
```

---

## Contraindication Alert

**CRITICAL**: Patients using nitrate medications (nitroglycerin, isosorbide, etc.) CANNOT use PDE5 inhibitors (Viagra, Cialis, etc.) due to dangerous hypotension risk.

The field `meds with nitrates or nitroglycerin` must be checked before prescribing any ED medication.

---

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "eonproPatientId": "000123",
  "eonproDatabaseId": 456,

  "treatment": {
    "type": "better_sex",
    "label": "Better Sex"
  },

  "patient": {
    "id": 456,
    "patientId": "000123",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "isNew": true
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

## Treatment Detection

The webhook automatically detects the treatment type as `better_sex` if any of these fields are present:
- `How often do these sexual issues occur?`
- `How long have you notice`
- `meds with nitrates or nitroglycerin`
- `Chest Pains`
- `Heart condition`
- `Physical Active`
- `Smoke/Nicotine`

Or explicitly set `treatmentType: "better_sex"` in the payload.

---

## Two Tables to Sync

| Treatment | Table ID | Sync Endpoint |
|-----------|----------|---------------|
| **Weight Loss** | `tblnznnhTgy5Li66k` | `POST /api/integrations/overtime/sync/tblnznnhTgy5Li66k` |
| **Better Sex** | `tblwZg0EuVlmz0I01` | `POST /api/integrations/overtime/sync/tblwZg0EuVlmz0I01` |

### Sync Both Tables

```bash
# Sync Weight Loss
curl -X POST "https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblnznnhTgy5Li66k" \
  -H "Authorization: Bearer your-sync-api-key" \
  -H "Content-Type: application/json" \
  -d '{}'

# Sync Better Sex
curl -X POST "https://eonpro-kappa.vercel.app/api/integrations/overtime/sync/tblwZg0EuVlmz0I01" \
  -H "Authorization: Bearer your-sync-api-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or sync all tables at once:

```bash
curl -X POST "https://eonpro-kappa.vercel.app/api/integrations/overtime/sync" \
  -H "Authorization: Bearer your-sync-api-key" \
  -H "Content-Type: application/json" \
  -d '{"treatmentTypes": ["weight_loss", "better_sex"]}'
```
