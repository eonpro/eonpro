# Becca AI Implementation Guide

## 🤖 Overview

Becca AI is an intelligent medical assistant integrated into the platform that provides:
1. **Automatic SOAP Note Generation** from intake forms
2. **Natural Language Patient Data Queries** through a chat interface
3. **🆕 AI Scribe** - Real-time transcription during telehealth consultations

## 🎙️ AI Scribe (New Feature)

AI Scribe extends Becca AI with real-time audio transcription and automatic documentation generation during video consultations.

### Features:
- **Real-time Transcription** - Uses OpenAI Whisper for speech-to-text
- **Speaker Diarization** - Identifies provider vs patient speech
- **Auto SOAP Generation** - Creates structured notes from conversations
- **Red Flag Detection** - Alerts for urgent concerns in transcripts
- **Medication Extraction** - Automatically extracts prescription changes

### How to Use:
1. During a telehealth appointment, click the "AI Scribe" button
2. Grant microphone permission when prompted
3. Speak normally - transcription appears in real-time
4. Click "Stop" when finished, then "Generate SOAP Note"
5. Review and approve the generated documentation

### Components:
- `BeccaAIScribe.tsx` - Main scribe interface
- `BeccaAIScribeButton.tsx` - Launch button for scribe

### API Endpoints:
- `POST /api/ai-scribe/transcribe` - Transcribe audio
- `POST /api/ai-scribe/generate-soap` - Generate SOAP from transcript

## 🎨 Lottie Animation Integration

The platform now uses a beautiful Lottie animation ([view animation](https://lottie.host/9c7564a3-b6ee-4e8b-8b5e-14a59b28c515/3Htnjbp08p.lottie)) for:
- **Floating Button**: Small animated placeholder at the bottom-right of the screen
- **Loading States**: Shown when generating SOAP notes or processing queries
- **Chat Loading**: Displayed while Becca AI processes responses

### Components Created:
- `BeccaAIButton`: Reusable animated button component
- `BeccaAILoader`: Loading animation component with text
- `BeccaAIGlobalChat`: Global chat widget available on all pages

## 🔧 Key Features

### 1. SOAP Note Generation
- **Automatic**: Generates from MedLink intake data when webhooks arrive
- **Manual**: Doctors can create manual SOAP notes
- **Approval Workflow**: Password-protected approval and editing
- **Audit Trail**: Complete history of all changes
- **Export**: Download SOAP notes as text files

### 2. AI Assistant Chat
- **Natural Language**: Ask questions in plain English
- **Context-Aware**: Understands patient context on profile pages
- **Smart Suggestions**: Provides relevant follow-up questions
- **Session History**: Maintains conversation context
- **Global Access**: Available from any page via floating button

## 📁 File Structure

```
src/
├── services/ai/
│   ├── openaiService.ts      # OpenAI integration with rate limiting
│   ├── soapNoteService.ts    # SOAP note management
│   └── assistantService.ts   # Chat query processing
├── app/api/
│   ├── soap-notes/           # SOAP note API endpoints
│   └── ai/chat/              # Chat API endpoints
├── components/
│   ├── BeccaAIChat.tsx       # Main chat interface
│   ├── BeccaAIButton.tsx     # Animated button component
│   ├── BeccaAILoader.tsx     # Loading animation component
│   ├── BeccaAIGlobalChat.tsx # Global chat wrapper
│   └── PatientSOAPNotesView.tsx # SOAP notes UI
```

## 🚀 Usage

### Access Points:
1. **Global Chat**: Click the animated Becca AI button at bottom-right of any page
2. **Patient Profile**: SOAP Notes tab for managing clinical documentation
3. **Patient Context Chat**: Chat button on patient profiles for patient-specific queries

### Example Queries:
- "What is the date of birth for Jane Doe?"
- "Show me the latest tracking number for patient 123"
- "What prescriptions were ordered today?"
- "List recent SOAP notes for John Smith"

## 🔐 Security

- **OpenAI API Key**: Stored securely in environment variables
- **Rate Limiting**: 50 requests per minute limit
- **Password Protection**: SOAP notes require password for editing after approval
- **Audit Trail**: All changes tracked with user and timestamp
- **HIPAA Compliance**: Structured for patient privacy

## 🛠️ Configuration

### Environment Variables:
```bash
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=4000
```

### Database:
- New tables: SOAPNote, SOAPNoteRevision, AIConversation, AIMessage
- Run migrations: `npx prisma db push`

## 📊 Monitoring

- **Usage Tracking**: Token usage and costs tracked per request
- **Error Logging**: All errors logged to console
- **Conversation History**: Stored in database for compliance

## 🎯 Next Steps

1. **Authentication**: Integrate with user session for proper user tracking
2. **Cost Monitoring**: Add dashboard for OpenAI usage costs
3. **Custom Training**: Fine-tune responses for your specific medical domain
4. **Advanced Features**: Add voice input, document analysis, appointment scheduling

## 🐛 Troubleshooting

### Common Issues:
- **Rate Limit**: Wait 60 seconds if rate limited
- **Invalid API Key**: Check OPENAI_API_KEY in .env
- **No Response**: Verify OpenAI service status
- **Animation Not Loading**: Check internet connection for Lottie CDN

### Support:
- Check console logs for detailed error messages
- Review `/api/ai/chat` response for API errors
- Verify database migrations are applied

## 📈 Performance

- **Response Time**: Typically 2-5 seconds for queries
- **SOAP Generation**: 5-10 seconds for comprehensive notes
- **Token Usage**: ~500-1000 tokens per SOAP note
- **Cost**: ~$0.01-0.03 per SOAP note generation

---

**Platform Status**: ✅ Running on http://localhost:3005
**Becca AI Status**: ✅ Operational with Lottie animations
