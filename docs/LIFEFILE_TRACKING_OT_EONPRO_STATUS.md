# Lifefile Tracking Webhook Status — ot.eonpro.io

**Last checked:** 2026-02-24  
**Admin Orders page:** "Prescriptions with active tracking" at `https://ot.eonpro.io/admin/orders`

## Current Integration

| Item | Value |
|------|--------|
| **Webhook URL** | `https://ot.eonpro.io/api/webhooks/ot-shipping` |
| **Method** | POST (tracking updates), GET (health/status) |
| **Auth** | Basic Auth — username/password from **OT clinic** Inbound Webhook Settings |
| **Clinic resolution** | OT clinic = subdomain `ot` or subdomain containing `ot` |
| **Accepted usernames** | `lifehook_user`, `ot_shipping`, `lifefile_webhook`, `lifefile_datapush` (or clinic’s configured username) |

## Why "No orders found" on Admin → Orders

The Orders page only shows **orders/shipments that have a tracking number**. Rows come from:

1. **Order table** — `Order.trackingNumber` is set when a Lifefile webhook updates an existing order (matched by `lifefileOrderId` or patient/order match).
2. **PatientShippingUpdate** — Shipment-only rows (e.g. webhook received but no Order matched yet) with a tracking number; these appear as extra rows with a "Lifefile" badge.

So "No orders found" means one or more of:

- No prescriptions have been **shipped with tracking** yet (Lifefile hasn’t sent any tracking updates).
- **Lifefile is not calling** the webhook (URL/credentials not configured at Lifefile, or wrong URL).
- **Webhook is failing** — auth rejected (401), invalid payload (400), or internal error (500).
- **Order not found** — webhook received but no Order in our DB matches the `orderId` Lifefile sends (e.g. order not yet sent to Lifefile, or ID format mismatch).
- **OT clinic** has **Inbound Webhook disabled** (`lifefileInboundEnabled = false`) or missing credentials.

## Verification Steps

### 1. Health check (no auth)

```bash
curl -s "https://ot.eonpro.io/api/webhooks/ot-shipping"
```

Expected: JSON with `status: 'ok'`, `clinic: <name>`, `inboundEnabled: true`, `configured: true` if credentials are set. If `inboundEnabled: false` or `configured: false`, fix in **Super Admin → Clinics → [OT clinic] → Pharmacy / Inbound Webhook Settings**.

### 2. Confirm Lifefile is calling the right URL

- In Lifefile’s integration/shipping webhook config, the URL must be exactly:  
  `https://ot.eonpro.io/api/webhooks/ot-shipping`
- Username/password must match the OT clinic’s **Inbound Webhook** username and password (from Admin).

### 3. Check WebhookLog (database)

Query for recent OT shipping webhooks:

```sql
SELECT id, "createdAt", status, "statusCode", "errorMessage", "responseData"
FROM "WebhookLog"
WHERE endpoint = '/api/webhooks/ot-shipping'
ORDER BY "createdAt" DESC
LIMIT 20;
```

- **No rows** → Lifefile is not hitting the endpoint (check URL and firewall/Lifefile config).
- **status = INVALID_AUTH, statusCode = 401** → Fix Basic Auth username/password (Lifefile vs clinic settings).
- **status = SUCCESS** but still no orders → Likely "order not found" (see `responseData`); confirm `Order.lifefileOrderId` in DB matches what Lifefile sends in the webhook.

### 4. Application logs

Search logs for:

- `[OT SHIPPING]` — request received, auth result, "Order not found" vs "Matched via strategy", processing time.
- `[OT SHIPPING] No match for order` — webhook received but no Order/patient match; shipment stored as unmatched.

### 5. Order → Lifefile ID flow

For an order to get tracking from the webhook:

1. Prescription is **approved and sent to Lifefile** (Order gets `lifefileOrderId` from Lifefile’s create order response).
2. Lifefile ships and sends a **tracking webhook** with the same `orderId` (and optionally tracking number, carrier, etc.).
3. OT-shipping webhook finds the Order (by `lifefileOrderId` or via `findPatientForShipping`) and updates `Order.trackingNumber` (and creates/updates `PatientShippingUpdate`).
4. Admin Orders page lists orders with `hasTrackingNumber=true`, so that order then appears.

If no prescriptions have been sent to Lifefile yet, or Lifefile hasn’t sent any tracking events, the list will stay empty until the first tracking update is received and matched.

## Quick reference — OT shipping webhook code

- **Route:** `src/app/api/webhooks/ot-shipping/route.ts`
- **Payload normalization:** `src/lib/shipping/normalize-lifefile-payload.ts`
- **Patient/order matching:** `src/lib/shipping/find-patient.ts`
- **Orders list API:** `GET /api/orders/list?hasTrackingNumber=true` (auth required) — `src/app/api/orders/list/route.ts`
- **Doc:** `docs/LIFEFILE_TRACKING_ORDERS_STATE.md` (platform-wide flow and troubleshooting)
