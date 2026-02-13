# Healthie Feature Parity - Implementation Summary

## Overview

This document summarizes the features implemented to bring EONPRO closer to feature parity with
[Healthie](https://www.gethealthie.com/intake-onboarding).

---

## ✅ Features Implemented

### 1. Advanced Scheduling System

**Location:** `src/lib/scheduling/`

**Features:**

- Provider availability management (by day of week)
- Time slot generation with conflict detection
- Appointment creation, updates, cancellation
- Rescheduling with history tracking
- Check-in, start, complete appointment workflows
- No-show tracking
- Buffer time between appointments
- Time-off management

**API Endpoints:**

- `GET/POST/PATCH/DELETE /api/scheduling/appointments`
- `GET/POST/PUT/DELETE /api/scheduling/availability`

**Database Models:**

- `Appointment`
- `AppointmentTypeConfig`
- `ProviderAvailability`
- `ProviderTimeOff`

---

### 2. Automated Appointment Reminders

**Location:** `src/lib/scheduling/appointment-reminder.service.ts`

**Features:**

- Automated SMS reminders via Twilio (24 hours & 2 hours before)
- Email reminder support (ready for SendGrid/SES integration)
- Configurable reminder timing
- Reminder status tracking (pending, sent, failed, cancelled)
- Cron job for processing pending reminders
- Confirmation SMS when appointment is confirmed

**API Endpoints:**

- `POST /api/scheduling/reminders/process` (cron job)
- `GET /api/scheduling/reminders/process` (stats)

**Vercel Cron Configuration:**

```json
{
  "crons": [
    {
      "path": "/api/scheduling/reminders/process",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Environment Variables:**

- `CRON_SECRET` - Authorization secret for cron endpoint

---

### 3. Superbill Generation

**Location:** `src/lib/billing/superbill.service.ts`

**Features:**

- Create superbills with CPT and ICD-10 codes
- PDF generation with full patient/provider information
- Pre-loaded common CPT codes for telehealth and weight loss
- Pre-loaded common ICD-10 codes for obesity/weight management
- Mark superbills as finalized, sent, or paid
- Record payments against superbills
- Billing code lookup and management

**API Endpoints:**

- `GET/POST/PATCH /api/billing/superbills`
- `GET?format=pdf /api/billing/superbills` (download PDF)
- `GET/POST/DELETE /api/billing/codes`

**Database Models:**

- `Superbill`
- `SuperbillItem`
- `BillingCode`

**Pre-loaded CPT Codes:**

- E&M codes (99201-99215)
- Telephone E/M (99441-99443)
- Preventive counseling (99401-99404)
- Obesity counseling (G0447)
- Medical nutrition therapy (97802-97804)

**Pre-loaded ICD-10 Codes:**

- Obesity codes (E66.xx)
- BMI codes (Z68.xx)
- Dietary counseling (Z71.3)

---

### 4. Care Plans System

**Location:** `src/lib/care-plans/care-plan.service.ts`

**Features:**

- Create care plans from templates or custom
- Goal tracking with progress monitoring
- Activity tracking with instructions
- Progress recording (patient and provider)
- Care plan activation and completion workflows
- Goal completion triggers care plan completion
- Care plan templates for common programs

**Pre-built Templates:**

1. **Weight Loss Program** (90 days)
   - Goals: Target weight, diet quality, physical activity, medication compliance
   - Activities: Daily weigh-in, medication, food logging, exercise, hydration

2. **Hormone Therapy Program** (180 days)
   - Goals: Hormone optimization, symptom improvement, safety labs
   - Activities: Medication, symptom journal, lab work

**API Endpoints:**

- `GET/POST/PATCH /api/care-plans`
- `GET/POST/PATCH /api/care-plans/progress`

**Database Models:**

- `CarePlan`
- `CarePlanTemplate`
- `CarePlanGoal`
- `CarePlanActivity`
- `CarePlanProgress`

---

### 5. Form Conditional Logic

**Location:** `src/lib/intake-forms/conditional-logic.ts`

**Features:**

- Show/hide questions based on answers to other questions
- Multiple condition operators:
  - `equals`, `not_equals`
  - `contains`, `not_contains`
  - `greater_than`, `less_than`
  - `is_empty`, `is_not_empty`
  - `in`, `not_in`
- AND/OR logic for combining rules
- Show or hide action
- Fluent builder API for creating conditions
- Validation only for visible questions

**Usage Example:**

```typescript
import { conditionalLogic } from '@/lib/intake-forms/conditional-logic';

// Show question only if gender is Female
const showForFemale = conditionalLogic()
  .when(1) // Question ID 1 (Gender)
  .equals('Female')
  .build();

// Store in question's conditionalLogic field
{
  questionText: "Are you currently pregnant?",
  conditionalLogic: showForFemale
}
```

**ConditionalLogic Schema:**

```typescript
{
  rules: [
    {
      questionId: number,
      operator: 'equals' | 'not_equals' | 'contains' | ...,
      value: string | string[] | number
    }
  ],
  logic: 'AND' | 'OR',
  action: 'show' | 'hide'
}
```

---

### 6. Patient Portal Enhancements

**Location:** `src/app/api/patient-portal/`

#### Document Upload

- Patients can upload documents to their profile
- Document categorization (medical records, lab results, insurance, etc.)
- Size limit: 10MB per file
- Secure access (patients can only access their own documents)
- Delete functionality for patient-uploaded documents only

**API Endpoints:**

- `GET/POST/DELETE /api/patient-portal/documents`

#### Self-Scheduling

- View available providers
- View available time slots
- Book appointments
- View upcoming and past appointments
- Reschedule appointments
- Cancel appointments (24-hour policy)

**API Endpoints:**

- `GET /api/patient-portal/appointments?action=available-slots`
- `GET /api/patient-portal/appointments?action=appointment-types`
- `GET /api/patient-portal/appointments?action=providers`
- `GET /api/patient-portal/appointments?upcoming=true`
- `POST/PATCH/DELETE /api/patient-portal/appointments`

---

## Database Schema Updates

New models added to Prisma schema:

```prisma
// Scheduling
AppointmentTypeConfig
ProviderAvailability
ProviderTimeOff
Appointment
AppointmentReminder

// Billing
Superbill
SuperbillItem
BillingCode

// Care Plans
CarePlan
CarePlanTemplate
CarePlanGoal
CarePlanActivity
CarePlanProgress
```

New enums:

```prisma
AppointmentStatus
AppointmentModeType
ReminderType
ReminderStatus
CarePlanStatus
GoalStatus
```

---

## Dependencies Added

```json
{
  "pdfkit": "^0.14.0",
  "@types/pdfkit": "^0.13.x"
}
```

---

## Environment Variables

| Variable              | Description                             |
| --------------------- | --------------------------------------- |
| `CRON_SECRET`         | Authorization secret for cron endpoints |
| `TWILIO_ACCOUNT_SID`  | Twilio account SID for SMS              |
| `TWILIO_AUTH_TOKEN`   | Twilio auth token                       |
| `TWILIO_PHONE_NUMBER` | Twilio phone number for sending SMS     |

---

### 7. AI Scribe (Becca AI Extension)

**Location:** `src/lib/ai-scribe/`

**Features:**

- Real-time audio transcription using OpenAI Whisper
- Speaker diarization (provider vs patient)
- Automatic SOAP note generation from transcripts
- Red flag detection for urgent concerns
- Medication change extraction
- Telehealth session integration (Zoom support)

**API Endpoints:**

- `POST /api/ai-scribe/transcribe` - Transcribe audio or manage sessions
- `POST /api/ai-scribe/generate-soap` - Generate SOAP from transcript

**Components:**

- `BeccaAIScribe.tsx` - Main scribe interface with live transcription
- `BeccaAIScribeButton.tsx` - Launch button for telehealth appointments

**Services:**

- `transcription.service.ts` - Whisper integration and session management
- `soap-from-transcript.service.ts` - GPT-4 SOAP generation
- `telehealth-integration.ts` - Zoom webhook handling

### 8. Calendar Sync (Google & Outlook)

**Location:** `src/lib/calendar-sync/`

**Features:**

- Google Calendar OAuth2 integration
- Microsoft Outlook Calendar integration
- Two-way synchronization (appointments ↔ external calendar)
- Import external events as blocked time
- Automatic sync on appointment changes
- Provider settings UI for managing connections

**API Endpoints:**

- `GET /api/calendar-sync` - Get integration status, stats, or events
- `POST /api/calendar-sync` - Connect, sync, or import
- `PATCH /api/calendar-sync` - Update sync settings
- `DELETE /api/calendar-sync` - Disconnect calendar

**OAuth Callbacks:**

- `/api/calendar-sync/google/callback` - Google OAuth redirect
- `/api/calendar-sync/outlook/callback` - Microsoft OAuth redirect

**Components:**

- `CalendarIntegrations.tsx` - Provider settings UI

**Services:**

- `google-calendar.service.ts` - Google Calendar API
- `outlook-calendar.service.ts` - Microsoft Graph API
- `calendar-sync.service.ts` - Unified sync service

**Dependencies:**

- `googleapis` - Google Calendar API client
- `@azure/msal-node` - Microsoft Authentication Library
- `@microsoft/microsoft-graph-client` - Microsoft Graph API client

**Environment Variables Required:**

```
# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Microsoft/Outlook
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_REDIRECT_URI=
```

---

## Next Steps (Remaining Features)

To fully match Healthie's capabilities, consider implementing:

1. **Goals & Metrics** - Patient-facing goal dashboard
2. **Journaling** - Patient journaling with provider comments
3. **Programs/Courses** - Educational content delivery
4. **E-Fax** - Electronic fax integration
5. **Labs Integration** - Quest/LabCorp ordering
6. **Native Mobile App** - React Native implementation
7. **Advanced Reporting** - Business intelligence dashboard

---

## Testing

Run the services tests:

```bash
npm run test:unit -- src/lib/scheduling
npm run test:unit -- src/lib/billing
npm run test:unit -- src/lib/care-plans
```

---

_Last Updated: December 2024_
