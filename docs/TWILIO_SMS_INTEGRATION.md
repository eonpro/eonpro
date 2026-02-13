# 📱 Twilio SMS Integration

## Overview

Complete SMS notification system for patient communication, appointment reminders, and two-way
messaging.

## ✅ Features

### 1. SMS Notifications

- **Appointment Reminders**: Automated reminders with confirmation options
- **Prescription Notifications**: Alert patients when prescriptions are ready
- **Lab Results**: Notify patients when results are available
- **Payment Reminders**: Send billing notifications
- **Custom Messages**: Send personalized messages to patients

### 2. Two-Way Messaging

- Patients can respond to messages
- Keyword recognition (CONFIRM, CANCEL, RESCHEDULE, HELP)
- Automated responses based on keywords
- Message logging and tracking

### 3. Components

- **SMS Composer**: Full-featured UI for sending messages
- **Phone Number Formatting**: Automatic E.164 formatting
- **Message Templates**: Pre-built templates for common scenarios
- **Character Counter**: SMS length tracking (160 char limit)
- **Delivery Status**: Real-time message status tracking

## 🚀 Setup Guide

### 1. Get Twilio Credentials

1. Sign up for [Twilio](https://www.twilio.com)
2. Get your credentials from the Twilio Console:
   - Account SID
   - Auth Token
   - Phone Number

### 2. Configure Environment Variables

Add to your `.env.local`:

```env
# Enable Twilio SMS
NEXT_PUBLIC_ENABLE_TWILIO_SMS=true

# Twilio Credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# Optional: Additional Services
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Configure Webhook

In Twilio Console:

1. Go to Phone Numbers → Manage → Active Numbers
2. Click on your phone number
3. In the Messaging section, set webhook URL:
   ```
   https://yourdomain.com/api/v2/twilio/webhook
   ```
4. Set HTTP method to `POST`

## 📖 Usage

### Send SMS via API

```javascript
// Send a simple SMS
const response = await fetch('/api/v2/twilio/send-sms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '+1234567890',
    message: 'Your appointment is confirmed for tomorrow at 2 PM',
  }),
});
```

### Use SMS Composer Component

```tsx
import SMSComposer from '@/components/twilio/SMSComposer';

export default function PatientPage() {
  return (
    <SMSComposer
      patientPhone="(555) 123-4567"
      patientName="John Doe"
      patientId={123}
      onSuccess={(messageId) => console.log('Sent:', messageId)}
      onError={(error) => console.error('Failed:', error)}
    />
  );
}
```

### Send Appointment Reminder

```javascript
import { sendAppointmentReminder } from '@/lib/integrations/twilio/smsService';

// Send reminder
const result = await sendAppointmentReminder(patientId, appointmentDate, 'Dr. Smith');

if (result.success) {
  console.log('Reminder sent:', result.messageId);
}
```

## 🔧 API Endpoints

### POST `/api/v2/twilio/send-sms`

Send an SMS message

**Request Body:**

```json
{
  "to": "+1234567890",
  "message": "Your message here",
  "patientId": 123 // optional
}
```

**Response:**

```json
{
  "success": true,
  "messageId": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "details": {
    "status": "queued",
    "dateCreated": "2024-11-24T12:00:00Z"
  }
}
```

### POST `/api/v2/twilio/webhook`

Webhook endpoint for incoming SMS (configured in Twilio)

## 📊 Message Templates

### Available Templates

1. **Appointment Reminder**

   ```
   Hi {name}, this is a reminder of your appointment with
   Dr. {doctor} on {date}. Reply CONFIRM to confirm or CANCEL to cancel.
   ```

2. **Prescription Ready**

   ```
   Hi {name}, your prescription #{id} is ready for pickup.
   Please visit us at your earliest convenience.
   ```

3. **Lab Results**

   ```
   Hi {name}, your lab results are now available.
   Please log in to your patient portal to view them.
   ```

4. **Payment Reminder**
   ```
   Hi {name}, this is a reminder that your payment of ${amount}
   is due on {date}. Please log in to pay.
   ```

## 🔑 Keyword Responses

Patients can reply with keywords:

| Keyword    | Action              | Response                                          |
| ---------- | ------------------- | ------------------------------------------------- |
| CONFIRM    | Confirm appointment | "Thank you for confirming your appointment!"      |
| CANCEL     | Cancel appointment  | "Your appointment has been cancelled."            |
| RESCHEDULE | Request reschedule  | "Please call us at (555) 123-4567 to reschedule." |
| HELP       | Get help            | "Reply CONFIRM to confirm, CANCEL to cancel..."   |
| STOP       | Opt out             | Standard Twilio opt-out                           |

## 🧪 Testing

### Test Phone Numbers

For testing without sending real SMS:

- Use Twilio test credentials
- Use Twilio test phone numbers: `+15005550006`

### Local Testing with ngrok

```bash
# Install ngrok
brew install ngrok

# Expose local webhook
ngrok http 5000

# Use the ngrok URL for Twilio webhook
https://abc123.ngrok.io/api/v2/twilio/webhook
```

## 🔒 Security & Compliance

### HIPAA Compliance

⚠️ **Important**: When sending PHI via SMS:

1. **Obtain Patient Consent**: Get written consent for SMS communication
2. **Limit PHI**: Avoid sending detailed medical information
3. **Use Generic Messages**: "Your results are ready" vs specific results
4. **Audit Trail**: All messages are logged for compliance

### Best Practices

1. **Never send**:
   - Social Security Numbers
   - Detailed diagnoses
   - Medication details
   - Test results values

2. **Always**:
   - Use appointment IDs instead of details
   - Direct patients to secure portal
   - Include opt-out instructions
   - Validate phone numbers

## 📈 Monitoring

### Key Metrics

- Delivery rate
- Response rate
- Opt-out rate
- Failed messages

### Message Status Codes

| Status      | Description                 |
| ----------- | --------------------------- |
| queued      | Message queued for delivery |
| sent        | Message sent to carrier     |
| delivered   | Message delivered to device |
| failed      | Message failed to deliver   |
| undelivered | Message not delivered       |

## 🚧 Roadmap

- [ ] Bulk SMS campaigns
- [ ] SMS templates management UI
- [ ] Automated appointment reminders (cron jobs)
- [ ] SMS analytics dashboard
- [ ] Multi-language support
- [ ] MMS (picture messaging) support
- [ ] SMS conversation history
- [ ] Smart scheduling (avoid quiet hours)

## 🆘 Troubleshooting

### Message not sending?

1. Check Twilio credentials in `.env.local`
2. Verify phone number format (must be E.164)
3. Check Twilio account balance
4. Verify feature flag is enabled

### Webhook not working?

1. Ensure webhook URL is publicly accessible
2. Check Twilio signature validation
3. Verify HTTP method is POST
4. Check server logs for errors

### Phone number formatting issues?

- US numbers: (555) 123-4567 → +15551234567
- International: Include country code

## 📚 Resources

- [Twilio Documentation](https://www.twilio.com/docs/sms)
- [HIPAA Compliance Guide](https://www.twilio.com/docs/sms/hipaa-compliance)
- [Best Practices](https://www.twilio.com/docs/sms/best-practices)
- [Status Callbacks](https://www.twilio.com/docs/sms/api/message-resource#message-status-values)

---

_Integration Date: November 24, 2024_ _Version: 1.0.0_
