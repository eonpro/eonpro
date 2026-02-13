# Lifefile Data Push Webhook Integration

## Overview

The Lifefile Data Push Service webhook endpoint receives real-time updates for prescription (Rx)
events and order status changes from the Lifefile platform. This webhook processes both XML and JSON
payloads and updates the local database accordingly.

## Endpoint Details

- **URL**: `/api/webhooks/lifefile-data-push`
- **Method**: `POST`
- **Authentication**: Basic Authentication
- **Content Types**:
  - `application/json`
  - `application/xml`
  - `text/xml`

## Configuration

Add the following environment variables to your `.env` file:

```env
# Lifefile Data Push Webhook Configuration
LIFEFILE_DATAPUSH_USERNAME=your_webhook_username
LIFEFILE_DATAPUSH_PASSWORD=your_webhook_password

# Or use existing Lifefile webhook credentials
LIFEFILE_WEBHOOK_USERNAME=webhook_user
LIFEFILE_WEBHOOK_PASSWORD=webhook_password
```

## Authentication

The webhook uses HTTP Basic Authentication. The Authorization header must be included:

```
Authorization: Basic base64(username:password)
```

Example:

```bash
curl -X POST https://your-domain.com/api/webhooks/lifefile-data-push \
  -u "username:password" \
  -H "Content-Type: application/json" \
  -d '{"type":"rx_event",...}'
```

## Supported Events

### 1. Rx Events

Triggered when prescription-related events occur:

- Prescription created
- Prescription approved
- Prescription denied
- Prescription modified
- Prescription cancelled

**Example JSON Payload:**

```json
{
  "type": "rx_event",
  "eventType": "rx_created",
  "orderId": "LF-12345",
  "referenceId": "REF-67890",
  "patientId": "PAT-001",
  "providerId": "PROV-001",
  "prescription": {
    "medicationName": "Semaglutide",
    "strength": "0.25mg",
    "form": "Injection",
    "quantity": "4",
    "refills": "3",
    "sig": "Inject 0.25mg subcutaneously once weekly",
    "status": "pending"
  },
  "timestamp": "2024-01-10T10:30:00Z"
}
```

### 2. Order Status Updates

Triggered when order status changes:

- Order submitted
- Order processing
- Order approved
- Order shipped
- Order delivered
- Order cancelled

**Example JSON Payload:**

```json
{
  "type": "order_status",
  "eventType": "order_shipped",
  "order": {
    "orderId": "LF-12345",
    "referenceId": "REF-67890",
    "status": "shipped",
    "shippingStatus": "in_transit",
    "trackingNumber": "1Z999AA10123456784",
    "trackingUrl": "https://tracking.example.com/1Z999AA10123456784",
    "estimatedDelivery": "2024-01-15",
    "shippedAt": "2024-01-10T14:30:00Z"
  }
}
```

**Example XML Payload:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OrderStatusUpdate>
  <Type>order_status</Type>
  <EventType>order_delivered</EventType>
  <Order>
    <OrderId>LF-12345</OrderId>
    <ReferenceId>REF-67890</ReferenceId>
    <Status>delivered</Status>
    <ShippingStatus>delivered</ShippingStatus>
    <TrackingNumber>1Z999AA10123456784</TrackingNumber>
    <DeliveredAt>2024-01-15T10:30:00Z</DeliveredAt>
  </Order>
</OrderStatusUpdate>
```

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Data push processed successfully",
  "result": {
    "processed": true,
    "orderId": "LF-12345",
    "status": "shipped",
    "eventType": "order_status"
  },
  "processingTimeMs": 125
}
```

### Error Response (401 Unauthorized)

```json
{
  "error": "Unauthorized"
}
```

### Error Response (500 Internal Server Error)

```json
{
  "error": "Internal server error",
  "message": "Error description"
}
```

## Database Updates

The webhook updates the following database tables:

1. **Order** table:
   - `status`: Updated with new order status
   - `shippingStatus`: Updated with shipping status
   - `trackingNumber`: Updated with tracking number
   - `trackingUrl`: Updated with tracking URL
   - `lastWebhookAt`: Timestamp of last webhook
   - `lastWebhookPayload`: Full webhook payload

2. **OrderEvent** table:
   - Creates a new event record for each webhook
   - Stores the full payload for audit trail
   - Records event type and timestamp

3. **WebhookLog** table:
   - Logs all webhook attempts
   - Records success/failure status
   - Tracks processing time
   - Stores headers and payload

## Testing

### Test the Webhook Endpoint

Use the provided test script:

```bash
# Install dependencies if needed
npm install axios

# Run the test script
npx tsx scripts/test-lifefile-datapush.ts
```

### Manual Testing with cURL

```bash
# Test with JSON payload
curl -X POST http://localhost:3002/api/webhooks/lifefile-data-push \
  -u "lifefile_webhook:test_password" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "order_status",
    "order": {
      "orderId": "LF-TEST-001",
      "status": "shipped",
      "trackingNumber": "1234567890"
    }
  }'

# Test with XML payload
curl -X POST http://localhost:3002/api/webhooks/lifefile-data-push \
  -u "lifefile_webhook:test_password" \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
  <OrderStatusUpdate>
    <OrderId>LF-TEST-001</OrderId>
    <Status>delivered</Status>
  </OrderStatusUpdate>'
```

### Check Webhook Status

```bash
# GET request to check if webhook is active
curl http://localhost:3002/api/webhooks/lifefile-data-push
```

## Monitoring

### View Webhook Logs

Webhook activity is logged in the `WebhookLog` table and can be viewed through:

1. **Database Query**:

```sql
SELECT * FROM WebhookLog
WHERE endpoint = '/api/webhooks/lifefile-data-push'
ORDER BY createdAt DESC
LIMIT 10;
```

2. **Application Logs**: All webhook activities are logged with the prefix `[LIFEFILE DATA PUSH]`

3. **Admin Dashboard**: Navigate to Admin Console → Webhook Monitor to view recent webhook activity

## Security Considerations

1. **HTTPS Required**: Always use HTTPS in production to protect Basic Auth credentials
2. **IP Whitelisting**: Consider implementing IP whitelisting for additional security
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Credential Rotation**: Regularly rotate webhook credentials
5. **Monitoring**: Set up alerts for authentication failures and error rates

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check that Basic Auth credentials are correct
   - Verify environment variables are set

2. **500 Internal Server Error**
   - Check application logs for detailed error
   - Verify database connection is active
   - Ensure XML/JSON payload is valid

3. **Order Not Found**
   - Verify that the order exists in the database
   - Check that orderId or referenceId matches

### Debug Mode

Enable debug logging by setting:

```env
LOG_LEVEL=debug
```

## Integration with Lifefile

To configure the Data Push Service on Lifefile's side:

1. **Secure URL**: `https://your-domain.com/api/webhooks/lifefile-data-push`
2. **Authentication**: Provide the username and password
3. **Events to Monitor**: Select the Rx events and order statuses you want to receive
4. **Content Type**: Choose JSON or XML format

## Support

For issues or questions:

- Check the application logs for detailed error messages
- Review the webhook logs in the database
- Contact Lifefile support for platform-specific configuration

## Version History

- **v1.0.0** (2024-01-10): Initial implementation
  - Support for Rx events
  - Support for order status updates
  - XML and JSON payload support
  - Basic authentication
  - Database integration
  - Comprehensive logging
