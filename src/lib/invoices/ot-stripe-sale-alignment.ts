/**
 * OT reconciliation: tie patient gross to Stripe-settled `Payment` rows when present,
 * and sanity-check Stripe billing names against patient profile names (no PHI in logs).
 */

export type OtPatientGrossSource = 'stripe_payments' | 'invoice_sync';

export type OtStripeBillingNameVsProfile = 'match' | 'mismatch' | 'unknown';

export function normalizeComparablePersonName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Returns whether Stripe `customer_name` (or similar) is consistent with decrypted profile first/last.
 * `unknown` when Stripe did not supply a name — not a failure.
 */
export function compareStripeBillingNameToPatient(params: {
  stripeBillingName: string | null | undefined;
  patientFirstName: string;
  patientLastName: string;
}): OtStripeBillingNameVsProfile {
  const stripeRaw = params.stripeBillingName?.trim();
  if (!stripeRaw) return 'unknown';

  const stripe = normalizeComparablePersonName(stripeRaw);
  if (!stripe) return 'unknown';

  const first = normalizeComparablePersonName(params.patientFirstName);
  const last = normalizeComparablePersonName(params.patientLastName);
  if (!first || !last) return 'unknown';

  const firstParts = first.split(' ').filter((t) => t.length > 1);
  const lastParts = last.split(' ').filter((t) => t.length > 1);
  if (firstParts.length === 0 || lastParts.length === 0) return 'unknown';

  const everyIn = (parts: string[], hay: string) => parts.every((p) => hay.includes(p));

  if (everyIn(firstParts, stripe) && everyIn(lastParts, stripe)) return 'match';
  if (everyIn(lastParts, stripe) && everyIn(firstParts, stripe)) return 'match';

  return 'mismatch';
}

export function resolveOtPatientGrossCents(params: {
  invoiceDbId: number;
  invoiceAmountPaid: number;
  invoiceAmountDue: number | null;
  /** Net cents from succeeded / partially refunded Payment rows for this invoice. */
  paymentNetCentsByInvoiceId: ReadonlyMap<number, number>;
  /** Fallback when invoice fields already reflect Stripe (e.g. webhook sync). */
  invoiceGrossFallback: (inv: { amountPaid: number; amountDue: number | null }) => number;
}): { cents: number; source: OtPatientGrossSource } {
  const fromPayments = params.paymentNetCentsByInvoiceId.get(params.invoiceDbId);
  if (fromPayments != null && fromPayments > 0) {
    return { cents: fromPayments, source: 'stripe_payments' };
  }
  return {
    cents: params.invoiceGrossFallback({
      amountPaid: params.invoiceAmountPaid,
      amountDue: params.invoiceAmountDue,
    }),
    source: 'invoice_sync',
  };
}
