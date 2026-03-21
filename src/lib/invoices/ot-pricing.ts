/**
 * OT (Overtime / ot.eonpro.io) — internal invoice pricing for EONPro → OT reconciliation.
 *
 * Pharmacy SKU costs should mirror Lifefile medication keys on orders; extend `OT_PRODUCT_PRICES`
 * as the catalog grows. Unlisted keys still appear on invoices with $0 until priced.
 *
 * All amounts are cents unless noted.
 */

export const OT_CLINIC_SUBDOMAIN = 'ot';

/** EONPro platform fee on gross patient payments (basis points: 1000 = 10%). */
export const OT_PLATFORM_COMPENSATION_BPS = 1000;

/** Card / merchant processing fee on gross sales (basis points: 400 = 4%). */
export const OT_MERCHANT_PROCESSING_BPS = 400;

/**
 * Per prescription order (one shipment per order, not per line item).
 * $20 default; $30 if the package includes NAD+, glutathione, sermorelin, semaglutide, or tirzepatide.
 */
export const OT_PRESCRIPTION_SHIPPING_STANDARD_CENTS = 2000;
export const OT_PRESCRIPTION_SHIPPING_PREMIUM_CENTS = 3000;

/** Telehealth visit fee when the prescription is for testosterone replacement therapy (TRT). */
export const OT_TRT_TELEHEALTH_FEE_CENTS = 5000;

/**
 * Single combined doctor / Rx fee per order (replaces a separate “prescription fee” line).
 * Async: order went through the provider queue (`queuedForProviderAt` set). Sync: otherwise.
 */
export const OT_RX_ASYNC_APPROVAL_FEE_CENTS = 3000;
export const OT_RX_SYNC_APPROVAL_FEE_CENTS = 3000;

/**
 * If the patient had another **paid** prescription invoice at this clinic within this many days,
 * OT charges **no** doctor/Rx fee (unlike WellMedR partial fee — here it is $0).
 * New sale (no prior) or gap ≥ this many days → full doctor/Rx fee applies.
 */
export const OT_DOCTOR_RX_FEE_REFILL_EXEMPT_DAYS = 90;

const MS_PER_DAY = 86_400_000;

/** Most recent prior paid Rx invoice strictly before this payment (same patient); excludes `currentInvoiceId`. */
export function findPriorPaidOtPrescriptionInvoice(
  patientInvoices: readonly { id: number; paidAt: Date }[],
  currentInvoiceId: number,
  currentPaidAt: Date,
): { id: number; paidAt: Date } | null {
  const curMs = currentPaidAt.getTime();
  let best: { id: number; paidAt: Date } | null = null;
  for (const inv of patientInvoices) {
    if (inv.id === currentInvoiceId) continue;
    const t = inv.paidAt.getTime();
    if (t > curMs) continue;
    if (t === curMs && inv.id >= currentInvoiceId) continue;
    if (
      !best ||
      t > best.paidAt.getTime() ||
      (t === best.paidAt.getTime() && inv.id > best.id)
    ) {
      best = inv;
    }
  }
  return best;
}

export function getOtDoctorRxFeeCentsForSale(params: {
  priorPaidPrescriptionInvoice: { paidAt: Date } | null;
  currentPaidAt: Date | null;
  approvalMode: 'async' | 'sync';
}): {
  feeCents: number;
  waivedReason: string | null;
  /** Standard doctor/Rx fee for this approval mode ($30 async/sync) before refill rule. */
  nominalFeeCents: number;
  /** Portion of `nominalFeeCents` not charged (full nominal when refill &lt;90d). */
  waivedAmountCents: number;
  /** Whole days between prior paid Rx and this sale’s payment; null if no prior or unknown payment time. */
  daysSincePriorPaidRx: number | null;
} {
  const rate =
    params.approvalMode === 'async'
      ? OT_RX_ASYNC_APPROVAL_FEE_CENTS
      : OT_RX_SYNC_APPROVAL_FEE_CENTS;

  const base = {
    nominalFeeCents: rate,
    waivedAmountCents: 0 as number,
    daysSincePriorPaidRx: null as number | null,
  };

  if (!params.currentPaidAt) {
    return { feeCents: rate, waivedReason: null, ...base };
  }
  if (!params.priorPaidPrescriptionInvoice) {
    return { feeCents: rate, waivedReason: null, ...base };
  }
  const gapMs = params.currentPaidAt.getTime() - params.priorPaidPrescriptionInvoice.paidAt.getTime();
  const daysSince = Math.floor(gapMs / MS_PER_DAY);
  const exemptMs = OT_DOCTOR_RX_FEE_REFILL_EXEMPT_DAYS * MS_PER_DAY;
  if (gapMs >= exemptMs) {
    return {
      feeCents: rate,
      waivedReason: null,
      nominalFeeCents: rate,
      waivedAmountCents: 0,
      daysSincePriorPaidRx: daysSince,
    };
  }
  return {
    feeCents: 0,
    waivedReason: `No doctor/Rx fee — paid Rx within ${OT_DOCTOR_RX_FEE_REFILL_EXEMPT_DAYS} days of prior`,
    nominalFeeCents: rate,
    waivedAmountCents: rate,
    daysSincePriorPaidRx: daysSince,
  };
}

export interface OtProductPrice {
  productId: number;
  name: string;
  strength: string;
  vialSize: string;
  priceCents: number;
}

/**
 * Initial catalog: GLP‑1 SKUs shared with WellMedR; add OT-specific peptides, TRT, etc. here.
 * medicationKey on `Rx` is the Lifefile product id string.
 */
export const OT_PRODUCT_PRICES: OtProductPrice[] = [
  { productId: 203448972, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '1ML', priceCents: 5200 },
  { productId: 203448973, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '2ML', priceCents: 6200 },
  { productId: 203449364, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '3ML', priceCents: 7000 },
  { productId: 203449500, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '4ML', priceCents: 8000 },
  { productId: 203418602, name: 'TIRZEPATIDE/GLYCINE', strength: '30/20MG/ML', vialSize: '2ML', priceCents: 10500 },
  { productId: 203448971, name: 'SEMAGLUTIDE/GLYCINE', strength: '2.5/20MG/ML', vialSize: '1ML', priceCents: 3500 },
  { productId: 203448947, name: 'SEMAGLUTIDE/GLYCINE', strength: '2.5/20MG/ML', vialSize: '2ML', priceCents: 4000 },
  { productId: 203449363, name: 'SEMAGLUTIDE/GLYCINE', strength: '2.5/20MG/ML', vialSize: '3ML', priceCents: 4500 },
  { productId: 202851329, name: 'SEMAGLUTIDE/GLYCINE', strength: '5/20MG/ML', vialSize: '2ML', priceCents: 5000 },
];

export const OT_PRICE_MAP = new Map(OT_PRODUCT_PRICES.map((p) => [String(p.productId), p]));

export const OT_PRICED_MEDICATION_KEYS = new Set(OT_PRODUCT_PRICES.map((p) => String(p.productId)));

export function getOtProductPrice(medicationKey: string): OtProductPrice | undefined {
  return OT_PRICE_MAP.get(medicationKey);
}

/**
 * True if this Rx belongs to the $30 shipping tier (NAD+, glutathione, sermorelin, semaglutide, tirzepatide).
 * If any line on the order matches, the whole prescription ships at the premium rate.
 */
export function isOtPremiumShippingMedication(rx: {
  medName: string;
  medicationKey: string;
  form?: string;
}): boolean {
  const priced = getOtProductPrice(rx.medicationKey);
  const blob = [rx.medName, rx.medicationKey, priced?.name ?? '', rx.form ?? '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (blob.includes('glutathione')) return true;
  if (blob.includes('sermorelin')) return true;
  if (blob.includes('semaglutide')) return true;
  if (blob.includes('tirzepatide')) return true;
  if (blob.includes('nad+') || blob.includes('nad +')) return true;
  if (/\bnad\b/.test(blob)) return true;
  return false;
}

/**
 * True when the order is treated as testosterone replacement therapy (TRT) for telehealth billing.
 * Uses medication display names, strengths, keys, and priced catalog names.
 */
export function isOtTestosteroneReplacementTherapyOrder(rxs: {
  medName: string;
  medicationKey: string;
  form?: string;
  strength?: string;
}[]): boolean {
  for (const rx of rxs) {
    const priced = getOtProductPrice(rx.medicationKey);
    const blob = [rx.medName, rx.medicationKey, priced?.name ?? '', rx.form ?? '', rx.strength ?? '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (blob.includes('testosterone')) return true;
    if (/\btrt\b/.test(blob)) return true;
    if (blob.includes('trt plus')) return true;
    if (blob.includes('cypionate')) return true;
  }
  return false;
}

/** One shipping charge per order when the order has at least one Rx. */
export function getOtPrescriptionShippingCentsForOrder(
  rxs: { medName: string; medicationKey: string; form?: string }[],
): { feeCents: number; tier: 'standard' | 'premium' } {
  if (rxs.length === 0) return { feeCents: 0, tier: 'standard' };
  const premium = rxs.some((rx) => isOtPremiumShippingMedication(rx));
  return {
    feeCents: premium ? OT_PRESCRIPTION_SHIPPING_PREMIUM_CENTS : OT_PRESCRIPTION_SHIPPING_STANDARD_CENTS,
    tier: premium ? 'premium' : 'standard',
  };
}

/**
 * Per Stripe invoice line that is not attributed to a priced pharmacy SKU on the order.
 * Set >0 when contract defines flat fulfillment for labs, bundles, etc. (default 0 = show structure only).
 */
export const OT_FULFILLMENT_FEE_PER_OTHER_LINE_CENTS = 0;
