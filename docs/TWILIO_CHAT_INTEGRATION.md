# Twilio Chat Integration Guide

## 🎯 Overview

The Twilio Chat integration provides real-time messaging capabilities between patients and
healthcare providers using Twilio Conversations API. This enables secure, HIPAA-compliant instant
messaging within the platform.

## ✨ Features

### Core Functionality

- **Real-time Messaging**: Instant message delivery with WebSocket connections
- **Typing Indicators**: See when the other party is typing
- **Read Receipts**: Know when messages have been read
- **Online Presence**: See who's currently online
- **Message History**: Persistent conversation history
- **File Sharing**: Share images and documents securely
- **Group Chats**: Support for multi-participant conversations

### Healthcare-Specific Features

- **HIPAA Compliance**: Encrypted messaging for patient data protection
- **Provider Routing**: Automatic routing to available healthcare providers
- **Priority Messages**: Flag urgent patient messages
- **Quick Responses**: Pre-defined templates for common replies
- **Appointment Integration**: Schedule appointments directly from chat
- **Prescription Requests**: Handle prescription refill requests

## 🚀 Setup Guide

### 1. Twilio Account Setup

1. **Create Twilio Account**
   - Go to [Twilio Console](https://www.twilio.com/console)
   - Sign up for an account (or use existing)
   - Enable Twilio Conversations

2. **Create Conversations Service**

   ```bash
   # In Twilio Console, navigate to:
   Messaging > Services > Conversations
   # Click "Create New Service"
   # Name it "Lifefile Chat" or similar
   ```

3. **Generate API Credentials**
   ```bash
   # Navigate to:
   Account > API Keys & Tokens
   # Create new API Key
   # Save the SID and Secret
   ```

### 2. Environment Configuration

Add to your `.env.local`:

```env
# Twilio Chat Configuration
NEXT_PUBLIC_ENABLE_TWILIO_CHAT=true
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret_here
TWILIO_CHAT_SERVICE_SID=ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PUSH_CREDENTIAL_SID=CRxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Optional: for push notifications

# Development/Testing
TWILIO_USE_MOCK=false  # Set to true for mock mode
```

### 3. Database Setup

The chat system uses your existing database for user management and stores message metadata:

```sql
-- Chat metadata is stored in existing patient/provider records
-- No additional tables needed - Twilio manages message storage
```

### 4. Webhook Configuration (Optional)

For advanced features like offline notifications:

```bash
# In Twilio Console, set webhook URL:
https://your-domain.com/api/v2/twilio/chat/webhook

# Configure events:
- onMessageAdded
- onUserAdded
- onChannelAdded
```

## 💻 Usage

### For Developers

#### Initialize Chat Client

```typescript
import ChatWidget from "@/components/twilio/ChatWidget";

// Basic usage
<ChatWidget
  userId="user-123"
  userName="John Doe"
  userType={ChatUserType.PATIENT}
  recipientId="provider-456"
  recipientName="Dr. Smith"
/>
```

#### Send Programmatic Messages

```typescript
import { ChatClientManager } from '@/lib/integrations/twilio/chatService';

const chatManager = new ChatClientManager(userId, userType);
await chatManager.initialize(token);

const conversation = await chatManager.getOrCreateConversation(
  'consultation-123',
  'Consultation with Dr. Smith'
);

await chatManager.sendMessage(conversation, 'Hello, Doctor!');
```

#### API Endpoints

```typescript
// Generate chat token
POST /api/v2/twilio/chat/token
Body: {
  identity: "user-123",
  userType: "patient"
}

// Send system message
POST /api/v2/twilio/chat/system-message
Body: {
  conversationId: "conv-123",
  message: "Prescription ready for pickup"
}
```

### For Healthcare Providers

#### Access Chat Management

1. Navigate to **Admin Console** > **Chat Management Center**
2. View all active conversations
3. Filter by priority, unread, or patient name
4. Click on a conversation to open chat

#### Using Quick Responses

Providers have pre-defined responses for common scenarios:

- "Hello! How can I help you today?"
- "I'll review your information and get back to you shortly."
- "Please schedule a follow-up if symptoms persist."

### For Patients

#### Starting a Chat

1. Click the chat bubble in the bottom-right corner
2. Type your message
3. Attach files if needed (images, documents)
4. Get real-time responses from providers

## 🧪 Testing

### Mock Mode Testing

Enable mock mode for development without Twilio credentials:

```env
TWILIO_USE_MOCK=true
```

### Test Scenarios

```bash
# 1. Test token generation
curl -X POST http://localhost:3000/api/v2/twilio/chat/token \
  -H "Content-Type: application/json" \
  -d '{"identity": "test-user", "userType": "patient"}'

# 2. Test conversation creation
# Use the Chat Management Center UI at:
http://localhost:3000/communications/chat

# 3. Test file upload
# Use the paperclip icon in the chat widget
```

### Load Testing

```javascript
// Test multiple concurrent conversations
for (let i = 0; i < 10; i++) {
  const chat = new ChatClientManager(`user-${i}`, ChatUserType.PATIENT);
  await chat.initialize(token);
  // Send test messages
}
```

## 🔒 Security & HIPAA Compliance

### Encryption

- **In Transit**: TLS 1.2+ for all connections
- **At Rest**: AES-256 encryption in Twilio's storage
- **End-to-End**: Optional E2E encryption available

### Access Control

- JWT-based authentication
- Role-based permissions (patient/provider/admin)
- Automatic token refresh
- Session timeout after inactivity

### Audit Trail

- All messages logged with timestamps
- User actions tracked
- Export capability for compliance

### HIPAA Safeguards

```typescript
// Automatic PHI detection and warning
if (detectPHI(message)) {
  showWarning('This message may contain sensitive health information');
}

// Consent verification
if (!patient.hasSignedHIPAAConsent) {
  blockChatAccess();
}
```

## 📊 Monitoring & Analytics

### Key Metrics

- Average response time
- Message volume by hour/day
- Active conversations
- User satisfaction ratings

### Dashboard Access

```
Admin Console > Analytics > Chat Metrics
```

### Alerts

- Provider response time > 5 minutes
- High priority messages unread > 10 minutes
- System errors or connection issues

## 🚦 Troubleshooting

### Common Issues

1. **"Chat not connecting"**

   ```bash
   # Check Twilio credentials
   # Verify TWILIO_CHAT_SERVICE_SID is correct
   # Ensure feature flag is enabled
   ```

2. **"Token expired"**

   ```bash
   # Tokens auto-refresh, but check:
   - Token TTL settings (default 1 hour)
   - Refresh endpoint accessibility
   ```

3. **"Messages not sending"**
   ```bash
   # Check network connectivity
   # Verify conversation permissions
   # Check file size limits (10MB max)
   ```

### Debug Mode

Enable debug logging:

```javascript
localStorage.setItem('TWILIO_CHAT_DEBUG', 'true');
```

## 📈 Best Practices

### For Providers

1. Respond within 5 minutes during business hours
2. Use quick responses for efficiency
3. Flag urgent messages appropriately
4. Close conversations when complete

### For Developers

1. Implement proper error handling
2. Cache tokens appropriately
3. Clean up connections on unmount
4. Monitor WebSocket connections

### For System Admins

1. Regular backup of conversation metadata
2. Monitor Twilio usage and costs
3. Review chat logs for compliance
4. Update quick response templates

## 🎯 Roadmap

### Phase 1 (Current)

- ✅ Basic messaging
- ✅ Typing indicators
- ✅ Read receipts
- ✅ File sharing
- ✅ Mock service for testing

### Phase 2 (Next)

- [ ] Voice/Video calls from chat
- [ ] AI-powered response suggestions
- [ ] Automated appointment scheduling
- [ ] Chat bot for common questions

### Phase 3 (Future)

- [ ] Multi-language support
- [ ] Screen sharing
- [ ] Chat transcription
- [ ] Integration with EHR systems

## 📞 Support

For issues or questions:

- **Technical Issues**: Create a ticket in the admin console
- **Twilio Support**: [support.twilio.com](https://support.twilio.com)
- **Documentation**: Check `/docs` folder
- **Emergency**: Contact system administrator

## 📝 License & Compliance

- Twilio Conversations is HIPAA-eligible
- Requires signed BAA with Twilio
- All chat data retained per compliance requirements
- Regular security audits required
