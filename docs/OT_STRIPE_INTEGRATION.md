# OT (Overtime) Stripe Integration

This document describes the dedicated Stripe integration for `ot.eonpro.io`.

## Overview

Overtime (OT) has its own Stripe account, separate from:

- EonMeds (platform account)
- Other clinics using Stripe Connect

This is a "dedicated account" integration, similar to how EonMeds is configured.

## Architecture

```
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│   OT Stripe Acct    │──────│  /api/stripe/       │──────│    OT Clinic        │
│   (Dedicated)       │      │  webhook/ot         │      │    (Database)       │
└─────────────────────┘      └─────────────────────┘      └─────────────────────┘
         │                            │                            │
         │ payment_intent.succeeded   │ processStripePayment()     │ Patient match
         │ charge.succeeded           │ processPaymentForCommission│ Invoice create
         │ checkout.session.completed │                            │ Affiliate credit
         │                            │                            │
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# OT Clinic Stripe Account (Dedicated)
OT_STRIPE_SECRET_KEY=sk_live_xxx           # Secret key from OT's Stripe dashboard
OT_STRIPE_WEBHOOK_SECRET=whsec_xxx         # Webhook signing secret
NEXT_PUBLIC_OT_STRIPE_PUBLISHABLE_KEY=pk_live_xxx  # Publishable key (client-side)
```

### Stripe Dashboard Setup

1. **Go to OT's Stripe Dashboard** (not EONpro's platform account)
2. **Navigate to** Developers > Webhooks
3. **Add webhook endpoint:**
   - URL: `https://app.eonpro.io/api/stripe/webhook/ot`
   - Events to send:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`
     - `charge.succeeded`
     - `charge.failed`
     - `charge.refunded`
     - `charge.dispute.created`
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `invoice.finalized`
     - `invoice.sent`

4. **Copy the webhook signing secret** and set it as `OT_STRIPE_WEBHOOK_SECRET`

### Database Setup

Ensure the OT clinic exists with subdomain `ot`:

```sql
SELECT id, name, subdomain FROM "Clinic" WHERE subdomain = 'ot';
```

If not exists, create via admin panel or API.

## Payment Flow

1. **Payment received** in OT's Stripe account
2. **Webhook fires** to `/api/stripe/webhook/ot`
3. **Signature verified** using `OT_STRIPE_WEBHOOK_SECRET`
4. **Patient matching** occurs (by email, phone, or name)
5. **Invoice/Payment records** created for OT clinic
6. **Affiliate commission** triggered if patient has attribution

## Affiliate Conversion Credit

When a patient is created with an affiliate code (via intake form):

- `Patient.attributionAffiliateId` is set
- `Patient.attributionRefCode` stores the code used

When OT processes a payment for this patient:

1. Webhook calls `processPaymentForCommission()`
2. System checks `patient.attributionAffiliateId`
3. If affiliate exists and is active:
   - Commission plan is retrieved
   - Commission amount is calculated
   - `AffiliateCommissionEvent` is created

The affiliate earns credit based on their configured plan.

## Testing

### Using Stripe CLI (Local Development)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to OT's Stripe account
stripe login

# Forward webhooks to local dev server
stripe listen --forward-to http://localhost:3000/api/stripe/webhook/ot

# Copy the webhook signing secret that appears and set as OT_STRIPE_WEBHOOK_SECRET

# In another terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger charge.succeeded
stripe trigger checkout.session.completed
```

### Manual Testing

1. Create a test patient in OT clinic with email `test@example.com`
2. Create a payment in OT's Stripe dashboard with customer email `test@example.com`
3. Check webhook logs: Admin > Webhooks
4. Verify patient was matched and invoice created

### Testing Affiliate Commission

1. Create an affiliate in OT clinic
2. Create a patient with `attributionAffiliateId` set to the affiliate
3. Process a payment for this patient
4. Check `AffiliateCommissionEvent` was created

## Monitoring

### Webhook Logs

Failed webhooks are logged to `WebhookLog` table with:

- `source: 'stripe-ot'`
- `status: 'FAILED'`
- `metadata.clinicSubdomain: 'ot'`

### Payment Reconciliation

All processed payments are logged to `PaymentReconciliation` table with:

- Match method and confidence
- Whether patient was created
- Invoice and payment IDs

### Alerts

Critical payment failures trigger alerts to `PAYMENT_ALERT_WEBHOOK_URL` if configured.

## Financial Reporting

OT has comprehensive financial reporting available at `/api/stripe/reports/ot`.

### Report Types

| Report Type      | Description                                   | Use Case              |
| ---------------- | --------------------------------------------- | --------------------- |
| `executive`      | High-level KPIs and metrics                   | Leadership dashboards |
| `revenue`        | Detailed revenue breakdown with trends        | Financial analysis    |
| `affiliate`      | Affiliate attribution and commission tracking | Partner management    |
| `patients`       | Patient acquisition and lifetime value        | Growth metrics        |
| `transactions`   | Detailed transaction log with filtering       | Accounting            |
| `products`       | Product/treatment performance analysis        | Product management    |
| `reconciliation` | Payment reconciliation for accounting         | Month-end close       |

### API Usage

```bash
# Executive summary (last 30 days)
GET /api/stripe/reports/ot?type=executive

# Revenue report with weekly grouping
GET /api/stripe/reports/ot?type=revenue&groupBy=week&startDate=2026-01-01

# Transaction detail with CSV export
GET /api/stripe/reports/ot?type=transactions&export=csv

# Affiliate performance report
GET /api/stripe/reports/ot?type=affiliate&startDate=2026-01-01&endDate=2026-01-31

# Full reconciliation report
GET /api/stripe/reports/ot?type=reconciliation
```

### Query Parameters

| Parameter   | Type                 | Default     | Description                             |
| ----------- | -------------------- | ----------- | --------------------------------------- |
| `type`      | string               | `executive` | Report type (see above)                 |
| `startDate` | ISO date             | 30 days ago | Start of reporting period               |
| `endDate`   | ISO date             | Today       | End of reporting period                 |
| `groupBy`   | `day`/`week`/`month` | `day`       | Time period grouping                    |
| `export`    | `csv`/`json`         | `json`      | Export format                           |
| `limit`     | number               | `100`       | Max transactions (transactions report)  |
| `cursor`    | string               | -           | Pagination cursor (transactions report) |

### Executive Report KPIs

- **Total Revenue** - Gross revenue from all successful charges
- **Net Revenue** - After refunds
- **Total Transactions** - Count of successful payments
- **Average Order Value** - Revenue / transactions
- **New Patients** - Patients created in period
- **Refund Rate** - Refunds / transactions
- **Dispute Rate** - Disputes / transactions
- **Top Products** - Revenue breakdown by treatment type
- **Daily Revenue Chart** - Day-by-day revenue trend

### Reconciliation Report

The reconciliation report provides accounting-ready data:

- Total charges, refunds, fees, and payouts
- Current Stripe balance (available + pending)
- Expected vs actual balance calculation
- Fee breakdown by type (Stripe fees, etc.)
- Payout history with arrival dates

### Data Isolation

Reports are **strictly isolated** to OT's Stripe account:

1. Endpoint requires admin role + OT clinic access
2. Only super_admins can access without OT clinic context
3. All Stripe API calls use OT's dedicated credentials
4. No cross-clinic data leakage possible

## Files

| File                                                   | Purpose                       |
| ------------------------------------------------------ | ----------------------------- |
| `src/app/api/stripe/webhook/ot/route.ts`               | OT webhook endpoint           |
| `src/app/api/stripe/reports/ot/route.ts`               | OT financial reports endpoint |
| `src/lib/stripe/connect.ts`                            | Multi-tenant Stripe routing   |
| `src/lib/stripe/config.ts`                             | OT Stripe configuration       |
| `src/services/stripe/paymentMatchingService.ts`        | Patient matching logic        |
| `src/services/affiliate/affiliateCommissionService.ts` | Commission processing         |

## Troubleshooting

### Webhook signature verification failed

- Ensure `OT_STRIPE_WEBHOOK_SECRET` is set correctly
- Verify webhook is configured in OT's Stripe dashboard (not another account)
- Check webhook endpoint URL is exactly `https://app.eonpro.io/api/stripe/webhook/ot`

### Payments not matching to patients

- Check patient exists in OT clinic (not another clinic)
- Verify email/phone in Stripe payment matches patient record
- Check `PaymentReconciliation` table for match details

### Affiliate commission not created

- Verify patient has `attributionAffiliateId` set
- Check affiliate is `ACTIVE` status and belongs to OT clinic
- Verify affiliate has an active commission plan assignment
- Check `AffiliateCommissionEvent` table for any existing records

### OT clinic not found error

- Ensure clinic exists with `subdomain = 'ot'`
- Check clinic ID in error logs
