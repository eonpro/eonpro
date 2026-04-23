/**
 * Stripe Invoice Field Extractors (dahlia-aware)
 * ==============================================
 *
 * The Stripe 2026-03-25 "dahlia" API release (adopted 2026-04-03, commit
 * 26a8265d) relocated several high-traffic fields on the Invoice object:
 *
 *   Legacy path                         Dahlia path
 *   ─────────────────────────────────   ──────────────────────────────────────────────────
 *   invoice.subscription                invoice.parent.subscription_details.subscription
 *   invoice.charge                      invoice.payments.data[0].payment (type=charge)
 *   invoice.payment_intent              invoice.payments.data[0].payment (type=payment_intent)
 *
 * Code that still reads the legacy paths silently returns `undefined` on dahlia
 * invoices. That is how the WellMedR subscription-renewal refill trigger was
 * broken for 19 days without anyone noticing — the webhook handler read
 * `invoice.subscription`, got `undefined`, and skipped the refill path.
 *
 * This module centralizes the extraction so every call site uses the same
 * dahlia-aware logic, is unit-tested, and gracefully falls back to legacy
 * paths for backwards compatibility (old webhook replays, test fixtures).
 */
import type Stripe from 'stripe';

/**
 * Shape of `invoice.parent.subscription_details` under dahlia.
 * Not exported from the Stripe Node types yet (as of stripe@19.x), so we
 * type it minimally here.
 */
interface DahliaSubscriptionDetails {
  subscription?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}

interface DahliaInvoiceParent {
  type?: string;
  subscription_details?: DahliaSubscriptionDetails | null;
}

interface DahliaInvoicePayment {
  id?: string;
  status?: string;
  payment?: {
    type?: 'payment_intent' | 'charge' | string;
    payment_intent?: string | { id: string } | null;
    charge?: string | { id: string } | null;
  } | null;
}

interface DahliaInvoicePaymentsList {
  object?: 'list';
  data?: DahliaInvoicePayment[];
}

type InvoiceLike = Stripe.Invoice & {
  // Legacy (pre-dahlia) fields — kept for backwards compat when replaying
  // old events or reading from fixtures that predate the API upgrade.
  subscription?: string | { id: string } | null;
  charge?: string | Stripe.Charge | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
  // Dahlia fields
  parent?: DahliaInvoiceParent | null;
  payments?: DahliaInvoicePaymentsList | null;
};

/** Safely unwrap a value that may be a string id, `{id}` object, or null/undefined. */
function asId(v: string | { id?: string | null } | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  return typeof v.id === 'string' ? v.id : null;
}

/**
 * Returns the Stripe subscription ID associated with an invoice, or null.
 * Handles both dahlia (`parent.subscription_details.subscription`) and
 * legacy (`invoice.subscription`) shapes.
 */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceLike;

  // Dahlia path (preferred)
  const dahliaSub = inv.parent?.subscription_details?.subscription;
  const dahliaId = asId(dahliaSub ?? null);
  if (dahliaId) return dahliaId;

  // Legacy fallback
  return asId(inv.subscription ?? null);
}

/**
 * Returns the first PaymentIntent ID linked to an invoice, or null.
 * Handles dahlia (`payments.data[].payment.payment_intent`) and legacy
 * (`invoice.payment_intent`) shapes.
 */
export function getInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceLike;

  const payments = inv.payments?.data ?? [];
  for (const p of payments) {
    if (p?.payment?.type === 'payment_intent' || p?.payment?.payment_intent) {
      const id = asId(p.payment?.payment_intent ?? null);
      if (id) return id;
    }
  }

  return asId(inv.payment_intent ?? null);
}

/**
 * Returns the first Charge ID linked to an invoice, or null.
 * Handles dahlia (`payments.data[].payment.charge`) and legacy
 * (`invoice.charge`) shapes.
 */
export function getInvoiceChargeId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceLike;

  const payments = inv.payments?.data ?? [];
  for (const p of payments) {
    if (p?.payment?.type === 'charge' || p?.payment?.charge) {
      const id = asId(p.payment?.charge ?? null);
      if (id) return id;
    }
  }

  return asId(inv.charge ?? null);
}

/**
 * Resolves the PaymentMethod ID for an invoice.
 *
 * Strategy:
 *   1. If a Charge is expanded on the invoice (dahlia or legacy), read its
 *      `payment_method` directly.
 *   2. Otherwise, if a PaymentIntent is expanded with payment_method, read it.
 *   3. Otherwise, return null. Callers that need the PM must retrieve the
 *      PaymentIntent separately (see `resolveInvoicePaymentMethodId`).
 *
 * This function is synchronous and never makes an API call — safe to use
 * inside tight loops and webhook handlers.
 */
export function getInvoicePaymentMethodIdFromExpanded(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceLike;

  // Legacy expanded charge
  if (inv.charge && typeof inv.charge !== 'string') {
    const pm = (inv.charge as Stripe.Charge).payment_method;
    if (typeof pm === 'string') return pm;
  }

  // Legacy expanded payment_intent
  if (inv.payment_intent && typeof inv.payment_intent !== 'string') {
    const pi = inv.payment_intent as Stripe.PaymentIntent;
    if (typeof pi.payment_method === 'string') return pi.payment_method;
    if (pi.payment_method && typeof pi.payment_method === 'object') {
      return pi.payment_method.id;
    }
  }

  return null;
}

/**
 * Resolves the PaymentMethod ID for an invoice, retrieving the PaymentIntent
 * via Stripe if necessary. Use this when you have a Stripe client handy and
 * the dedup/payment-method signal is worth a small extra API call.
 *
 * @returns the pm_... id, or null if nothing resolves.
 */
export async function resolveInvoicePaymentMethodId(
  invoice: Stripe.Invoice,
  stripe: Stripe,
  requestOpts?: Stripe.RequestOptions
): Promise<string | null> {
  // First try expanded fields — no API call needed.
  const fromExpanded = getInvoicePaymentMethodIdFromExpanded(invoice);
  if (fromExpanded) return fromExpanded;

  // Fall back to retrieving the PaymentIntent linked to the invoice.
  const piId = getInvoicePaymentIntentId(invoice);
  if (!piId) return null;

  try {
    const pi = await stripe.paymentIntents.retrieve(piId, {}, requestOpts);
    if (typeof pi.payment_method === 'string') return pi.payment_method;
    if (pi.payment_method && typeof pi.payment_method === 'object') {
      return pi.payment_method.id;
    }
  } catch {
    // Non-fatal: dedup will just be less precise.
  }
  return null;
}
