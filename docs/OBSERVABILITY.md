# Observability & APM Guide

**Document Version:** 1.0  
**Last Updated:** January 21, 2026  
**Classification:** INTERNAL - Engineering Team  

---

## 1. Overview

The EONPRO platform uses a comprehensive observability stack for monitoring, tracing, and alerting.

### Stack Components

| Component | Tool | Purpose |
|-----------|------|---------|
| **Error Tracking** | Sentry | Exception capture, stack traces |
| **APM/Tracing** | Sentry Performance | Distributed tracing, spans |
| **Metrics** | Sentry Metrics | Custom gauges, counters |
| **Session Replay** | Sentry Replay | User session recording |
| **Logging** | Custom Logger | Structured JSON logs |

---

## 2. Distributed Tracing

### 2.1 Request Correlation

Every request is assigned a unique `request_id` for correlation across services.

```typescript
import { traceApiRoute, TraceContext } from '@/lib/observability';

export async function GET(req: NextRequest) {
  return traceApiRoute(req, async (context: TraceContext) => {
    // context.requestId - unique request ID
    // context.traceId - distributed trace ID
    
    return NextResponse.json({ data });
  });
}
```

### 2.2 Span Creation

Create spans for tracking individual operations:

```typescript
import { trace, traceDbQuery, traceStripe } from '@/lib/observability';

// Generic tracing
const result = await trace('process-order', 'business.logic', async () => {
  return await processOrder(orderId);
});

// Database tracing
const patient = await traceDbQuery('SELECT', 'Patient', async () => {
  return await prisma.patient.findUnique({ where: { id } });
});

// External service tracing
const payment = await traceStripe('create-payment-intent', async () => {
  return await stripe.paymentIntents.create({ ... });
});
```

### 2.3 Trace Propagation

For cross-service calls, propagate trace context:

```typescript
import { createOutgoingTraceHeaders } from '@/lib/observability';

const headers = createOutgoingTraceHeaders(context);
const response = await fetch(externalUrl, { headers });
```

---

## 3. Metrics

### 3.1 Built-in Metrics

The platform automatically tracks:

| Metric | Type | Description |
|--------|------|-------------|
| `api.response_time` | Distribution | API endpoint latency |
| `db.query_time` | Distribution | Database query duration |
| `http.server.duration` | Distribution | Request handling time |
| `server.memory.heap` | Gauge | Heap memory usage |

### 3.2 Custom Metrics

```typescript
import { recordMetric, incrementCounter, recordDistribution } from '@/lib/observability';

// Gauge (current value)
recordMetric('queue.size', queue.length);

// Counter (incremental)
incrementCounter('orders.created', { status: 'success' });

// Distribution (histogram)
recordDistribution('order.processing_time', duration, 'millisecond');
```

---

## 4. Error Tracking

### 4.1 Automatic Capture

Sentry automatically captures:
- Unhandled exceptions
- Promise rejections
- API errors (4xx, 5xx)
- Client-side errors

### 4.2 Manual Capture

```typescript
import { captureException, captureMessage, ErrorTracker } from '@/lib/observability';

// Capture exception with context
try {
  await riskyOperation();
} catch (error) {
  captureException(error, {
    userId: user.id,
    operation: 'payment-processing',
  });
}

// Capture warning message
captureMessage('Rate limit approaching', 'warning', {
  currentUsage: 450,
  limit: 500,
});

// Categorized error tracking
ErrorTracker.trackError(error, 'database', { query: 'SELECT ...' });
ErrorTracker.trackBusinessError('checkout', 'Insufficient inventory', { productId });
```

---

## 5. Session Replay

### 5.1 Configuration

Session replay is enabled in production with HIPAA-compliant masking:

- **Sample Rate:** 10% of sessions
- **Error Sessions:** 100% captured
- **Masking:** All inputs masked, sensitive selectors blocked

### 5.2 Sensitive Data Protection

```html
<!-- Data that will be masked -->
<input type="password" />
<div class="sensitive-data">SSN: ***</div>
<span data-sensitive>PHI content</span>

<!-- Data that will NOT be masked -->
<span class="public-data">Product name</span>
```

---

## 6. Alerting

### 6.1 Sentry Alerts

Configure alerts in Sentry dashboard for:

| Alert | Condition | Action |
|-------|-----------|--------|
| Error Spike | >10 errors/minute | Slack notification |
| P95 Latency | >2s response time | PagerDuty |
| New Error | First occurrence | Email |

### 6.2 Custom Alerts

```typescript
// Trigger custom alert condition
if (queueSize > QUEUE_THRESHOLD) {
  captureMessage('Queue size critical', 'fatal', {
    queueSize,
    threshold: QUEUE_THRESHOLD,
  });
}
```

---

## 7. Dashboards

### 7.1 Key Dashboards

Access in Sentry at https://sentry.io/organizations/[org]/dashboards/

1. **API Performance** - Endpoint latency, error rates
2. **Database Health** - Query times, connection pools
3. **User Experience** - Web Vitals, session metrics
4. **Business Metrics** - Orders, conversions

### 7.2 Custom Widgets

Create widgets for:
- `api.response_time` by endpoint
- `db.query_time` by table
- Error count by category

---

## 8. Local Development

### 8.1 Sentry Spotlight

In development, Sentry Spotlight provides local debugging:

```bash
# Start dev server with Spotlight
npm run dev
# Open http://localhost:3000
# Spotlight sidebar shows local traces/errors
```

### 8.2 Debug Mode

Enable detailed Sentry logging:

```env
SENTRY_DEBUG=true
NEXT_PUBLIC_SENTRY_DEBUG=true
```

---

## 9. Best Practices

### 9.1 Tracing Guidelines

1. **Name spans descriptively** - `GET /api/patients/:id` not `api call`
2. **Add context** - Include relevant IDs, status
3. **Keep spans short** - Don't wrap entire requests
4. **Use appropriate operations** - `db.query`, `http.client`, etc.

### 9.2 Error Guidelines

1. **Don't capture handled errors** - Only unexpected failures
2. **Add context** - User ID, request ID, affected resources
3. **Categorize errors** - api, database, validation, business
4. **Set appropriate levels** - warning vs error vs fatal

### 9.3 Performance Guidelines

1. **Sample appropriately** - 10% in production
2. **Filter noisy data** - Ignore browser extensions
3. **Set baselines** - Alert on deviation, not absolute
4. **Review weekly** - Tune thresholds based on data

---

## 10. Troubleshooting

### Common Issues

**Events not appearing:**
- Check `SENTRY_DSN` is set
- Verify `NODE_ENV` is correct
- Check sampling rates

**Missing traces:**
- Ensure `tracesSampleRate` > 0
- Check `tracePropagationTargets`

**PHI in error reports:**
- Review `beforeSend` hooks
- Check `maskAllInputs` setting

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-21 | Engineering | Initial document |
