# MedLink Webhook Setup Guide

## 🚨 Current Issue

The MedLink webhook is not displaying information in the platform because MedLink cannot reach your
local development server directly.

## 🔧 Solution for Local Development

### Option 1: Using ngrok (Recommended)

1. **Install ngrok**:

   ```bash
   brew install ngrok  # On macOS
   # OR
   npm install -g ngrok
   ```

2. **Start your local server**:

   ```bash
   npm run dev -- --port 3005
   ```

3. **Create a tunnel to your local server**:

   ```bash
   ngrok http 3005
   ```

4. **Copy the ngrok URL** (looks like `https://abc123.ngrok.io`)

5. **Configure MedLink Webhook**:
   - Go to your MedLink dashboard
   - Navigate to your flow's settings
   - Find the Webhook configuration
   - Set the webhook URL to: `https://your-ngrok-url.ngrok.io/api/webhooks/medlink-intake`
   - Set the webhook secret to: `medlink-dev-secret` (or whatever is in your .env file)

### Option 2: Using localtunnel

1. **Install localtunnel**:

   ```bash
   npm install -g localtunnel
   ```

2. **Start your local server**:

   ```bash
   npm run dev -- --port 3005
   ```

3. **Create a tunnel**:

   ```bash
   lt --port 3005 --subdomain lifefile-dev
   ```

4. **Use the URL**: `https://lifefile-dev.loca.lt/api/webhooks/medlink-intake`

## 📝 Testing the Webhook

### Test with curl:

```bash
curl -X POST http://localhost:3005/api/webhooks/medlink-intake \
  -H "Content-Type: application/json" \
  -H "x-medlink-secret: medlink-dev-secret" \
  -d '{
    "submissionId": "test-123",
    "timestamp": "2025-11-22T10:00:00Z",
    "data": {
      "firstName": "Test",
      "lastName": "Patient",
      "email": "test@example.com",
      "phone": "555-0100",
      "dateOfBirth": "1990-01-01",
      "gender": "Other"
    }
  }'
```

## 🔍 Debugging

### Check if webhooks are being received:

1. Look at the server logs in the terminal running `npm run dev`
2. You should see `[HEYFLOW WEBHOOK]` logs when a webhook is received

### Check database for intakes:

```bash
# Navigate to the intakes page
http://localhost:3005/intakes

# OR check via Prisma Studio
npx prisma studio
# Then look at the PatientDocument table
```

## 🚀 Production Setup

For production deployment:

1. **Deploy your application** to a hosting service (Vercel, Heroku, etc.)

2. **Set environment variable**:

   ```env
   MEDLINK_WEBHOOK_SECRET=your-secure-secret-here
   ```

3. **Configure MedLink**:
   - Webhook URL: `https://your-domain.com/api/webhooks/medlink-intake`
   - Webhook Secret: Same as your environment variable

## 📋 Webhook Data Flow

1. **MedLink** sends form submission →
2. **Webhook endpoint** (`/api/webhooks/medlink-intake`) receives data →
3. **Data normalized** and patient created/updated →
4. **PDF generated** from intake data →
5. **Document stored** in database →
6. **SOAP note** generated (if AI enabled) →
7. **Data visible** on `/intakes` page

## ⚠️ Common Issues

### Webhook not receiving data:

- ✅ Ensure ngrok/localtunnel is running
- ✅ Verify webhook URL in MedLink is correct
- ✅ Check webhook secret matches

### Data received but not saved:

- ✅ Check server logs for errors
- ✅ Verify database is running (`npx prisma studio`)
- ✅ Check patient data format matches expected schema

### Intakes page shows 0 submissions:

- ✅ Refresh the page (it's server-rendered)
- ✅ Check PatientDocument table in database
- ✅ Verify category is `MEDICAL_INTAKE_FORM`

## 🔑 Environment Variables

Make sure these are set in your `.env` file:

```env
MEDLINK_WEBHOOK_SECRET=medlink-dev-secret
DATABASE_URL=file:./prisma/dev.db
OPENAI_API_KEY=your-api-key-here  # For SOAP note generation
```
