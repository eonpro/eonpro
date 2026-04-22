/**
 * Connect-invoice auto-create guard
 * ==================================
 *
 * Decides whether `StripeInvoiceService.updateFromWebhook` should auto-create
 * a local `Invoice` row for a Stripe-Connect invoice (e.g. WellMedR).
 *
 * Background (2026-04-22 regression fix):
 * A prior blanket-skip on Connect invoices (introduced 2026-04-19 to prevent
 * duplicate creation at initial checkout) also suppressed recurring renewals,
 * which are NOT owned by any external automation. Renewals never reached the
 * patient profile or provider Rx queue → missed prescription dates.
 *
 * Ownership model for Connect (WellMedR):
 *   • `subscription_create` / `manual` → owned by Airtable automation
 *     (`/api/webhooks/wellmedr-invoice`). Skip auto-create to avoid duplicates.
 *   • `subscription_cycle` / `subscription_update` / `subscription_threshold`
 *     → no external automation fires. MUST auto-create here.
 *   • Unknown / null billing_reason → ambiguous; skip (conservative).
 *   • Non-paid statuses → skip (only reconcile successful charges).
 *
 * This predicate is a pure function to keep the critical-path branch trivially
 * testable and to prevent a silent regression from recurring.
 */
import type Stripe from 'stripe';

/**
 * Stripe billing_reason values that represent recurring subscription charges
 * (i.e. events that arrive from Stripe with NO corresponding external signal).
 *
 * Source: https://stripe.com/docs/api/invoices/object#invoice_object-billing_reason
 */
const RENEWAL_BILLING_REASONS: ReadonlySet<Stripe.Invoice.BillingReason> = new Set<
  Stripe.Invoice.BillingReason
>(['subscription_cycle', 'subscription_update', 'subscription_threshold']);

export function isRenewalBillingReason(
  reason: Stripe.Invoice.BillingReason | null | undefined
): boolean {
  if (!reason) return false;
  return RENEWAL_BILLING_REASONS.has(reason);
}

/**
 * Pure predicate: should we auto-create a local Invoice for this Connect event?
 *
 * Returns `true` only when ALL of:
 *   • Event is from a Connect account (`connectContext.stripeAccountId` set)
 *   • Invoice is paid
 *   • `billing_reason` indicates a recurring subscription charge
 *
 * Returns `false` (defer / skip) otherwise. When `false` and this is a Connect
 * event, the caller should still branch on `billing_reason` to decide whether
 * a skip is expected (Airtable path) or an error (unexpected gap — alert).
 */
export function shouldAutoCreateConnectInvoice(
  stripeInvoice: Pick<Stripe.Invoice, 'status' | 'billing_reason'>,
  connectContext?: { stripeAccountId?: string; clinicId?: number }
): boolean {
  const isConnect = !!connectContext?.stripeAccountId;
  if (!isConnect) return false;
  if (stripeInvoice.status !== 'paid') return false;
  return isRenewalBillingReason(stripeInvoice.billing_reason);
}
