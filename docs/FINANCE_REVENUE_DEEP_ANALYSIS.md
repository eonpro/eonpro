# Finance Revenue Page — Deep Analysis

**Page:** https://eonmeds.eonpro.io/admin/finance/revenue  
**Reference:** PracticeQ/EONPRO Income Reports (practitioner filter, period filter, drill-down, export)  
**Last Updated:** 2026-02-12

---

## Executive Summary

The current Revenue page uses **real data** from `Payment`, `Invoice`, `InvoiceItem`, and `Subscription` tables. However, it lacks several capabilities required for practice-style financial reporting: **provider/sales-rep filters**, **flexible date presets** (day, week, month, quarter, semester, year, custom), **drill-down on amounts** to see underlying transactions, and **export to CSV**. This document audits data sources, identifies gaps, and provides an implementation roadmap.

---

## 1. Current Data Source Audit

### 1.1 Where Revenue Data Comes From

| Metric | Data Source | Tables | Real Data? |
|--------|-------------|-------|------------|
| **Gross Revenue** | Successful payments | `Payment` (status=SUCCEEDED) | ✅ Yes |
| **Net Revenue** | Gross minus fees | `Payment` | ⚠️ Fees not tracked (net = gross) |
| **Refunds** | Refunded payments | `Payment` (status=REFUNDED) | ✅ Yes |
| **Revenue Trends** | Daily/weekly/monthly aggregation | `Payment` | ✅ Yes |
| **MRR / Subscriptions** | Active subscriptions | `Subscription` (status=ACTIVE) | ✅ Yes |
| **Revenue by Product** | Paid invoice line items | `Invoice` (PAID) + `InvoiceItem` + `Product` | ⚠️ Partial* |
| **Revenue by Payment Method** | Payment method field | `Payment.paymentMethod` | ⚠️ Often null** |
| **Forecast** | Historical payment aggregates | `Payment` | ✅ Yes (linear regression) |

\* **Revenue by Product gap:** Stripe webhook-created invoices use `lineItems` in metadata but do **not** create `InvoiceItem` records with `productId`. Only invoices created via `InvoiceManager` with structured line items contribute to product revenue. Payments from Payment Links, IntakeQ, etc. appear in gross revenue but not in product breakdown.

\** **Payment method gap:** `createPaidInvoiceFromStripe` does not set `Payment.paymentMethod`. The field is often `null`, so "Revenue by Payment Method" may show mostly "unknown" unless payments come from other flows (e.g. platform checkout) that set it.

### 1.2 Payment Flows That Feed Revenue

| Flow | Creates Payment? | Creates Invoice? | InvoiceItem? | clinicId Set? |
|------|------------------|------------------|-------------|---------------|
| Stripe webhook (payment_intent.succeeded) | ✅ | ✅ | ❌ (metadata only) | ✅ |
| Admin Create Invoice + Stripe pay | ✅ | ✅ | ✅ | ✅ |
| Stripe Invoice paid (invoice.payment_succeeded) | ✅ | ✅ | Depends | ✅ |
| Payment Links / IntakeQ (via webhook) | ✅ | ✅ | ❌ | ✅ (with DEFAULT_CLINIC_ID) |
| Platform checkout (bundles, etc.) | ✅ | ✅ | ✅ | ✅ |
| Subscription renewal | ✅ | ✅ | ✅ | ✅ |
| Wellmedr invoice webhook | ✅ | ✅ | Varies | ✅ |
| Manual payment (non-Stripe) | ⚠️ Varies | ✅ | Varies | Varies |

**Conclusion:** Revenue is driven by real payments. The main gaps are (1) product attribution for Stripe-only payments, (2) payment method often unset, and (3) no single view for "Client Income" vs "Insurance Income" vs "Adjustments" as in PracticeQ.

### 1.3 Additional Data Sources (Not Yet in Revenue)

| Source | Model | In Revenue? | Notes |
|--------|-------|-------------|-------|
| Payment Links | `Payment` (via webhook) | ✅ | Yes, via Stripe webhook |
| Rebilling (subscription renewals) | `Subscription` + `Invoice` + `Payment` | ✅ | MRR + Payment |
| Memberships | `Subscription` | ✅ | Via MRR |
| Invoices created on platform | `Invoice` + `InvoiceItem` | ✅ | Via product breakdown |
| Commission / affiliate | `Commission` | ❌ | Separate finance area |
| RefillQueue payments | `RefillQueue` + `Invoice` | ✅ | Invoice creates Payment |

---

## 2. Gap Analysis vs. PracticeQ Requirements

### 2.1 Filter by Provider

**Requirement:** "by providers"

**Current State:** No provider filter. Revenue is clinic-scoped only.

**Data Model:** 
- `Invoice` has `patientId`; `Order` has `providerId`, `assignedProviderId`
- `RefillQueue` has `providerId`, `assignedProviderId`
- No direct `providerId` on `Invoice` or `Payment`

**Approach:** Link revenue to provider via:
1. **Invoice → Order** (if invoice is from order)
2. **Invoice → RefillQueue** (refill invoice has provider)
3. **Patient → most recent Order/RefillQueue** as fallback

Alternatively, add `assignedProviderId` to Invoice for cleaner attribution (schema change).

### 2.2 Filter by Sales Rep

**Requirement:** "by sales rep"

**Current State:** No sales rep filter.

**Data Model:** `PatientSalesRepAssignment` links `patientId` to `salesRepId` (User). Active assignments have `isActive: true`.

**Approach:** Join Invoice/Payment → Patient → PatientSalesRepAssignment (active) → filter by salesRepId.

### 2.3 Date Range Presets

**Requirement:** "by date of all payments received in a single day, week, month, quarter, semesters, year and custom dates"

**Current State:** 
- Presets: 7d, 30d, 90d, 12m
- Missing: **single day**, **quarter**, **semester**, **custom range**
- No date picker for custom start/end

**Implementation:** Add:
- `1d` (today or selected day)
- `quarter` (current quarter, e.g. Q1 2026)
- `semester` (H1: Jan–Jun, H2: Jul–Dec)
- Custom: date range picker (start, end)

### 2.4 Drill-Down on Amounts

**Requirement:** "when you click on the numbers you can see what transactions make up those amounts"

**Current State:** All numbers are static. No click handlers, no modal/drawer with transaction list.

**Implementation:** 
1. Make summary cards and chart segments **clickable**
2. Click opens modal/drawer with filtered transaction list (Payment + Invoice)
3. Query: same date range + any additional filters (provider, sales rep, payment method)
4. Display: Date, Patient, Amount, Payment Method, Invoice #, Provider (if available)
5. Link to Invoice detail page
6. Export to CSV from detail view

### 2.5 Income Report Structure (PracticeQ-Style)

**Requirement:** UI/UX that matches PracticeQ income reports.

**PracticeQ Structure:**
- **Client Income:** Client Payments (Stripe), Refunds, Coupons/Discounts
- **Insurance Income:** Insurance Payments, Refunds (if applicable)
- **Adjustments:** Credits, write-offs
- **Total Income**

**Current State:** We show Gross Revenue, Net Revenue, MRR, Refunds. Different structure.

**Implementation:** Add an "Income Report" view or tab that mirrors PracticeQ:
- Client Payments (Stripe + other) = Sum of Payment SUCCEEDED
- Client Refunds = Sum of Payment REFUNDED
- Client Coupons = from Discount/Coupon usage (if tracked)
- Insurance = $0 unless we have insurance payment flow
- Adjustments = manual adjustment ledger (would need new model if not exists)

### 2.6 Export

**Requirement:** Export capability (CSV for transaction details).

**Current State:** Export button exists but is not wired.

**Implementation:** Wire Export to:
- Summary: CSV of aggregated numbers (period, gross, net, refunds, etc.)
- Detail: CSV of transactions (date, patient, amount, method, invoice, provider)

---

## 3. API Changes Required

### 3.1 Revenue API (`/api/finance/revenue`)

| Change | Description |
|--------|-------------|
| Add `providerId` query | Filter payments by provider (via invoice/order/refill) |
| Add `salesRepId` query | Filter by patient's assigned sales rep |
| Add `startDate`, `endDate` | Custom date range (overrides range preset) |
| Add `preset` | `1d`, `7d`, `30d`, `90d`, `12m`, `quarter`, `semester`, `custom` |

### 3.2 New Endpoint: Transaction Detail

```
GET /api/finance/revenue/transactions?
  startDate=2026-02-01
  &endDate=2026-02-12
  &providerId=5        (optional)
  &salesRepId=10       (optional)
  &paymentMethod=card  (optional)
  &limit=200
  &offset=0
```

**Response:** List of transactions (Payment + linked Invoice, patient name decrypted, provider name) for drill-down and export.

---

## 4. UI/UX Changes Required

### 4.1 Revenue Page Enhancements

1. **Filter Bar**
   - Practitioner dropdown (Providers at clinic)
   - Sales Rep dropdown (Users with SALES_REP role)
   - Period preset: Day | Week | Month | Quarter | Semester | Year | Custom
   - Custom: date range picker (start, end)
   - Generate button

2. **Clickable Amounts**
   - Gross Revenue card → opens Transaction Detail modal
   - Refunds card → opens Refund transactions
   - Chart data points → same, filtered by that bucket's date range
   - Revenue by Product row → transactions for that product
   - Revenue by Payment Method card → transactions for that method

3. **Transaction Detail Modal**
   - Table: Date | Patient | Amount | Method | Invoice | Provider
   - Invoice # links to `/admin/finance/invoices/[id]`
   - Export to CSV button
   - Pagination if > 50 rows

4. **Export**
   - Summary export: period, totals (CSV)
   - Detail export: from transaction modal (CSV)

### 4.2 Visual Alignment with Platform

- Use existing Financial Hub styling: `#efece7` background, emerald accents, clean cards
- Match table styling from Invoices, Incoming Payments
- Reuse existing modal/drawer patterns
- Ensure mobile responsiveness

---

## 5. Data Quality Improvements

### 5.1 Payment Method Population

**Problem:** `Payment.paymentMethod` often null for Stripe-created payments.

**Fix:** In `createPaidInvoiceFromStripe` and when processing Stripe payments, fetch Charge from Stripe and set:
```typescript
paymentMethod: charge?.payment_method_details?.card?.brand 
  ? `card_${charge.payment_method_details.card.brand}` 
  : 'stripe'
```

Or map to: `visa`, `mastercard`, `amex`, `link`, `ach_debit`, etc.

### 5.2 Product Attribution for Stripe-Only Payments

**Problem:** Payments from Payment Links/createPaidInvoiceFromStripe don't create InvoiceItem with productId.

**Options:**
- A) Add default "Stripe Payment" product for line-item-less invoices
- B) Create InvoiceItem with productId=null, productName from description
- C) Leave as-is; product breakdown only covers structured invoices (document limitation)

**Recommendation:** B — create InvoiceItem with productId null, productName from payment description. Enables "Other / Stripe" in product breakdown.

---

## 6. Implementation Phases

### Phase 1: Filters & Date Range (1–2 days)
- [ ] Add `providerId`, `salesRepId`, `startDate`, `endDate`, `preset` to revenue API
- [ ] Extend RevenueAnalyticsService with provider/salesRep filtering
- [ ] Add preset options: 1d, quarter, semester, custom
- [ ] Add date range picker for custom
- [ ] Update Revenue page filter bar

### Phase 2: Transaction Detail API & Drill-Down (1–2 days)
- [ ] Create `GET /api/finance/revenue/transactions`
- [ ] Make summary cards and chart segments clickable
- [ ] Add Transaction Detail modal with table
- [ ] Link Invoice # to invoice detail page

### Phase 3: Export (0.5 day)
- [ ] Wire Export button for summary CSV
- [ ] Add Export to CSV in transaction detail modal
- [ ] Use existing CSV generation patterns

### Phase 4: Data Quality (1 day)
- [ ] Populate `Payment.paymentMethod` from Stripe Charge in payment flows
- [ ] Create InvoiceItem for Stripe-only invoices (productName from description)
- [ ] Backfill payment method for existing records (optional migration)

### Phase 5: PracticeQ-Style Income Report (Optional, 1–2 days)
- [ ] Add "Income Report" tab or dedicated view
- [ ] Structure: Client Income (Stripe, Refunds, Coupons), Insurance, Adjustments
- [ ] Match PracticeQ layout and copy

---

## 7. Related Files

| File | Purpose |
|------|---------|
| `src/app/admin/finance/revenue/page.tsx` | Revenue page UI |
| `src/app/api/finance/revenue/route.ts` | Revenue API |
| `src/services/analytics/revenueAnalytics.ts` | Revenue analytics logic |
| `src/services/stripe/paymentMatchingService.ts` | Stripe payment → Invoice/Payment creation |
| `prisma/schema.prisma` | Payment, Invoice, InvoiceItem, PatientSalesRepAssignment |

---

## 8. Verification Checklist

Before considering the revenue page "complete":

- [ ] All revenue numbers come from `Payment` and `Invoice` (no mock data)
- [ ] Stripe, Payment Links, platform invoices, rebilling, memberships all flow into Payment/Invoice
- [ ] Can filter by provider
- [ ] Can filter by sales rep
- [ ] Can select: single day, week, month, quarter, semester, year, custom range
- [ ] Clicking amounts opens transaction detail
- [ ] Transaction detail shows real payments with patient, invoice, amount
- [ ] Export produces valid CSV
- [ ] UI matches platform aesthetic (#efece7, emerald, clean tables)
