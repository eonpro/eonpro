# MedLink Webhook Configuration Guide

## Current Setup Status ✅

Your ngrok tunnel is now running and ready to receive webhooks!

**Your Webhook URL:** 
```
https://1d2f49d51cf3.ngrok-free.app/api/webhooks/medlink-intake
```

## Step 1: Configure MedLink

1. Log into your MedLink account
2. Navigate to your flow/form settings
3. Go to "Integrations" or "Webhooks" section
4. Add a new webhook with these settings:
   - **URL**: `https://1d2f49d51cf3.ngrok-free.app/api/webhooks/medlink-intake`
   - **Method**: POST
   - **Content Type**: application/json
   - **Events**: Form submission (or similar)
   
5. Add the secret header (if required):
   - **Header Name**: `x-medlink-secret`
   - **Header Value**: Your secret from `.env` file (HEYFLOW_SECRET)

## Step 2: Test the Connection

### Option A: Test from MedLink
1. Submit a test form in MedLink
2. Check the webhook logs in MedLink
3. Monitor your terminal for incoming requests

### Option B: Test locally
Run this command to simulate a MedLink submission:
```bash
node scripts/test-webhook.js
```

## Step 3: Monitor Webhook Activity

1. **View ngrok dashboard**: Open http://localhost:4040 in your browser
2. **Check application logs**: Look for `[Webhook]` entries in your terminal
3. **Check database**: New patients should appear in the platform

## Important URLs

- **Local app**: http://localhost:3005
- **Public webhook URL**: https://1d2f49d51cf3.ngrok-free.app/api/webhooks/medlink-intake
- **ngrok dashboard**: http://localhost:4040

## Troubleshooting

- If the webhook URL changes (ngrok restarts), you'll need to update it in MedLink
- Make sure your `.env` file has the correct `HEYFLOW_SECRET`
- Check that the development server is running on port 3005
- Ensure ngrok is running (check with `ps aux | grep ngrok`)

## Production Setup

For production, replace the ngrok URL with your actual domain:
```
https://yourdomain.com/api/webhooks/medlink-intake
```
