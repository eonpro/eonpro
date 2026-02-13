# Airtable Invoice & Refill Setup

Comprehensive guide for matching prescriptions to payments and automating refill scheduling via Airtable → EONPRO.

## Overview

When payments are collected through Airtable (e.g., Fillout + Stripe), the platform needs:

1. **Prescription matching** – medication name and plan duration for the Rx Queue
2. **Refill scheduling** – for 6-month and 12-month plans, queue refills at 90-day intervals (pharmacy BUD limit)

## Airtable Structure

### Tables

| Table     | Purpose                           | Key Columns                                                                 |
| --------- | --------------------------------- | --------------------------------------------------------------------------- |
| **Orders**  | Patient orders, payment status    | `submission_id`, `payment_status`, `order_status`, `customer_email`, `customer_name`, `created_at`, `method_payment_id`, `shipping_address`, `billing_address` |
| **Products**| Product catalog with medication   | `product` (semaglutide, tirzepatide), `medication_type` (injections), `plan` (6-month, monthly, quarterly, 12-month), `$ price`, `stripe_price_id` |

### Critical Field Mapping

| EONPRO Field | Airtable Source                   | Purpose                                             |
| ------------- | --------------------------------- | --------------------------------------------------- |
| `product`     | Products.product                  | Medication name (semaglutide, tirzepatide)         |
| `medication_type` | Products.medication_type      | Delivery form (injections) or strength              |
| `plan`        | Products.plan                     | Duration: monthly, quarterly, 6-month, 12-month    |
| `stripe_price_id` | Order or Product                | Links order to product for lookups                  |
| `created_at`  | Orders.created                    | Prescription date for refill scheduling             |

**Linking**: Orders should link to Products (or look up by `stripe_price_id`) so the webhook receives `product`, `medication_type`, and `plan` with each payment.

## Refill Scheduling Logic

Pharmacy ships 3 months at a time (90-day Beyond Use Date).

| Plan       | Total shipments | Refill dates from prescription |
| ---------- | ---------------- | ------------------------------ |
| 1–3 month  | 1               | N/A (single shipment)          |
| 6-month    | 2               | Day 0 (initial) + Day 90       |
| 12-month   | 4               | Day 0 + Day 90 + Day 180 + Day 270 |

When the invoice webhook receives a 6-month or 12-month plan, it:

1. Creates the invoice → queues initial prescription in Rx Queue
2. Schedules RefillQueue entries for future shipments
3. Cron job processes due refills into the Refill Queue when dates arrive

## Webhook Payload

Send to `POST /api/webhooks/wellmedr-invoice`:

```json
{
  "customer_email": "patient@example.com",
  "method_payment_id": "pm_xxx",
  "patient_name": "John Doe",
  "product": "tirzepatide",
  "medication_type": "injections",
  "plan": "6-month",
  "stripe_price_id": "price_xxx",
  "price": 720,
  "submission_id": "uuid",
  "created_at": "2026-02-12T10:00:00Z",
  "shipping_address": "123 Main St, City, ST 12345"
}
```

## Automation Trigger

- **When**: `payment_status` = "succeeded" AND `method_payment_id` has a value
- **Action**: Run script → fetch product/plan from linked Product → POST to webhook

## See Also

- [WELLMEDR.md](clinics/WELLMEDR.md) – Full invoice webhook and Airtable script
- [docs/clinics/WELLMEDR.md](../clinics/WELLMEDR.md) – Clinic-specific configuration
