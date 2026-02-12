# EonMeds Stripe Payment Deep Dive

**Problem:** EonMeds receives ~20 Stripe payments per day, but payments are not registering on the platform — no new patient profiles, no invoices in Finance Hub.

**Last Updated:** 2026-02-12

---

## Root Cause: `metadata.clinicId` Gate

### What Happens Today

The main Stripe webhook (`/api/stripe/webhook`) uses a **strict tenant resolution** rule:

1. **Before** any processing, it calls `getClinicIdFromStripeEvent(event)`.
2. This reads `metadata.clinicId` from the event's object (payment_intent, charge, invoice, checkout.session).
3. If `metadata.clinicId` is **missing or empty**, it returns `0`.
4. For **critical payment events** (`payment_intent.succeeded`, `charge.succeeded`, `checkout.session.completed`, `invoice.payment_succeeded`):
   - When `clinicId === 0` → **no-op**: event is queued to DLQ, 200 returned, **no patient created, no invoice recorded**.

```typescript
// From src/app/api/stripe/webhook/route.ts
if (clinicId === 0 && CRITICAL_PAYMENT_EVENTS.includes(event.type)) {
  await queueFailedEvent(event, 'CLINIC_UNRESOLVED: metadata.clinicId missing; no tenant write', body);
  return NextResponse.json({
    received: true, eventId: event.id, processed: false, reason: 'clinic_unresolved'
  });
}
```

### Where Does `metadata.clinicId` Come From?

| Payment Source | Sets `metadata.clinicId`? | Result |
|---------------|---------------------------|--------|
| **Invoices created via our platform** (Admin → Create Invoice) | ✅ Yes (via InvoiceManager) | Processed |
| **Checkout sessions from bundles/discounts** (our API) | ✅ Yes | Processed |
| **Payment intents from ProcessPaymentForm** (our API) | ✅ Yes (via options.metadata) | Processed |
| **Stripe Payment Links created in Stripe Dashboard** | ❌ No | **DROPPED** |
| **Stripe Invoices created in Stripe Dashboard** | ❌ No | **DROPPED** |
| **intake.eonmeds.com** (if it embeds Stripe checkout) | ❌ Usually no | **DROPPED** |
| **Payment links created via our API** | ⚠️ Only if caller passes `metadata: { clinicId: '3' }` | Often missing |

**Conclusion:** Most of the ~20/day payments likely come from:

- Payment Links created directly in Stripe Dashboard
- Invoices sent from Stripe Dashboard
- External checkout flows (e.g., intake form with Stripe embed) that don't add metadata

All of these **never reach** `processStripePayment` because of the `clinicId === 0` gate.

---

## Verification Steps

### 1. Check WebhookLog for Dropped Events

Run this query to see failed events due to missing clinic:

```sql
SELECT 
  id, "eventId", "eventType", "errorMessage", "createdAt",
  payload->>'id' as stripe_event_id,
  payload->'data'->'object'->>'customer_email' as customer_email,
  payload->'data'->'object'->>'amount_total' as amount_cents
FROM "WebhookLog"
WHERE source = 'stripe'
  AND status = 'FAILED'
  AND "errorMessage" ILIKE '%CLINIC_UNRESOLVED%'
  AND "createdAt" >= NOW() - INTERVAL '7 days'
ORDER BY "createdAt" DESC
LIMIT 50;
```

If you see many rows with `payment_intent.succeeded`, `checkout.session.completed`, or `invoice.payment_succeeded`, that confirms the hypothesis.

### 2. Inspect a Sample Payload

```sql
SELECT payload
FROM "WebhookLog"
WHERE source = 'stripe' AND status = 'FAILED'
  AND "errorMessage" ILIKE '%CLINIC_UNRESOLVED%'
  AND "createdAt" >= NOW() - INTERVAL '1 day'
LIMIT 1;
```

Check `data.object.metadata` — it will be empty or lack `clinicId`.

### 3. Run Diagnostic Script

```bash
npx tsx scripts/diagnose-eonmeds-stripe-payments.ts
```

---

## Remediation Options

### Option A: Default clinicId for EonMeds Webhook (Recommended)

**Rationale:** The main webhook uses `EONMEDS_STRIPE_WEBHOOK_SECRET`. Any event that passes signature verification is **from EonMeds' Stripe account**. There is no multi-tenant ambiguity — OT uses a separate endpoint (`/api/stripe/webhook/ot`).

**Change:** When `clinicId === 0` and `DEFAULT_CLINIC_ID` is set, use it as fallback before no-op:

```typescript
// In getClinicIdFromStripeEvent or right after
let clinicId = getClinicIdFromStripeEvent(event);
if (clinicId === 0 && process.env.DEFAULT_CLINIC_ID) {
  const fallback = parseInt(process.env.DEFAULT_CLINIC_ID, 10);
  if (!Number.isNaN(fallback) && fallback > 0) {
    clinicId = fallback;
    logger.info('[STRIPE WEBHOOK] Using DEFAULT_CLINIC_ID fallback (metadata.clinicId missing)', {
      eventId: event.id, eventType: event.type, clinicId: fallback
    });
  }
}
```

**Required env:** `DEFAULT_CLINIC_ID=3` (EonMeds clinic ID)

### Option B: Add metadata.clinicId at Payment Creation

- Configure Stripe Payment Links (created in Dashboard) to use metadata via **Stripe API** after creation.
- Ensure intake.eonmeds.com (or any external checkout) passes `metadata: { clinicId: '3' }` when creating sessions/checkouts.
- **Downside:** Doesn't fix existing Payment Links or manually created invoices; requires changes in every payment source.

### Option C: Manual Reprocessing from DLQ

- Build an admin UI to list failed events in WebhookLog.
- Allow "Reprocess with clinicId=3" for selected events.
- **Downside:** Reactive, doesn't fix the ongoing gap.

---

## Recommended Action

1. **Implement Option A** — default to `DEFAULT_CLINIC_ID` when `metadata.clinicId` is missing on the main webhook.
2. **Set** `DEFAULT_CLINIC_ID=3` in production for EonMeds.
3. **Verify** — after deploy, monitor WebhookLog for new SUCCESS events and PaymentReconciliation for new patient matches.
4. **Optional:** Add metadata to Stripe Payment Links created via our platform (ensure `metadata: { clinicId: '3' }` is always passed when creating links for EonMeds).

---

## Data Flow After Fix

```
Stripe (EonMeds account) → payment_intent.succeeded / checkout.session.completed
         ↓
Webhook receives event
         ↓
clinicId = metadata.clinicId || DEFAULT_CLINIC_ID  (now 3)
         ↓
processStripePayment()
         ↓
Match patient (email/phone/stripeCustomerId) or create new
         ↓
Create Invoice, Payment record, PaymentReconciliation
         ↓
Auto-match refills, affiliate commission, portal invite (if enabled)
```

---

## Related Files

- `src/app/api/stripe/webhook/route.ts` — main webhook, clinicId gate
- `src/services/stripe/paymentMatchingService.ts` — processStripePayment, patient matching
- `prisma/schema.prisma` — WebhookLog, PaymentReconciliation
