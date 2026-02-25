# Wellmedr: Stripe Payment Not Syncing to Patient Profile / Refill Queue

## Problem

A patient was charged in Stripe (e.g. subscription renewal on Feb 23) but the payment did not appear on their profile on wellmedr.eonpro.io. This blocks:

- **Refill handling** – the system does not know the patient has paid for the next cycle.
- **RX queue** – refill timing is not recognized, so "time for refill" is not triggered.

Example: **Denielle Gallagher** (nell4755@gmail.com) – Stripe shows a successful "Subscription update" payment of $269.99 on Feb 23; the platform Billing & Payments may show "No payment methods saved" and refill eligibility may be wrong.

---

## How Stripe → Platform Sync Is Supposed to Work

1. **Stripe** charges the customer (subscription renewal or one-off).
2. **Stripe** sends a webhook to the platform (e.g. `invoice.payment_succeeded` or `payment_intent.succeeded`).
3. **Platform** resolves **clinic** (see below), then:
   - **Invoice path**: Finds our `Invoice` by `stripeInvoiceId` and updates status to PAID; optionally creates subscriptions and triggers refill.
   - **Refill path**: For subscription renewals, finds our `Subscription` by `stripeSubscriptionId` and creates a refill queue entry (PENDING_ADMIN).
4. **Profile** shows paid invoice / payment methods; **Refill Queue** shows the next refill when due.

If any step fails, the charge stays in Stripe but does not update the profile or refill queue.

---

## Root Causes (Why Payment Might Not Report Back)

### 1. **Clinic not resolved from the webhook (fixed for Connect)**

The webhook only processed events when it could determine **which clinic** the event belonged to. It used:

- `metadata.clinicId` on the Stripe object (invoice, payment_intent, etc.).
- Fallback: `DEFAULT_CLINIC_ID` (e.g. for EonMeds).

**Wellmedr uses Stripe Connect.** Subscription and invoice events from Connect include `event.account` (the connected account id), but the code did **not** use it. So for Wellmedr, `clinicId` was 0 and **critical payment events were no-op’d** (logged as "clinic_unresolved", 200 returned to Stripe, no DB update).

**Fix (implemented):** The main Stripe webhook now resolves clinic from **Stripe Connect `event.account`**: if `metadata.clinicId` and `DEFAULT_CLINIC_ID` are not set, it looks up `Clinic` by `stripeAccountId = event.account`. Wellmedr’s Connect events are now attributed to the correct clinic.

**Verify:** Wellmedr’s clinic record must have `stripeAccountId` set to the Stripe Connect account id (e.g. `acct_xxx`). Admin → Clinic → Stripe Connect should show the account linked.

### 2. **Webhook not received or wrong endpoint/secret**

If the Wellmedr Stripe account (or Connect) is not sending events to the platform, or uses the wrong URL/secret:

- Events never reach the app, or
- Signature verification fails (400), and Stripe retries then gives up.

**Check:**

- Stripe Dashboard → Developers → Webhooks: which endpoint URL and which events are configured (e.g. `invoice.payment_succeeded`, `payment_intent.succeeded`).
- For Connect: "Listen to events on connected accounts" must be enabled for the endpoint that receives Wellmedr events.
- The endpoint must use the **same** signing secret as in the app (e.g. `EONMEDS_STRIPE_WEBHOOK_SECRET` or the one used by the platform for that URL).
- Stripe Dashboard → Webhooks → [your endpoint] → Recent deliveries: confirm recent `invoice.payment_succeeded` (or similar) for the patient’s charge and that responses are 200.

### 3. **Invoice not in our database (common for subscription renewals)**

`StripeInvoiceService.updateFromWebhook(invoice)` looks up our invoice by **`stripeInvoiceId`**. We only store that when **we** create the invoice in Stripe (e.g. from the platform or wellmedr-invoice flow). For **subscription renewals**, Stripe creates the invoice automatically; we often do **not** create a matching row. So:

- The webhook runs and tries to update an invoice that doesn’t exist.
- We log: `[STRIPE] Invoice in_xxx not found in database` and return (no update).

So the **invoice** line may not show PAID from the renewal, but the **refill** path (step 4 below) can still run if we have a local Subscription.

### 4. **No local Subscription linked to the Stripe subscription**

Refill for subscription renewals is triggered by:

- `invoice.payment_succeeded` with a subscription id, and
- A **local** `Subscription` row with `stripeSubscriptionId` = that Stripe subscription id.

If the patient’s Stripe subscription was never synced (e.g. created in Stripe only, or before we linked Connect), there is no such row, so we do not create a refill queue entry.

**Fix:** Run the Wellmedr Stripe subscription sync so that Stripe subscriptions are matched to patients by email and upserted into our `Subscription` table (and `patient.stripeCustomerId` set when missing). The script lists **active** subscriptions only by default and expands product so plan names (e.g. "Tirzepatide Injection - 3 Month Supply") and refill fields (vialCount, refillIntervalDays) are correct:

```bash
# Dry run: see counts and sample rows (no DB writes)
npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts

# Apply: create/update Subscription records and link stripeCustomerId
npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --execute

# Include canceled/past_due (e.g. for history)
npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --all --execute
```

After sync, **future** renewal webhooks will find the local Subscription and trigger refill. For the **already missed** renewal (e.g. Feb 23), you can:

- Manually add a refill or mark payment verified in Refill Queue, or
- Re-run sync so the subscription is linked and then rely on the next renewal, or
- Use manual enrollment / manual refill if your workflow allows it.

---

## Checklist for “Patient charged in Stripe but not on profile”

Use this for a specific patient (e.g. Denielle Gallagher, nell4755@gmail.com).

| Step | What to check | Where / How |
|------|----------------|--------------|
| 1 | Webhook received | Stripe Dashboard → Webhooks → endpoint → Recent deliveries: `invoice.payment_succeeded` (or relevant event) for that date; response 200. |
| 2 | Clinic resolved | App logs: `[STRIPE WEBHOOK] Resolved clinic from Connect account` with correct `clinicId` and `accountId`. If missing, confirm Wellmedr clinic has `stripeAccountId` and that events include `account`. |
| 3 | Local Subscription | DB or Admin: patient has a Subscription with `stripeSubscriptionId` equal to the Stripe subscription id (e.g. `sub_xxx` from Stripe customer page). If not, run `sync-wellmedr-stripe-subscriptions.ts --execute`. |
| 4 | Refill created | After (1)–(3), next renewal should create a RefillQueue entry. For the missed one: Refill Queue → verify payment or add manual refill. |
| 5 | Invoice row (optional) | If you need the renewal to show as an invoice on the profile: our DB only has invoices we created. Renewals can stay “Stripe-only” while refill still works via (3)–(4). |

---

## Bulk sync: every patient with an active Stripe membership

To pull **every** patient who has an **active membership in Stripe** and add their **current membership** to their platform profile (by email match):

1. **Wellmedr must use Stripe Connect** – clinic has `stripeAccountId` set.
2. **Run the sync script** (active-only by default; paginates through all Stripe subscriptions):
   - Dry run: `npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts` – shows total active in Stripe, matched by email, skipped (no email / no patient), and a small sample.
   - Execute: `npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --execute` – upserts `Subscription` (planName, vialCount, refillIntervalDays, status) and sets `patient.stripeCustomerId` when missing.
3. **Matching is by email only** – Stripe customer email (from expanded `data.customer`) is normalized and matched to patients in the Wellmedr clinic via `findPatientByEmail`. Patients without a profile in the platform are skipped (no patient created).
4. **Product name** – The script expands `data.items.data.price.product` so the subscription’s plan name (e.g. "Semaglutide Injection - 1 Month Supply", "Tirzepatide Injection - 3 Month Supply") is stored in `Subscription.planName` and used to derive `vialCount` and `refillIntervalDays` for refill logic.

---

## Refill correctness (vialCount, planName)

Refill queue logic depends on:

- **Subscription.planName** – e.g. "Tirzepatide Injection - 3 Month Supply" (for display and medication name).
- **Subscription.vialCount** – 1 (monthly), 3 (quarterly), 6 (6‑month), 12 (12‑month), used for refill interval.
- **Subscription.refillIntervalDays** – 30, 90, or 180 (from vialCount).
- **Subscription.stripeSubscriptionId** – so webhook `invoice.payment_succeeded` can find the local subscription and trigger the next refill.

The subscription sync service now:

- Derives **vialCount** and **refillIntervalDays** from **planName** (via `parsePackageMonthsFromPlan` and `calculateIntervalDays`) when upserting from Stripe, so refill scheduling is correct even for subscriptions created only in Stripe.
- Uses the **expanded product** name from the sync script so "1 Month Supply" / "3 Month Supply" etc. are stored correctly.

**Verification after sync:**

- Admin → patient profile → Subscriptions: patient has an active subscription with the expected plan name and interval.
- Refill Queue (and RX queue) will recognize the subscription for future renewals once the webhook runs with the correct clinic (Connect `event.account` fix) and the local Subscription exists.

---

## Code References

- **Webhook:** `src/app/api/stripe/webhook/route.ts`  
  - Clinic: `getClinicIdFromStripeEvent` (metadata) + DEFAULT_CLINIC_ID + **Connect `event.account` → Clinic.stripeAccountId**.
  - Invoice: `StripeInvoiceService.updateFromWebhook` (find by `stripeInvoiceId`).
  - Refill: `invoice.payment_succeeded` → find `Subscription` by `stripeSubscriptionId` → `triggerRefillForSubscriptionPayment`.
- **Invoice not in DB:** `src/services/stripe/invoiceService.ts` – `updateFromWebhook` logs "Invoice … not found" and returns.
- **Subscription sync (by email):** `scripts/sync-wellmedr-stripe-subscriptions.ts`, `src/services/stripe/subscriptionSyncService.ts` – `syncSubscriptionFromStripeByEmail`. Script: active-only by default, `--all` for all statuses, expand `data.customer` and `data.items.data.price.product`; service derives `vialCount` and `refillIntervalDays` from `planName` for refill correctness.

---

## Related

- **WELLMEDR.md** – Invoice webhook (Airtable → wellmedr-invoice) for **initial** payments that create invoices and schedule refills; Stripe **subscription renewals** are handled by the Stripe webhook above.
- **Scratchpad** – "Wellmedr Stripe Subscriptions Sync" and "Stripe charge not reflecting on profile" for status and follow-ups.
