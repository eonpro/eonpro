# Heyflow Webhook Integration - COMPREHENSIVE GUIDE

## Overview

This document provides a complete guide for setting up, testing, and troubleshooting the Heyflow
webhook integration with the EONPro ePrescribing platform.

## 🚀 Quick Start

### 1. Webhook Endpoints

We have multiple webhook endpoints for different purposes:

| Endpoint                          | Purpose                                                  | Status        |
| --------------------------------- | -------------------------------------------------------- | ------------- |
| `/api/webhooks/heyflow-intake-v2` | **PRODUCTION** - Main webhook with comprehensive logging | ✅ Active     |
| `/api/webhooks/heyflow-intake`    | Legacy endpoint (still works)                            | ⚠️ Deprecated |
| `/api/webhooks/heyflow-test`      | Simple test endpoint (no auth)                           | 🧪 Testing    |
| `/api/webhooks/heyflow-debug`     | Debug endpoint with verbose logging                      | 🔍 Debug      |

### 2. Configure Heyflow

In your Heyflow dashboard:

1. Navigate to your flow settings
2. Go to "Integrations" or "Webhooks"
3. Add a new webhook with:
   - **URL**: `https://your-domain.com/api/webhooks/heyflow-intake-v2`
   - **Method**: `POST`
   - **Content-Type**: `application/json`
   - **Authentication**: Add custom header `x-heyflow-secret` with your secret

### 3. Environment Variables

Add to your `.env` or `.env.local`:

```bash
# Primary webhook secret
HEYFLOW_WEBHOOK_SECRET=your-secret-key-here

# Alternative (if using MedLink)
MEDLINK_WEBHOOK_SECRET=your-secret-key-here

# Optional: Notification webhook for successful submissions
WEBHOOK_SUCCESS_NOTIFICATION_URL=https://your-slack-webhook-or-other-service
```

## 🔍 Monitoring Dashboard

Access the webhook monitoring dashboard at:

```
http://localhost:5000/webhooks/monitor
```

Features:

- Real-time webhook statistics
- Recent webhook attempts with details
- Manual webhook testing tool
- Auto-refresh capability
- Multiple endpoint monitoring

## 📊 What Gets Logged

Every webhook attempt is logged with:

- **Headers** (sensitive data redacted)
- **Full payload**
- **Processing status** (SUCCESS, ERROR, INVALID_AUTH, etc.)
- **Response data**
- **Processing time**
- **Error messages** (if any)
- **IP address and User Agent**

## 🧪 Testing the Webhook

### Method 1: Using the Monitor Dashboard

1. Go to `/webhooks/monitor`
2. Enter your webhook secret (optional)
3. Modify the sample payload or use as-is
4. Click "Send Test Webhook"
5. Check the response and logs

### Method 2: Using cURL

```bash
# Without authentication
curl -X POST http://localhost:5000/api/webhooks/heyflow-test \
  -H "Content-Type: application/json" \
  -d '{
    "responseId": "test-123",
    "submissionId": "sub-456",
    "data": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com"
    }
  }'

# With authentication
curl -X POST http://localhost:5000/api/webhooks/heyflow-intake-v2 \
  -H "Content-Type: application/json" \
  -H "x-heyflow-secret: your-secret-key" \
  -d '{...payload...}'
```

### Method 3: Using the Test Endpoints

For initial testing without auth:

```
POST /api/webhooks/heyflow-test
POST /api/webhooks/heyflow-debug
```

## 🔐 Authentication Methods Supported

The webhook accepts authentication via multiple headers:

1. **x-heyflow-secret** (Primary for Heyflow)
2. **x-heyflow-signature** (Alternative Heyflow)
3. **x-webhook-secret** (Generic)
4. **x-medlink-secret** (MedLink compatibility)
5. **authorization** (Bearer token format)
6. **x-api-key** (API key format)

## 📝 Expected Payload Structure

The webhook expects a payload with this structure:

```json
{
  "responseId": "unique-response-id",
  "submissionId": "unique-submission-id",
  "flowId": "flow-identifier",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "555-1234",
    "dateOfBirth": "1990-01-01"
    // ... other patient data
  },
  "answers": [
    {
      "label": "Field Label",
      "value": "Field Value",
      "question": "Original Question"
    }
    // ... more answers
  ]
}
```

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. No Webhooks Received

**Check:**

- Is your server publicly accessible? (Use ngrok for local testing)
- Is the webhook URL correct in Heyflow?
- Check firewall/security group settings

**Debug:**

```bash
# Check if your endpoint is reachable
curl -I https://your-domain.com/api/webhooks/heyflow-intake-v2
```

#### 2. Authentication Failures (401 errors)

**Check:**

- Webhook secret matches between Heyflow and environment variables
- Correct header name is being used (`x-heyflow-secret`)
- No extra spaces in the secret value

**Debug:**

- Check the webhook monitor for `INVALID_AUTH` status
- Review error messages in the logs

#### 3. Payload Errors (400/422 errors)

**Check:**

- Payload structure matches expected format
- Required fields are present
- Data types are correct (dates, numbers, etc.)

**Debug:**

- Use the debug endpoint to see raw payload
- Check `INVALID_PAYLOAD` entries in monitor

#### 4. Processing Errors (500 errors)

**Check:**

- Database connection is working
- All required services are running
- File storage permissions are correct

**Debug:**

- Check server logs for detailed error messages
- Review Sentry for error tracking (if configured)

### Checking Logs

#### Application Logs

```bash
# If using PM2
pm2 logs

# If running directly
# Check terminal output
```

#### Database Logs

```sql
-- Check recent webhook attempts
SELECT * FROM "WebhookLog"
ORDER BY "createdAt" DESC
LIMIT 10;

-- Check specific endpoint
SELECT * FROM "WebhookLog"
WHERE endpoint = '/api/webhooks/heyflow-intake-v2'
ORDER BY "createdAt" DESC;

-- Check error rate
SELECT
  status,
  COUNT(*) as count,
  AVG("processingTimeMs") as avg_time
FROM "WebhookLog"
WHERE "createdAt" > datetime('now', '-7 days')
GROUP BY status;
```

## 📈 Performance Optimization

### Best Practices:

1. **Async Processing**: SOAP note generation happens asynchronously
2. **Error Resilience**: Failures in optional steps don't fail the webhook
3. **Timeout Handling**: Webhook responds quickly, long operations happen in background
4. **Caching**: Patient lookups are optimized with indexes

### Database Indexes:

```sql
-- Already configured in schema
@@index([endpoint, createdAt(sort: Desc)])
@@index([status, createdAt(sort: Desc)])
@@index([createdAt(sort: Desc)])
```

## 🔄 Data Flow

1. **Heyflow** sends POST request to webhook endpoint
2. **Authentication** is validated
3. **Payload** is normalized and validated
4. **Patient** record is created/updated
5. **PDF** is generated from intake data
6. **Document** is stored in database and file system
7. **SOAP Note** is generated (async, optional)
8. **Success response** is returned to Heyflow
9. **Webhook log** is recorded for monitoring

## 🛠️ Maintenance

### Regular Tasks:

1. **Monitor Success Rate**: Check dashboard weekly
2. **Clean Old Logs**: Remove logs older than 30 days
3. **Review Errors**: Investigate recurring error patterns
4. **Update Documentation**: Keep this guide current

### Cleanup Script:

```javascript
// Clean logs older than 30 days
import { cleanOldWebhookLogs } from '@/lib/webhookLogger';

async function maintenance() {
  const deleted = await cleanOldWebhookLogs(30);
  console.log(`Deleted ${deleted} old webhook logs`);
}
```

## 🎯 Success Metrics

Monitor these KPIs:

- **Success Rate**: Should be > 95%
- **Average Processing Time**: Should be < 1000ms
- **Auth Failure Rate**: Should be < 1%
- **Payload Error Rate**: Should be < 5%

## 📞 Support

If issues persist:

1. Check the monitoring dashboard first
2. Review this documentation
3. Check recent code changes that might affect webhooks
4. Contact the development team with:
   - Webhook Log ID
   - Timestamp of attempt
   - Error messages
   - Sample payload (if available)

## 🔄 Version History

- **v2.0** (Current): Enhanced logging, monitoring dashboard, multiple auth methods
- **v1.0**: Basic webhook with minimal logging

---

_Last Updated: November 2024_ _Platform: EONPro ePrescribing_ _Integration: Heyflow Form Builder_
