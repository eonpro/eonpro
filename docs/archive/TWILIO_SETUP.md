# Twilio Integration Setup Guide

## Overview

The platform includes Twilio integration for real-time SMS messaging with patients directly from
their profile.

## Features

- **Patient Chat Tab**: Real-time messaging interface in each patient's profile
- **SMS Integration**: Send and receive messages via Twilio SMS
- **Message History**: View all previous conversations with patients
- **Intake Form Distribution**: Send intake form links via SMS
- **Automatic Notifications**: Patients receive SMS notifications for appointments, forms, etc.

## Setup Requirements

### 1. Twilio Account

1. Sign up for a Twilio account at https://www.twilio.com
2. Verify your phone number for testing
3. Upgrade to a paid account for production use

### 2. Get Your Credentials

From the Twilio Console (https://console.twilio.com), obtain:

- **Account SID**: Found on the dashboard
- **Auth Token**: Found on the dashboard
- **Phone Number**: Purchase a phone number with SMS capabilities

### 3. Optional: For Advanced Features

- **API Key & Secret**: For generating access tokens (Settings > API Keys)
- **Chat Service SID**: For real-time chat (if using Twilio Conversations)

## Environment Variables

Add these to your `.env.local` or `.env.production` file:

```env
# Required for basic SMS functionality
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  # Your Twilio phone number

# Optional for advanced features
TWILIO_API_KEY=your_api_key_here
TWILIO_API_SECRET=your_api_secret_here
TWILIO_CHAT_SERVICE_SID=your_chat_service_sid_here
```

## Testing the Integration

### 1. Demo Mode (No Twilio Account Needed)

If Twilio environment variables are not configured, the system operates in demo mode:

- Chat interface shows demo messages
- Send functionality returns success without actually sending SMS
- Perfect for development and testing

### 2. Live Testing

With Twilio configured:

1. Navigate to any patient's profile
2. Click on the "Chat" tab
3. Send a test message
4. The patient will receive an SMS at their registered phone number

## Usage Guide

### Sending Intake Forms via SMS

1. Go to patient profile
2. Click "Intake" tab
3. Click "Send New Intake Form"
4. Select form template
5. Choose "SMS Only" or "Email & SMS"
6. Click "Send Form"

### Patient Chat

1. Go to patient profile
2. Click "Chat" tab
3. Type message and press Enter or click Send
4. Messages appear in real-time
5. Patient receives SMS and can reply directly

## Message Status Indicators

- ✓ Single check: Message sent
- ✓✓ Double check: Message delivered
- ⚠️ Warning icon: Message failed

## Troubleshooting

### Common Issues

1. **"No Phone Number Available"**
   - Ensure patient has a phone number in their profile
   - Phone number should be in format: (555) 555-5555 or 5555555555

2. **Messages Not Sending**
   - Check Twilio credentials in environment variables
   - Verify Twilio account has SMS credits
   - Ensure phone number has SMS capabilities

3. **"Failed to connect to messaging service"**
   - Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct
   - Check internet connection
   - Ensure Twilio account is active

## Best Practices

1. **Patient Consent**: Always obtain patient consent before sending SMS messages
2. **HIPAA Compliance**: Ensure messages don't contain sensitive PHI unless encrypted
3. **Opt-Out**: Include opt-out instructions in initial messages
4. **Message Limits**: Be aware of carrier limits and Twilio rate limits
5. **Time Zones**: Consider patient time zones when sending messages

## Cost Considerations

- **SMS Messages**: ~$0.0079 per message (US)
- **Phone Number**: ~$1.15/month (US local number)
- **Volume Discounts**: Available for high-volume usage
- Check current pricing at https://www.twilio.com/pricing

## Security Notes

1. **Never commit** Twilio credentials to version control
2. **Use environment variables** for all sensitive data
3. **Enable 2FA** on your Twilio account
4. **Restrict API keys** to minimum required permissions
5. **Monitor usage** through Twilio Console for unusual activity

## Support

For Twilio-specific issues:

- Documentation: https://www.twilio.com/docs
- Support: https://support.twilio.com
- Status: https://status.twilio.com

For platform integration issues:

- Check application logs for error messages
- Verify environment variables are set correctly
- Test in demo mode first before using live credentials
