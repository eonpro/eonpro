# EonMeds Stripe Sync Runbook

**Problem:** Stripe "Eon Meds / IntakeQ" shows 10,000+ transactions, but the EonMeds clinic platform shows far fewer—payments never synced due to webhook gaps (missing `metadata.clinicId`, Payment Links, IntakeQ checkout, etc.).

**Last Updated:** 2026-02-12

---

## Summary

The platform can **sync payments directly from Stripe** via the Payment Reconciliation Admin API, without relying on webhooks. Use this runbook to backfill and reconcile the gap between Stripe and the EonMeds platform.

---

## Prerequisites

| Requirement | How to Verify |
|-------------|---------------|
| `EONMEDS_STRIPE_SECRET_KEY` | Must match the "Eon Meds / IntakeQ" Stripe account |
| `DEFAULT_CLINIC_ID=3` | Set in production (Vercel) so synced payments are attributed to EonMeds |
| Admin/Super Admin access | Required to call the reconciliation API |

---

## API Actions

### 1. Fetch Missing Payments (Dry Run)

Discover which Stripe payments are not yet in the platform:

```bash
curl -X POST https://eonmeds.eonpro.io/api/admin/payment-reconciliation \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "fetch_stripe_payments",
    "days": 30,
    "limit": 500
  }'
```

**Response:**
```json
{
  "success": true,
  "total": 150,
  "processed": 45,
  "missing": 105,
  "hasMore": true,
  "missingPayments": [
    {
      "id": "pi_xxx",
      "amount": 32900,
      "currency": "usd",
      "created": "2026-02-12T...",
      "customerEmail": "patient@example.com",
      "customerId": "cus_xxx",
      "description": "..."
    }
  ]
}
```

### 2. Sync Missing Payments (Bulk)

Process up to 100 missing payments per request. Call repeatedly until `syncSummary.missingInBatch` is 0 and `hasMore` is false.

```bash
curl -X POST https://eonmeds.eonpro.io/api/admin/payment-reconciliation \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "sync_from_stripe",
    "days": 90,
    "batchSize": 50,
    "clinicId": 3
  }'
```

**Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| `days` | 30 | Look back period (days) |
| `batchSize` | 50 | Max payments to process per request (1–100) |
| `clinicId` | `DEFAULT_CLINIC_ID` | Clinic to attribute synced payments to (EonMeds = 3) |
| `endingBefore` | — | Pass `syncSummary.endingBefore` from previous response to fetch the next (older) page |

**Response:**
```json
{
  "success": true,
  "syncSummary": {
    "processed": 48,
    "failed": 2,
    "total": 50,
    "hasMore": true,
    "missingInBatch": 52,
    "endingBefore": "pi_xxx"
  },
  "results": [
    { "id": "pi_xxx", "success": false, "error": "Duplicate key..." }
  ]
}
```

### 3. Process Single Missing Payment

For a specific Payment Intent ID (e.g. from Stripe Dashboard):

```bash
curl -X POST https://eonmeds.eonpro.io/api/admin/payment-reconciliation \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "process_missing_payment",
    "paymentIntentId": "pi_xxxxxx",
    "clinicId": 3
  }'
```

`clinicId` is optional if `DEFAULT_CLINIC_ID` is set.

---

## Syncing 10,000+ Transactions

Use a loop and the `endingBefore` cursor to walk through the full backlog:

1. **First run:** `days: 365`, `batchSize: 100`
2. **If `syncSummary.endingBefore` is returned:** Use it for the next request: `{ ..., "endingBefore": "pi_xxx" }`
3. **Repeat** until `processed` is 0 and `endingBefore` is null (no more pages)

```bash
# Example: Loop until done (pseudo-code)
# Call sync_from_stripe repeatedly, passing endingBefore from each response
# Stop when processed is 0 and no endingBefore is returned
```

**Tips:**
- Run during off-peak hours to avoid timeouts
- If timeouts occur, reduce `batchSize` to 25–30
- For ongoing sync, run `sync_from_stripe` daily with `days: 1` to catch new payments

---

## What Gets Created

For each synced payment:

1. **Patient** — Matched by email, phone, or name; or created if none found  
2. **Invoice** — Status `PAID`, linked to patient and Stripe payment  
3. **PaymentReconciliation** — Audit record (`status`: MATCHED or CREATED)  
4. **Optional** — Portal invite if clinic has `autoInviteOnFirstPayment` enabled  

---

## Troubleshooting

### Sync returns `processed: 0` but Stripe has payments

1. Confirm `EONMEDS_STRIPE_SECRET_KEY` is for the "Eon Meds / IntakeQ" account.  
2. Check Stripe Dashboard → Developers → API keys — the secret key must match.  
3. Verify `DEFAULT_CLINIC_ID=3` (or pass `clinicId: 3` explicitly).

### Duplicate patient or invoice errors

Some payments may already exist in the platform (e.g. partially synced). The API returns per-payment errors in `results`; those are skipped, others are processed.

### Timeout on large batch

Reduce `batchSize` to 25–30. Run multiple requests instead of one large batch.

---

## Related Docs

- [EONMEDS_STRIPE_PAYMENT_DEEP_DIVE.md](./EONMEDS_STRIPE_PAYMENT_DEEP_DIVE.md) — Root cause and webhook fix  
- [INVOICE_PHI_DECRYPTION.md](./INVOICE_PHI_DECRYPTION.md) — Decrypting patient data on invoices  
