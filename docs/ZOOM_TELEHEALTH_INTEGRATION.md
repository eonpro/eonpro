# Zoom Telehealth Integration Guide

## 🎯 Overview

The Zoom Telehealth integration provides secure, HIPAA-compliant video consultations between
healthcare providers and patients. This integration leverages Zoom's healthcare-specific features
for virtual medical appointments.

## ✨ Features

### Core Functionality

- **HD Video Consultations**: High-quality video calls with stable connections
- **Waiting Room**: Patients wait in virtual lobby until provider admits them
- **Screen Sharing**: Share medical images, test results, or educational materials
- **Recording**: Record consultations for documentation (with consent)
- **Calendar Integration**: Sync with provider calendars
- **Automated Reminders**: Send meeting links via SMS/email
- **Multi-participant**: Support for interpreters or family members

### Healthcare-Specific Features

- **HIPAA Compliance**: End-to-end encryption for PHI protection
- **Virtual Backgrounds**: Professional backgrounds for providers
- **Breakout Rooms**: Private discussions during group sessions
- **Cloud Recording**: Secure storage with encryption
- **Attendance Tracking**: Automatic logging of consultation duration
- **Prescription Sharing**: Share prescriptions during consultation
- **Document Signing**: E-consent and documentation

## 🚀 Setup Guide

### 1. Zoom Account Setup

1. **Create Zoom Healthcare Account**

   ```
   1. Go to https://zoom.us/healthcare
   2. Sign up for a Healthcare plan (required for HIPAA compliance)
   3. Sign the Business Associate Agreement (BAA)
   ```

2. **Enable HIPAA Settings**

   ```
   Admin Dashboard > Advanced > HIPAA Compliance
   - Enable all HIPAA requirements
   - Configure data retention policies
   - Set up audit logging
   ```

3. **Create OAuth App**
   ```
   App Marketplace > Develop > Build App
   - Choose "OAuth" app type
   - Set redirect URL: https://your-domain.com/api/zoom/callback
   - Add required scopes:
     - meeting:write
     - meeting:read
     - user:read
     - recording:read
     - recording:write
   ```

### 2. Environment Configuration

Add to your `.env.local`:

```env
# Zoom Telehealth Configuration
NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH=true
ZOOM_CLIENT_ID=your_client_id_here
ZOOM_CLIENT_SECRET=your_client_secret_here
ZOOM_ACCOUNT_ID=your_account_id_here
ZOOM_SDK_KEY=your_sdk_key_here
ZOOM_SDK_SECRET=your_sdk_secret_here
ZOOM_VERIFICATION_TOKEN=your_verification_token_here
ZOOM_WEBHOOK_SECRET=your_webhook_secret_here

# Waiting Room Feature
NEXT_PUBLIC_ENABLE_ZOOM_WAITING_ROOM=true

# Development/Testing
ZOOM_USE_MOCK=false  # Set to true for mock mode
```

### 3. Webhook Configuration

Configure webhooks in Zoom App Marketplace:

```
Webhook URL: https://your-domain.com/api/v2/zoom/webhook

Events to subscribe:
- meeting.started
- meeting.ended
- meeting.participant_joined
- meeting.participant_left
- recording.completed
- meeting.participant_waiting (for waiting room)
```

### 4. Database Schema

The integration uses your existing patient/provider tables plus:

```prisma
model TelehealthSession {
  id           Int      @id @default(autoincrement())
  meetingId    String   @unique
  meetingUrl   String
  providerUrl  String
  patientId    Int
  providerId   Int
  scheduledAt  DateTime
  startedAt    DateTime?
  endedAt      DateTime?
  duration     Int      // in minutes
  status       String   // scheduled, in_progress, completed, cancelled
  recordingUrl String?
  metadata     Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  patient      Patient  @relation(fields: [patientId], references: [id])
  provider     Provider @relation(fields: [providerId], references: [id])
}
```

## 💻 Usage

### For Healthcare Providers

#### Schedule a Consultation

1. Navigate to **Telehealth Center** from Admin Console
2. Click **Schedule Consultation**
3. Select patient and appointment details
4. System generates meeting link automatically
5. Patient receives link via SMS/email

#### Start a Consultation

1. Go to **Telehealth Center**
2. Find the scheduled meeting
3. Click **Start Meeting**
4. Admit patient from waiting room
5. Conduct consultation with all tools available

#### During Consultation

- **Screen Share**: Share medical images or test results
- **Recording**: Start recording (with patient consent)
- **Chat**: Send links or notes during call
- **Breakout Rooms**: Private discussions if needed

### For Patients

#### Join Consultation

1. Click the meeting link received via SMS/email
2. Enter name (if not pre-filled)
3. Wait in virtual waiting room
4. Provider admits you to consultation
5. Enable camera and microphone when prompted

### For Developers

#### Create Meeting Programmatically

```typescript
import { createZoomMeeting } from '@/lib/integrations/zoom/meetingService';

const meeting = await createZoomMeeting({
  topic: 'Follow-up Consultation',
  duration: 30, // minutes
  patientId: 123,
  providerId: 456,
  scheduledAt: new Date('2024-01-15T10:00:00Z'),
  settings: {
    waitingRoom: true,
    autoRecording: 'cloud',
  },
});

console.log('Meeting URL:', meeting.joinUrl);
```

#### Embed Meeting in App

```tsx
import MeetingRoom from '@/components/zoom/MeetingRoom';

<MeetingRoom
  meetingId="123456789"
  meetingPassword="ABC123"
  userName="Dr. Smith"
  role="host"
  onMeetingEnd={() => console.log('Meeting ended')}
/>;
```

## 🧪 Testing

### Mock Mode

Enable mock mode for development:

```env
ZOOM_USE_MOCK=true
```

### Test Scenarios

1. **Schedule Meeting**

   ```bash
   curl -X POST http://localhost:3000/api/v2/zoom/meetings \
     -H "Content-Type: application/json" \
     -d '{
       "topic": "Test Consultation",
       "duration": 30,
       "patientId": 1
     }'
   ```

2. **Join as Patient**
   - Use meeting link from response
   - Test waiting room functionality
   - Verify video/audio quality

3. **Test Features**
   - Screen sharing
   - Recording start/stop
   - Chat functionality
   - Participant management

### Load Testing

Test with multiple participants:

```javascript
// Simulate 10 patients joining
for (let i = 0; i < 10; i++) {
  await joinMeeting({
    meetingId: '123456789',
    userName: `Patient ${i}`,
    role: 'participant',
  });
}
```

## 🔒 Security & HIPAA Compliance

### Encryption

- **End-to-End Encryption**: Available for maximum security
- **AES 256-bit GCM Encryption**: For all meetings
- **Encrypted Cloud Recording**: Recordings encrypted at rest

### Access Control

- **Meeting Passwords**: Auto-generated unique passwords
- **Waiting Room**: Screen patients before admission
- **Locked Meetings**: Prevent unauthorized joins
- **Host Controls**: Mute/remove participants

### Compliance Features

```typescript
// Ensure HIPAA compliance
const meetingSettings = {
  waitingRoom: true, // Required
  requirePassword: true, // Required
  muteUponEntry: true, // Recommended
  autoRecording: 'cloud', // With consent
  authenticationRequired: true, // For known patients
  encryptionType: 'enhanced', // E2EE available
};
```

### Audit Trail

All actions are logged:

- Meeting creation/deletion
- Participant join/leave times
- Recording start/stop
- Screen sharing events

## 📊 Monitoring & Analytics

### Key Metrics

- Average consultation duration
- No-show rate
- Technical issues rate
- Patient satisfaction scores
- Provider utilization

### Dashboard Metrics

```sql
-- Daily consultation stats
SELECT
  DATE(scheduledAt) as date,
  COUNT(*) as total_meetings,
  AVG(duration) as avg_duration,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
FROM TelehealthSession
GROUP BY DATE(scheduledAt);
```

### Quality Monitoring

- Video quality metrics
- Audio quality scores
- Connection stability
- User feedback ratings

## 🚦 Troubleshooting

### Common Issues

1. **"Cannot connect to meeting"**

   ```
   - Check internet connection (minimum 1.5 Mbps)
   - Verify browser compatibility
   - Clear browser cache
   - Try incognito mode
   ```

2. **"Waiting room not working"**

   ```
   - Ensure waiting room is enabled in settings
   - Check host has joined meeting
   - Verify participant link is correct
   ```

3. **"Recording not available"**

   ```
   - Confirm cloud recording is enabled
   - Check storage quota
   - Verify recording permissions
   ```

4. **"Poor video quality"**
   ```
   - Check bandwidth (3+ Mbps recommended)
   - Close other applications
   - Use wired connection if possible
   - Lower video resolution if needed
   ```

## 🎯 Best Practices

### For Providers

1. Join meetings 5 minutes early
2. Test equipment before first patient
3. Have backup communication method
4. Use virtual backgrounds professionally
5. Record with explicit consent only

### For System Admins

1. Regular testing of integration
2. Monitor Zoom API limits
3. Backup recording storage
4. Update SDK versions quarterly
5. Review security settings monthly

### For Developers

1. Implement retry logic for API calls
2. Handle meeting capacity limits
3. Cache meeting details appropriately
4. Implement graceful degradation
5. Log all critical events

## 📈 Roadmap

### Phase 1 (Current)

- ✅ Basic video consultations
- ✅ Waiting room
- ✅ Screen sharing
- ✅ Cloud recording
- ✅ Meeting scheduling

### Phase 2 (Next)

- [ ] Calendar sync (Google, Outlook)
- [ ] Automated transcription
- [ ] AI meeting summaries
- [ ] Virtual assistant integration
- [ ] Multi-language support

### Phase 3 (Future)

- [ ] VR consultations
- [ ] IoT device integration
- [ ] Real-time vitals monitoring
- [ ] AR examination tools
- [ ] AI diagnosis assistance

## 🆘 Support

### Resources

- **Zoom Healthcare**: https://zoom.us/healthcare
- **API Documentation**: https://marketplace.zoom.us/docs/api-reference
- **SDK Documentation**: https://marketplace.zoom.us/docs/sdk/native-sdks/web
- **Status Page**: https://status.zoom.us/

### Getting Help

1. Check this documentation
2. Review Zoom's healthcare guides
3. Contact Zoom support (for account issues)
4. Create internal support ticket

## 📝 License & Compliance

- Requires Zoom Healthcare plan with signed BAA
- Must maintain HIPAA compliance settings
- Regular security audits required
- Patient consent required for recording
- Data retention per healthcare regulations
