# Lifefile Tracking Updates → Admin Orders Page

## Summary

When Lifefile sends tracking updates for prescriptions, they **are** integrated and shown on the **Admin → Orders** page ("Prescriptions with active tracking"). This doc describes the current flow and where updates land.

## Where tracking updates are received

The platform has **three** webhook entry points that can update order tracking:

| Endpoint | Purpose | What gets updated |
|----------|---------|-------------------|
| `POST /api/webhooks/lifefile/prescription-status` | Prescription status (Basic Auth, clinic by username) | **Order**: `status`, `trackingNumber`, `trackingUrl`, `lastWebhookAt`, `lastWebhookPayload`; **OrderEvent** for audit |
| `POST /api/webhooks/lifefile/inbound/[clinicSlug]` | Unified inbound (Basic Auth + optional HMAC) | **Shipping path**: updates **Order** + creates **PatientShippingUpdate** + OrderEvent. **Prescription path**: updates **Order** only + OrderEvent |
| `POST /api/webhooks/lifefile-data-push` | Data push (Basic Auth, clinic by username) | **Order**: `status`, `shippingStatus`, `trackingNumber`, `trackingUrl`, `lastWebhookAt`, `lastWebhookPayload`; **OrderEvent** |

All three look up the order by `lifefileOrderId` or `referenceId` (scoped to clinic). If the order is found, they update the **Order** row with tracking and status. The inbound webhook’s **shipping** path also creates a **PatientShippingUpdate** row linked to that order.

## How the Orders page gets its data

- **API:** `GET /api/orders/list?hasTrackingNumber=true` (auth required).
- **Orders with tracking:** From `orderService.listOrders(userContext, { hasTrackingNumber: true })`, which returns orders where `trackingNumber` is not null (order repository filter: `trackingNumber: { not: null }`). So any Order updated by one of the webhooks above with a tracking number will appear.
- **Shipment-only rows:** The list route also loads **PatientShippingUpdate** rows (with `trackingNumber`) that are not already represented by an order in that list (e.g. `orderId` null or not in the returned order set). Those are converted to order-like rows and merged in, with `_isShipmentOnly: true` and the orange **Lifefile** badge in the UI.

So:

- **Lifefile → Order update (any of the three webhooks)** → Order has `trackingNumber` → appears on Orders page as a normal order row (status, tracking number, tracking link). No "Lifefile" badge unless the row came from the **PatientShippingUpdate** merge (see below).
- **Lifefile inbound shipping** → Order updated **and** PatientShippingUpdate created with `orderId` set → Orders page shows the order from the Order list; the shipment row is not added again as "shipment-only" because it’s tied to that order.
- **Shipment-only (e.g. Wellmedr shipping webhook or manual)** → PatientShippingUpdate with no or unrelated order → shown as extra row with **Lifefile** badge.

## Current state: what works

1. **Order found by Lifefile:** When Lifefile sends status/tracking with an `orderId`/`referenceId` that matches an existing Order (same clinic), that Order is updated and appears on Admin Orders with status, tracking number, and tracking link.
2. **Clinic isolation:** All webhooks resolve the clinic (by Basic Auth username or path) and restrict order lookup to that clinic.
3. **Audit:** OrderEvent (and optionally WebhookLog) record each update.
4. **Badge:** The orange "Lifefile" label on the Orders page is shown only for rows that come from **PatientShippingUpdate** and are displayed as shipment-only (i.e. not already represented by an Order in the list). Orders that were updated by Lifefile but appear via the Order list do **not** show the badge unless we add a separate rule (e.g. show badge when `lifefileOrderId` is set).

## Optional improvements

1. **Show "Lifefile" for all Lifefile-sourced orders**  
   In `src/app/admin/orders/page.tsx`, you could show the Lifefile badge when `order.lifefileOrderId` is set (in addition to or instead of only when `_isShipmentOnly`), so every order that came from Lifefile is visually tagged.

2. **Order not found**  
   If Lifefile sends tracking for an order we don’t have (e.g. different system, wrong clinic, or timing), the webhooks currently do not create a **PatientShippingUpdate** or any other row, so nothing appears on the Orders page. If you need to show “unknown” shipments, you’d need a policy (e.g. create a PatientShippingUpdate when patient can be inferred from payload, with `orderId` null).

3. **Medication column**  
   The Orders table shows **Medication** from `primaryMedName` / `primaryMedStrength` on the Order (or from the linked order/shipment for shipment-only rows). If medication shows as "-", ensure Order creation (or the flow that creates the order) sets `primaryMedName`/`primaryMedStrength`, or that shipment-only rows have medication fields populated where applicable.

## Verification

- **Webhook config:** Ensure at least one of the three endpoints is configured in Lifefile (and, for inbound, that the clinic’s inbound path and credentials are set in Admin).
- **Logs:** Search for `[LIFEFILE PRESCRIPTION]`, `[LIFEFILE INBOUND]`, or `[LIFEFILE DATA PUSH]` in app logs; check **WebhookLog** for the relevant endpoints to confirm receipt and success/failure.
- **Orders page:** After a test tracking update, reload Admin → Orders with `hasTrackingNumber=true`; the corresponding order should appear with updated status and tracking within one page load (no polling today).

---

## Troubleshooting: Why updates might not be happening

### 1. Order not found (most common)

**Symptom:** Webhook returns 200/202 with `processed: false` or "Order not found"; no change on Orders page.

**Causes and fixes:**

- **Payload shape:** Lifefile may send `orderId` / `referenceId` inside a nested object (e.g. `order.orderId`, `data.orderId`, `prescription.orderId`). The code now uses a shared extractor (`@/lib/webhooks/lifefile-payload`) that checks top-level, `order`, `data`, `prescription`, and `rx`, and supports `order_id` / `reference_id` (snake_case). If you see "Missing orderId or referenceId" or "Order not found" in logs, capture a sample payload and confirm the extractor is reading the right path.
- **ID type mismatch:** We store `lifefileOrderId` as string and normalize incoming values to string before lookup. If Lifefile sends a different identifier than the one we stored at approve-and-send (e.g. external ID vs internal ID), lookup will fail. Confirm in DB that `Order.lifefileOrderId` matches what Lifefile sends in the webhook.
- **Wrong clinic:** Prescription-status and data-push resolve clinic by **matching the Basic Auth password** against any clinic with inbound enabled; the **first** matching clinic wins. If multiple clinics share the same password, updates can apply to the wrong clinic and the order (in the other clinic) won’t be found. Use distinct passwords per clinic or use the **inbound** endpoint (clinic by URL path) for per-clinic routing.
- **Order not sent yet:** If the webhook fires before the order is approved/sent to Lifefile, we don’t have `lifefileOrderId` yet. Ensure the flow is: create order → approve and send to Lifefile (sets `lifefileOrderId`) → then Lifefile sends tracking to the webhook.

**Check:** In app logs, look for `[LIFEFILE ...] Order not found` or `No orderId or referenceId`; log lines now include `orderId`, `referenceId`, and `payloadKeys` to help match payload to our lookup.

### 2. Authentication / authorization

- **Prescription-status & data-push:** Username must be one of `wellmedr_shipping`, `lifefile_webhook`, `lifefile_datapush`. Password must match the **decrypted** inbound password for a clinic that has `lifefileInboundEnabled` and a non-null inbound password. If decryption fails for that clinic, auth can fail.
- **Inbound:** Clinic is resolved by URL path (`lifefileInboundPath` = `clinicSlug`). Basic Auth must match that clinic’s inbound username/password. If **HMAC secret** is set, the request must include a valid `x-webhook-signature` (or `x-lifefile-signature` / `x-signature`) header; otherwise the handler returns 401 and the payload is not processed.

### 3. Event type (inbound only)

If the clinic’s **Inbound Webhook Settings** has an "Allowed events" list, the incoming `type` / `eventType` must match (we use `eventType.includes(allowed)`). If Lifefile sends e.g. `order_shipped` and allowed events don’t include something like `shipping` or `order`, the webhook returns 400 and the update is not applied. Ensure allowed events include the event types Lifefile actually sends for tracking (e.g. shipping, order, prescription).

### 4. PatientShippingUpdate create (inbound shipping path only)

When we find an order and update it, we also create a **PatientShippingUpdate** for the shipping path. That create requires `clinicId`, `trackingNumber`, and `carrier` (and an enum `status`). If the create fails (e.g. missing `clinicId` on the order, or invalid status), we log a warning and still leave the **Order** updated—so tracking should still appear on the Orders page. If the Order is updated but the row doesn’t show up, confirm the list API is using `hasTrackingNumber=true` and that the Order row has `trackingNumber` set.

### 5. How to verify end-to-end

1. **WebhookLog:** Query `WebhookLog` for the endpoint you use (`/api/webhooks/lifefile/prescription-status`, `/api/webhooks/lifefile/inbound/<slug>`, or `/api/webhooks/lifefile-data-push`). Check `status`, `statusCode`, `responseData`, and `errorMessage`. If `responseData.reason === 'Order not found'` or `details.reason === 'Missing orderId or referenceId'`, the issue is lookup (see §1).
2. **Application logs:** Search for `[LIFEFILE PRESCRIPTION]`, `[LIFEFILE INBOUND]`, or `[LIFEFILE DATA PUSH]`. You should see "Processing" with clinic and order/reference IDs, then either "Processed" or "Order not found" / "No orderId or referenceId".
3. **Database:** For a known prescription, confirm `Order.lifefileOrderId` and `Order.referenceId` match what Lifefile sends. After sending a test webhook, confirm `Order.trackingNumber`, `Order.trackingUrl`, and `Order.lastWebhookAt` are updated.
4. **Orders page:** Call `GET /api/orders/list?hasTrackingNumber=true` (as an admin) and confirm the order appears with the new tracking data.
