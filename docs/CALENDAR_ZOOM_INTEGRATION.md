# Calendar Sync & Zoom Telehealth Integration

## 🎯 Overview

This document covers the comprehensive calendar synchronization and Zoom telehealth integration for the EON Health platform. These features enable providers to:

- Sync appointments with external calendars (Google, Outlook, Apple)
- Conduct HIPAA-compliant video consultations via Zoom
- Automatically create Zoom meetings for video appointments
- Subscribe to iCal feeds from any calendar app

---

## 📅 Calendar Integration

### Supported Calendar Providers

| Provider | Sync Type | Authentication | Features |
|----------|-----------|----------------|----------|
| **Google Calendar** | Two-way | OAuth 2.0 | Full sync, event CRUD, external events import |
| **Microsoft Outlook** | Two-way | OAuth 2.0 (MSAL) | Full sync, event CRUD, external events import |
| **Apple Calendar** | One-way (subscription) | iCal Feed | Subscription-based, auto-refresh |

### How It Works

#### Google Calendar Integration

1. **OAuth Flow**: Provider clicks "Connect" → redirected to Google → grants permission
2. **Token Storage**: Access/refresh tokens encrypted and stored in `ProviderCalendarIntegration`
3. **Sync Trigger**: Appointments sync on create/update/cancel
4. **External Events**: Can import external events as blocked time to prevent double-booking

**Files:**
- `src/lib/calendar-sync/google-calendar.service.ts`
- `src/app/api/calendar-sync/google/callback/route.ts`

#### Outlook Calendar Integration

1. **OAuth Flow**: Provider clicks "Connect" → redirected to Microsoft → grants permission
2. **Token Storage**: Uses MSAL for token management
3. **Sync Trigger**: Same as Google
4. **Graph API**: Uses Microsoft Graph API for calendar operations

**Files:**
- `src/lib/calendar-sync/outlook-calendar.service.ts`
- `src/app/api/calendar-sync/outlook/callback/route.ts`

#### Apple Calendar (iCal Subscription)

Apple Calendar doesn't provide a REST API, so we use iCal subscription feeds:

1. Provider creates a subscription via Settings → Calendar → iCal Feeds
2. System generates a unique, secure token
3. Provider adds the URL to Apple Calendar
4. Calendar refreshes automatically (every 30 minutes)

**Files:**
- `src/lib/calendar-sync/apple-calendar.service.ts`
- `src/lib/calendar-sync/ical.service.ts`
- `src/app/api/calendar/ical/[token]/route.ts`

### iCal Subscription URLs

Two URL formats are generated for each subscription:

```
HTTP URL:    https://app.eonpro.io/api/calendar/ical/{token}
WebCal URL:  webcal://app.eonpro.io/api/calendar/ical/{token}
```

- **HTTP URL**: Use for Google Calendar, Outlook web
- **WebCal URL**: Use for Apple Calendar (opens directly in Calendar app)

### Calendar Sync API

#### Get Calendar Integration Status

```bash
GET /api/calendar-sync?action=status
Authorization: Bearer <token>

Response:
{
  "integrations": [
    {
      "provider": "google",
      "isConnected": true,
      "syncEnabled": true,
      "lastSyncAt": "2026-01-31T10:30:00Z",
      "syncDirection": "both"
    },
    ...
  ]
}
```

#### Connect Calendar

```bash
POST /api/calendar-sync
{
  "action": "connect",
  "provider": "google" | "outlook" | "apple"
}

Response:
{
  "authUrl": "https://accounts.google.com/..." // For Google/Outlook
}
// OR for Apple:
{
  "setup": {
    "feedUrl": "https://...",
    "webcalUrl": "webcal://...",
    "qrCodeUrl": "...",
    "instructions": [...]
  }
}
```

#### Trigger Manual Sync

```bash
POST /api/calendar-sync
{
  "action": "sync"
}

Response:
{
  "result": {
    "totalCreated": 5,
    "totalUpdated": 2,
    "totalDeleted": 0,
    "allErrors": []
  }
}
```

#### Disconnect Calendar

```bash
DELETE /api/calendar-sync
{
  "provider": "google" | "outlook" | "apple"
}
```

### Calendar Subscription Management

#### List Subscriptions

```bash
GET /api/calendar/subscriptions
Authorization: Bearer <token>

Response:
{
  "subscriptions": [
    {
      "id": 1,
      "name": "Appointments",
      "token": "abc123...",
      "feedUrl": "https://app.eonpro.io/api/calendar/ical/abc123...",
      "webcalUrl": "webcal://app.eonpro.io/api/calendar/ical/abc123...",
      "isActive": true,
      "lastAccessedAt": "2026-01-31T10:30:00Z",
      "accessCount": 45
    }
  ]
}
```

#### Create Subscription

```bash
POST /api/calendar/subscriptions
{
  "name": "My Appointments",
  "includePatientNames": false,  // HIPAA: default to anonymized
  "includeMeetingLinks": true,
  "syncRangeDays": 90
}
```

#### Delete Subscription

```bash
DELETE /api/calendar/subscriptions?subscriptionId=1
```

### Single Appointment Export

Download an `.ics` file for any appointment:

```bash
GET /api/calendar/export/{appointmentId}
Authorization: Bearer <token>

Response: appointment-123.ics (file download)
```

---

## 🎥 Zoom Telehealth Integration

### Features

- **Automatic Meeting Creation**: VIDEO appointments auto-create Zoom meetings
- **Waiting Room**: Patients wait until provider admits them
- **Screen Sharing**: Share medical images and documents
- **Cloud Recording**: HIPAA-compliant recording (with patient consent)
- **Webhook Integration**: Real-time meeting status updates

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Appointment   │────▶│  Telehealth      │────▶│   Zoom API      │
│   Service       │     │  Service         │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │                         │
                              │                         ▼
                              │                  ┌─────────────────┐
                              │                  │  Zoom Webhook   │
                              │                  │  (events)       │
                              │                  └────────┬────────┘
                              │                           │
                              ▼                           ▼
                        ┌──────────────────────────────────────────┐
                        │         TelehealthSession Table          │
                        │  (meetingId, status, participants, etc.) │
                        └──────────────────────────────────────────┘
```

### Database Schema

#### TelehealthSession

```prisma
model TelehealthSession {
  id              Int       @id
  clinicId        Int?
  appointmentId   Int?
  patientId       Int
  providerId      Int
  
  // Meeting details
  meetingId       String    @unique
  meetingUuid     String?
  joinUrl         String    // Patient URL
  hostUrl         String?   // Provider URL
  password        String?
  topic           String?
  
  // Timing
  scheduledAt     DateTime
  startedAt       DateTime?
  endedAt         DateTime?
  duration        Int       // Scheduled (minutes)
  actualDuration  Int?      // Actual (minutes)
  
  // Status
  status          TelehealthSessionStatus
  platform        String    @default("zoom")
  
  // Recording
  recordingUrl      String?
  recordingPassword String?
  
  // Participant tracking
  hostJoinedAt          DateTime?
  patientJoinedAt       DateTime?
  waitingRoomEnteredAt  DateTime?
  waitingRoomAdmittedAt DateTime?
}

enum TelehealthSessionStatus {
  SCHEDULED
  WAITING
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
  TECHNICAL_ISSUES
}
```

### Zoom API Endpoints

#### Create Meeting (Internal)

```bash
POST /api/v2/zoom/meetings
{
  "topic": "Telehealth Consultation",
  "duration": 30,
  "patientId": 123,
  "providerId": 456,
  "scheduledAt": "2026-01-31T14:00:00Z"
}

Response:
{
  "meeting": {
    "id": 123456789,
    "joinUrl": "https://zoom.us/j/123456789?pwd=...",
    "startUrl": "https://zoom.us/s/123456789?zak=...",
    "password": "ABC123"
  },
  "session": {
    "id": 1,
    "status": "SCHEDULED"
  }
}
```

#### Get Meeting Details

```bash
GET /api/v2/zoom/meetings?meetingId=123456789
```

#### Cancel Meeting

```bash
DELETE /api/v2/zoom/meetings?meetingId=123456789
```

### Webhook Events

The webhook endpoint (`/api/v2/zoom/webhook`) handles:

| Event | Action |
|-------|--------|
| `meeting.started` | Update session status to `IN_PROGRESS`, record `startedAt` |
| `meeting.ended` | Update status to `COMPLETED`, calculate `actualDuration` |
| `meeting.participant_joined` | Create `TelehealthParticipant` record |
| `meeting.participant_left` | Update participant `leftAt` and `duration` |
| `meeting.participant_waiting` | Update `waitingRoomEnteredAt` |
| `recording.completed` | Store `recordingUrl` and metadata |

### Automatic Meeting Creation

When a VIDEO appointment is scheduled:

1. `createAppointment()` detects `type === VIDEO`
2. Calls `ensureZoomMeetingForAppointment(appointmentId)`
3. Creates Zoom meeting via API
4. Creates `TelehealthSession` record
5. Updates `Appointment` with `zoomMeetingId` and `zoomJoinUrl`
6. Triggers calendar sync (includes Zoom link in calendar event)

**Code path:**
```
createAppointment() → scheduling.service.ts
    ↓
ensureZoomMeetingForAppointment() → telehealthService.ts
    ↓
createZoomMeeting() → meetingService.ts
    ↓
Zoom API (POST /users/me/meetings)
```

### Automatic Meeting Cancellation

When a VIDEO appointment is cancelled:

1. `cancelAppointment()` detects existing Zoom meeting
2. Calls `cancelZoomMeetingForAppointment(appointmentId)`
3. Cancels Zoom meeting via API
4. Updates `TelehealthSession` status to `CANCELLED`

---

## 🔧 Configuration

### Per-Clinic Zoom Integration

Each clinic can connect their own Zoom account, similar to Stripe Connect and Lifefile integration.

**Benefits of per-clinic Zoom:**
- Meetings created under the clinic's Zoom organization
- Clinic maintains their own HIPAA BAA with Zoom
- Full control over recording storage and settings
- Branding and customization options

**Fallback behavior:** If a clinic doesn't configure their own Zoom, the platform-level Zoom account is used.

### Clinic Database Fields

```prisma
model Clinic {
  // Zoom Telehealth Integration (per-clinic OAuth)
  zoomAccountId          String?   // Zoom account ID
  zoomAccountEmail       String?   // Zoom account email
  zoomClientId           String?   // OAuth client ID (encrypted)
  zoomClientSecret       String?   // OAuth client secret (encrypted)
  zoomAccessToken        String?   // OAuth access token (encrypted)
  zoomRefreshToken       String?   // OAuth refresh token (encrypted)
  zoomTokenExpiresAt     DateTime? // When access token expires
  zoomWebhookSecret      String?   // Webhook verification secret
  zoomSdkKey             String?   // Web SDK key
  zoomSdkSecret          String?   // Web SDK secret (encrypted)
  zoomEnabled            Boolean   // Is Zoom integration enabled?
  zoomOnboardingComplete Boolean   // Has completed Zoom OAuth
  zoomConnectedAt        DateTime? // When they connected Zoom
  zoomWaitingRoomEnabled Boolean   // Enable waiting room
  zoomRecordingEnabled   Boolean   // Enable cloud recording
  zoomHipaaCompliant     Boolean   // Use HIPAA-compliant settings
}
```

### Admin API for Clinic Zoom

```bash
# Get Zoom status
GET /api/admin/integrations/zoom

# Connect Zoom account (Server-to-Server OAuth)
POST /api/admin/integrations/zoom
{
  "accountId": "your_zoom_account_id",
  "clientId": "your_client_id",
  "clientSecret": "your_client_secret",
  "sdkKey": "optional_sdk_key",
  "sdkSecret": "optional_sdk_secret",
  "webhookSecret": "optional_webhook_secret"
}

# Update settings
PATCH /api/admin/integrations/zoom
{
  "waitingRoomEnabled": true,
  "recordingEnabled": true,
  "hipaaCompliant": true
}

# Disconnect Zoom
DELETE /api/admin/integrations/zoom
```

### Environment Variables (Platform Default)

```bash
# Google Calendar
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft Outlook
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common  # or your tenant ID

# Zoom (Platform Default - used when clinic doesn't have own account)
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
ZOOM_ACCOUNT_ID=your_zoom_account_id
ZOOM_SDK_KEY=your_zoom_sdk_key
ZOOM_SDK_SECRET=your_zoom_sdk_secret
ZOOM_WEBHOOK_SECRET=your_webhook_secret
ZOOM_VERIFICATION_TOKEN=your_verification_token

# Feature Flags
NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH=true
NEXT_PUBLIC_ENABLE_ZOOM_WAITING_ROOM=true
```

### Zoom Webhook Setup

1. Go to Zoom App Marketplace → Your App → Feature
2. Add Event Subscriptions
3. Set Webhook URL: `https://yourdomain.com/api/v2/zoom/webhook`
4. Subscribe to events:
   - `meeting.started`
   - `meeting.ended`
   - `meeting.participant_joined`
   - `meeting.participant_left`
   - `meeting.participant_waiting`
   - `recording.completed`
5. Copy the Verification Token and Secret to environment variables

---

## 📱 UI Components

### CalendarIntegrationSettings

Full settings page for calendar and Zoom configuration.

```tsx
import CalendarIntegrationSettings from '@/components/CalendarIntegrationSettings';

<CalendarIntegrationSettings
  providerId={123}
  onUpdate={() => refetch()}
/>
```

### ProviderCalendarStatusCard

Dashboard widget showing calendar/Zoom status and upcoming sessions.

```tsx
import ProviderCalendarStatusCard from '@/components/ProviderCalendarStatusCard';

// Full version
<ProviderCalendarStatusCard providerId={123} />

// Compact sidebar version
<ProviderCalendarStatusCard providerId={123} compact />
```

---

## 🔐 Security & HIPAA Compliance

### PHI Protection

- **Calendar Events**: Patient names are optional in calendar sync (HIPAA compliant by default)
- **Zoom Meetings**: Topics don't include patient PII
- **Recording**: Requires explicit patient consent before recording
- **Encryption**: All Zoom meetings use enhanced encryption

### Access Control

- Calendar subscriptions require provider authentication
- Subscription tokens are random 64-character hex strings
- Tokens can be revoked at any time by deleting the subscription

### Audit Trail

- All telehealth sessions are logged with full participant tracking
- Recording access is logged
- Calendar sync operations are logged

---

## 📊 Monitoring

### Key Metrics

- Calendar sync success/failure rate
- Zoom meeting creation success rate
- Average session duration
- No-show rate
- Technical issues rate

### Health Checks

```bash
# Calendar sync status
GET /api/calendar-sync?action=status

# Zoom webhook status
GET /api/v2/zoom/webhook
```

---

## 🐛 Troubleshooting

### Calendar Sync Issues

**Problem**: Google Calendar not syncing
- Check OAuth token expiry
- Verify Google Calendar API is enabled in Google Cloud Console
- Check for errors in logs

**Problem**: iCal feed not updating
- Verify subscription is active
- Check that calendar app is refreshing (30-minute default)
- Manually refresh the calendar

### Zoom Issues

**Problem**: Meeting not created for VIDEO appointment
- Verify `NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH=true`
- Check Zoom credentials are valid
- Look for errors in appointment creation logs

**Problem**: Webhook events not received
- Verify webhook URL is correct in Zoom App settings
- Check `ZOOM_WEBHOOK_SECRET` matches Zoom App
- Test with Zoom's webhook validator

---

## 🔄 Migration Guide

### Existing Appointments

To add Zoom meetings to existing VIDEO appointments:

```bash
# Run migration script
npx ts-node scripts/migrate-existing-video-appointments.ts
```

### Calendar Sync

Providers need to manually connect their calendars via:
- Settings → Calendar Integration → Connect

---

## 📚 Related Documentation

- [Zoom Telehealth Integration](./ZOOM_TELEHEALTH_INTEGRATION.md) - Detailed Zoom setup
- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - All configuration options
- [HIPAA Compliance](./HIPAA_COMPLIANCE_EVIDENCE.md) - Security measures

---

## 🗓 Changelog

### v1.0.0 (Jan 31, 2026)
- Initial implementation
- Google, Outlook, Apple Calendar support
- Zoom auto-creation for VIDEO appointments
- Webhook integration for meeting lifecycle
- iCal subscription feeds
- UI components for settings and dashboard
