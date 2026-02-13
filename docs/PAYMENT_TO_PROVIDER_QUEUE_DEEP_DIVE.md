# Payment → Provider Queue Deep Dive

> **Purpose**: Trace how payments flow from external sources into the provider's prescription queue (Rx Queue). Use this for debugging, onboarding, and understanding the Wellmedr/Stripe integration.

---

## Executive Summary

Payments appear in the **Provider Rx Queue** when:

1. An **Invoice** exists with `status = 'PAID'` and `prescriptionProcessed = false`, **OR**
2. A **RefillQueue** record exists with `status IN ('APPROVED', 'PENDING_PROVIDER')`, **OR**
3. An **Order** exists with `status = 'queued_for_provider'`.

For **Wellmedr**, payments come from the `wellmedr-invoice` webhook (Airtable → EONPRO). The webhook creates a PAID invoice with `prescriptionProcessed` defaulting to `false`, so it immediately appears in the queue.

---

## 1. Provider Queue Data Model

### Queue Sources (3 types)

| Source | Table | Filter | Display Label |
|--------|------|--------|---------------|
| **Paid invoices** | `Invoice` | `status='PAID'` AND `prescriptionProcessed=false` | "New Patient" / Invoice-based |
| **Approved refills** | `RefillQueue` | `status IN ('APPROVED','PENDING_PROVIDER')` | Refill |
| **Admin-queued orders** | `Order` | `status='queued_for_provider'` | Prescription (queued by admin) |

### API Route

```
GET /api/provider/prescription-queue
```

**Authorization**: Provider must be assigned to at least one clinic via `ProviderClinic` or `UserClinic`.

**Query**: Fetches from all clinics the provider can access (`providerService.getClinicIdsForProviderUser`).

---

## 2. Payment Sources → Invoice Creation

### Source A: Wellmedr (Airtable Invoice Webhook)

**Flow**:
```
Patient pays via Wellmedr checkout → Stripe charges their card
       ↓
Airtable receives webhook from Stripe/form → Order record created with method_payment_id (pm_xxx)
       ↓
Airtable automation triggers when method_payment_id is populated
       ↓
POST /api/webhooks/wellmedr-invoice
       ↓
Find patient by email (PHISearchService) or name fallback
       ↓
Create Invoice (status=PAID, prescriptionProcessed=default false)
       ↓
Invoice appears in provider queue
```

**Webhook**: `src/app/api/webhooks/wellmedr-invoice/route.ts`

**Required payload fields**:
- `customer_email` (required) – used to find patient
- `method_payment_id` (required) – must start with `pm_`

**Optional but recommended**:
- `patient_name` / `customer_name` – fallback when email doesn’t match
- `product`, `medication_type`, `plan` – medication display in queue
- `price` / `amount` – cents (price in dollars is auto-converted)
- Address fields – for shipping

**Duplicate prevention**: Uses `metadata.stripePaymentMethodId` to avoid creating a second invoice for the same payment.

**6/12-month plans**: Schedules future refills via `scheduleFutureRefillsFromInvoice` (90, 180, 270 days). Those refills show in queue when due.

### Source B: Stripe (Clinics with Stripe Connect)

**Flow**:
```
Patient pays via EONPRO pay page / Stripe Checkout
       ↓
Stripe webhook: payment_intent.succeeded
       ↓
paymentMatchingService.createPaidInvoiceFromStripe() OR InvoiceManager marks invoice PAID
       ↓
Invoice (status=PAID, prescriptionProcessed=false)
       ↓
Provider queue
```

**Files**:
- `src/services/stripe/paymentMatchingService.ts` – `createPaidInvoiceFromStripe`
- `src/app/api/stripe/webhook/route.ts` – handles Stripe events
- `src/services/billing/InvoiceManager.ts` – marks invoice PAID, sets `prescriptionProcessed`

**Note**: InvoiceManager line 752 sets `prescriptionProcessed: true` when processing a Stripe payment in some flows – that removes the invoice from the queue. The Stripe flow can either create a new invoice (paymentMatching) or update an existing one (InvoiceManager).

### Source C: External Payment (Manual / API)

**Flow**:
```
Admin creates invoice via API with external payment
       ↓
POST /api/stripe/invoices with isMarkedAsPaid / external payment
       ↓
Invoice created with status=PAID
       ↓
Provider queue (prescriptionProcessed defaults to false)
```

**Route**: `src/app/api/stripe/invoices/route.ts`

---

## 3. Invoice Schema (Relevant Fields)

```prisma
model Invoice {
  id                    Int       @id @default(autoincrement())
  patientId             Int
  clinicId              Int
  status                String   // DRAFT, OPEN, PAID, VOID, etc.
  amount                Int      // Cents
  amountPaid            Int
  paidAt                DateTime?
  prescriptionProcessed Boolean  @default(false)  // ← Queue visibility
  prescriptionProcessedAt DateTime?
  prescriptionProcessedBy Int?
  lineItems             Json?    // product, medicationType, plan
  metadata              Json?    // stripePaymentMethodId, product, etc.
  // ...
}
```

**Queue condition**: `status = 'PAID'` AND `prescriptionProcessed = false`.

---

## 4. Provider Queue Display Logic

### Queue Item Construction

For each invoice, the API:

1. **Validates clinic**: Invoice and patient must share the same `clinicId`.
2. **Extracts treatment**: From `metadata.product`, `lineItems[0].product`, or intake document.
3. **GLP-1 info**: From intake `PatientDocument` or metadata (`glp1-last-30`, medication type, etc.).
4. **Medication fallback**: If invoice has plan-only (e.g. "1mo Injections"), medication is derived from intake.
5. **SOAP note**: Fetched for clinical documentation.

### Provider Assignment

Queue is filtered by clinics the provider can work at:

```typescript
const clinicIds = await providerService.getClinicIdsForProviderUser(user.id, user.providerId);
```

Uses:
- `ProviderClinic` (multi-clinic)
- `UserClinic` (user–clinic mapping)
- Legacy `Provider.clinicId` fallback

---

## 5. When Items Leave the Queue

| Action | What happens |
|--------|--------------|
| Provider approves & sends prescription | `prescriptionProcessed = true`, `prescriptionProcessedAt`, `prescriptionProcessedBy` set |
| Provider declines | Same updates; prescription not sent |
| Admin removes from queue | Manual update of `prescriptionProcessed` |
| Refill completed | `RefillQueue.status` updated (e.g. `COMPLETED`) |

---

## 6. Wellmedr-Specific Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WELLMEDR PAYMENT FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

  Patient completes intake (intake.wellmedr.com)
           │
           ▼
  Airtable record created (Onboarding / 2026 Q1 Fillout Intake)
           │
           ├─── INTAKE automation (when Checkout Completed) ───────────────┐
           │                                                               │
           │    POST /api/webhooks/wellmedr-intake                         │
           │         → Create/update Patient                               │
           │         → Create PatientDocument (intake data)                 │
           │         → Generate SOAP note (if checkout complete)           │
           │                                                               │
           ▼                                                               │
  Patient pays (Stripe checkout / form)                                   │
           │                                                               │
           ▼                                                               │
  Airtable Orders table updated (method_payment_id = pm_xxx)                │
           │                                                               │
           └─── INVOICE automation (when method_payment_id has pm_*) ─────┤
                │                                                          │
                │    POST /api/webhooks/wellmedr-invoice                   │
                │         → Find patient by email/name                     │
                │         → Create Invoice (PAID, prescriptionProcessed=f)  │
                │         → Schedule refills (6/12mo plans)                │
                │                                                          │
                ▼                                                          │
  Provider Rx Queue shows item  ◄─────────────────────────────────────────┘
       (Invoice + Patient + Intake doc + SOAP)
```

---

## 7. Troubleshooting

### "Payments not showing in queue"

| Check | Resolution |
|-------|------------|
| Patient not found (404) | Intake webhook must run first. Ensure `customer_email` matches intake email. |
| Invoice created but not in queue | Confirm `prescriptionProcessed = false` and `status = 'PAID'`. |
| Provider sees nothing | Provider must be assigned to Wellmedr clinic (`ProviderClinic` or `UserClinic`). |
| Wrong clinic | Invoice and patient must share `clinicId`. |

### "Duplicate invoices"

- Webhook checks `metadata.stripePaymentMethodId` against existing invoices.
- If Airtable automation fires multiple times for the same payment, duplicates should be blocked.
- If automation sends different `method_payment_id` values for the same payment, duplicates can occur.

### "Wrong medication in queue"

- Invoice `product` / `medication_type` come from Airtable.
- If Airtable sends plan-only (e.g. "1mo Injections"), medication is derived from intake document.
- Ensure Airtable maps `product` to medication (e.g. Tirzepatide), not just plan.

### "Refills not appearing"

- Refills are scheduled only for 6‑month and 12‑month plans.
- Plan is detected via `plan` or product string containing "6 month", "12 month", "annual", etc.
- Refills move to queue when `RefillQueue.status` is `APPROVED` or `PENDING_PROVIDER` and the due date is reached.

---

## 8. Key Code References

| Component | File | Purpose |
|-----------|------|---------|
| Queue GET | `src/app/api/provider/prescription-queue/route.ts` | Fetch invoices, refills, queued orders |
| Queue PATCH/POST | Same file | Mark processed, decline |
| Wellmedr invoice | `src/app/api/webhooks/wellmedr-invoice/route.ts` | Create PAID invoice from Airtable |
| Wellmedr intake | `src/app/api/webhooks/wellmedr-intake/route.ts` | Create patient + document |
| Provider clinics | `src/domains/provider/services/provider.service.ts` | `getClinicIdsForProviderUser` |
| Refill scheduling | `src/lib/shipment-schedule/shipmentScheduleService.ts` | `scheduleFutureRefillsFromInvoice` |

---

## 9. Monitoring

- **Webhook logs**: `[WELLMEDR-INVOICE]` and `[WELLMEDR-INTAKE]` in app logs.
- **Queue metrics**: `/api/provider/prescription-queue/count` for badge/count.
- **Admin RX Queue**: `/admin/rx-queue` – similar data, admin view.
- **Webhook monitor**: `/webhooks/monitor` – success/failure by source.

---

## 10. Environment Variables

| Variable | Purpose |
|----------|---------|
| `WELLMEDR_INTAKE_WEBHOOK_SECRET` | Auth for intake and invoice webhooks |
| `WELLMEDR_INVOICE_WEBHOOK_SECRET` | Optional override for invoice-only |
| `WELLMEDR_CLINIC_ID` | Optional; enforces Wellmedr clinic ID |

---

*Document created: 2026-02-12. For Wellmedr payment → provider queue flow.*
