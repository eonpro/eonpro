# 🔧 Fix MedLink Webhook Configuration

## The Issue

Your MedLink webhook is using the wrong ngrok URL. You're getting a 404 error because you're using:

- ❌ Wrong: `https://83de6193bbfe.ngrok-free.app/api/webhooks/medlink-intake`
- ✅ Correct: `https://1d2f49d51cf3.ngrok-free.app/api/webhooks/medlink-intake`

## How to Fix

### In MedLink:

1. Change the Webhook URL to:

   ```
   https://1d2f49d51cf3.ngrok-free.app/api/webhooks/medlink-intake
   ```

2. Switch to the **HTTP Headers** tab and add:
   - **Header Name**: `x-medlink-secret`
   - **Header Value**: `your-secret-key-here` (from your .env file)

3. Keep the Method as **POST**

4. Click **Test** to verify it works

5. Save your changes

## Verify It's Working

### Option 1: Test from MedLink

Click the "Test" button in MedLink - you should see a success response.

### Option 2: Test locally

```bash
node scripts/test-webhook.js
```

### Option 3: Check ngrok dashboard

Open http://localhost:4040 in your browser to see incoming requests

## Important Notes

- ngrok URLs change when ngrok restarts
- To check your current ngrok URL, run:
  ```bash
  curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | cut -d'"' -f4 | head -1
  ```
- For production, use your actual domain instead of ngrok
