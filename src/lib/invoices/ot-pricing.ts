/**
 * OT (Overtime / ot.eonpro.io) — internal invoice pricing for EONPro → OT reconciliation.
 *
 * Pharmacy SKU costs should mirror Lifefile medication keys on orders; extend `OT_PRODUCT_PRICES`
 * as the catalog grows. Unlisted keys still appear on invoices with $0 until priced.
 *
 * All amounts are cents unless noted.
 */

export const OT_CLINIC_SUBDOMAIN = 'ot';

/** Platform compensation on gross patient payments (Stripe invoice paid), in basis points (1000 = 10%). */
export const OT_PLATFORM_COMPENSATION_BPS = 1000;

/**
 * Doctor approval — async: order went through the provider queue (queuedForProviderAt set).
 * Sync: no queue timestamp (e.g. live/synchronous workflow). Adjust to match contract.
 */
export const OT_RX_ASYNC_APPROVAL_FEE_CENTS = 3500;
export const OT_RX_SYNC_APPROVAL_FEE_CENTS = 2500;

/** Same pattern as WellMedR: extra handling when exactly one vial ships. */
export const OT_SINGLE_VIAL_SURCHARGE_CENTS = 1500;

/**
 * Additional shipping surcharges by Lifefile shipping method ID (additive on top of single-vial rule).
 * Expand as OT checkout adds carriers / tiers.
 */
export const OT_SHIPPING_METHOD_SURCHARGES: Record<number, number> = {
  8233: 2000, // FedEx Standard Overnight
  8097: 2000, // UPS Next Day
};

/** WellMedR-style 2-day baseline id — no extra OT surcharge by default. */
export const OT_STANDARD_SHIPPING_METHOD_ID = 8234;

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

export function getOtShippingMethodSurchargeCents(shippingMethodId: number): number {
  return OT_SHIPPING_METHOD_SURCHARGES[shippingMethodId] ?? 0;
}

export function getOtProductPrice(medicationKey: string): OtProductPrice | undefined {
  return OT_PRICE_MAP.get(medicationKey);
}

/**
 * Per Stripe invoice line that is not attributed to a priced pharmacy SKU on the order.
 * Set >0 when contract defines flat fulfillment for labs, bundles, etc. (default 0 = show structure only).
 */
export const OT_FULFILLMENT_FEE_PER_OTHER_LINE_CENTS = 0;
