/**
 * OT (Overtime / ot.eonpro.io) — internal invoice pricing for EONPro → OT reconciliation.
 *
 * Pharmacy SKU costs should mirror Lifefile medication keys on orders; extend `OT_PRODUCT_PRICES`
 * as the catalog grows. Unlisted keys use {@link inferOtPharmacyUnitPriceFromRx} when the med name
 * matches a known OT SKU; otherwise lines stay $0 with status `missing`.
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
 * **Async** (non–testosterone-cypionate Rx): $30. **Sync** (testosterone cypionate on order): $50.
 */
export const OT_RX_ASYNC_APPROVAL_FEE_CENTS = 3000;
export const OT_RX_SYNC_APPROVAL_FEE_CENTS = 5000;

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
  /** Standard doctor/Rx fee for this approval mode ($30 async · $50 sync) before refill rule. */
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
  /** Enclomiphene capsules — internal COGS per dispensed package (e.g. 90-count fill), not per tablet. */
  { productId: 203449328, name: 'ENCLOMIPHENE CITRATE', strength: '12.5mg', vialSize: 'CAP', priceCents: 3500 },
  { productId: 203449329, name: 'ENCLOMIPHENE CITRATE', strength: '25 mg', vialSize: 'CAP', priceCents: 13500 },
  { productId: 203449330, name: 'ENCLOMIPHENE CITRATE', strength: '50 mg', vialSize: 'CAP', priceCents: 4500 },
  {
    productId: 203418766,
    name: 'GLUTATHIONE 200MG/ML (10ML VIAL) SOLUTION',
    strength: '200MG/ML',
    vialSize: '10ML',
    priceCents: 4000,
  },
];

export const OT_PRICE_MAP = new Map(OT_PRODUCT_PRICES.map((p) => [String(p.productId), p]));

export const OT_PRICED_MEDICATION_KEYS = new Set(OT_PRODUCT_PRICES.map((p) => String(p.productId)));

export function getOtProductPrice(medicationKey: string): OtProductPrice | undefined {
  return OT_PRICE_MAP.get(medicationKey);
}

/**
 * Sentinel `productId` for rows priced by {@link inferOtPharmacyUnitPriceFromRx} (not a Lifefile catalog id).
 * Add real Lifefile keys to {@link OT_PRODUCT_PRICES} when known so invoices use authoritative COGS.
 */
export const OT_PHARMACY_FALLBACK_PRODUCT_ID = 0;

/**
 * Internal COGS estimate (cents per dispensed line) when the Lifefile `medicationKey` is missing from
 * {@link OT_PRODUCT_PRICES}. Matched on normalized `medName` / strength / form — extend as OT SKUs grow.
 */
export function inferOtPharmacyUnitPriceFromRx(rx: {
  medicationKey: string;
  medName: string;
  strength: string;
  form: string;
}): OtProductPrice | undefined {
  const blob = [rx.medName, rx.strength, rx.form, rx.medicationKey].filter(Boolean).join(' ').toLowerCase();

  const row = (
    priceCents: number,
    name: string,
    strength: string,
    vialSize: string,
  ): OtProductPrice => ({
    productId: OT_PHARMACY_FALLBACK_PRODUCT_ID,
    name,
    strength,
    vialSize,
    priceCents,
  });

  if (blob.includes('tirzepatide')) {
    if (blob.includes('4ml') || blob.includes('4 ml')) return row(8000, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('3ml') || blob.includes('3 ml')) return row(7000, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('2ml') || blob.includes('2 ml')) return row(6200, rx.medName, rx.strength, rx.form || '');
    return row(5200, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('semaglutide')) {
    if (blob.includes('5/20') || blob.includes('5mg')) return row(5000, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('3ml') || blob.includes('3 ml')) return row(4500, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('2ml') || blob.includes('2 ml')) return row(4000, rx.medName, rx.strength, rx.form || '');
    return row(3500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('sermorelin')) return row(12000, rx.medName, rx.strength, rx.form || '');
  if (blob.includes('enclomiphene')) {
    if (blob.includes('12.5')) return row(3500, rx.medName, rx.strength, rx.form || '');
    if (/\b50\s*mg\b/.test(blob) || blob.includes('50mg')) {
      return row(4500, rx.medName, rx.strength, rx.form || '');
    }
    // 25 mg (typical 90-capsule maintenance) — package COGS, billed as qty 1 in {@link effectiveOtPharmacyBillQuantity}.
    if (/\b25\s*mg\b/.test(blob) || blob.includes('25mg')) {
      return row(13500, rx.medName, rx.strength, rx.form || '');
    }
    return row(4500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('glutathione')) return row(4000, rx.medName, rx.strength, rx.form || '');
  if (blob.includes('nad+') || blob.includes('nad +') || /\bnad\b/.test(blob)) {
    return row(8000, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('testosterone') || blob.includes('cypionate') || blob.includes('undecanoate')) {
    return row(3500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('tadalafil')) return row(2000, rx.medName, rx.strength, rx.form || '');
  if (blob.includes('anastrozole')) return row(1500, rx.medName, rx.strength, rx.form || '');
  if (blob.includes('hcg') || blob.includes('gonadotropin')) return row(2500, rx.medName, rx.strength, rx.form || '');

  return undefined;
}

export function resolveOtProductPriceForPharmacyLine(rx: {
  medicationKey: string;
  medName: string;
  strength: string;
  form: string;
}): { row: OtProductPrice; source: 'catalog' | 'fallback' } | null {
  const catalog = getOtProductPrice(rx.medicationKey);
  if (catalog) return { row: catalog, source: 'catalog' };
  const inferred = inferOtPharmacyUnitPriceFromRx(rx);
  if (inferred) return { row: inferred, source: 'fallback' };
  return null;
}

/**
 * Lifefile `Rx.quantity` is often **tablet count or days supply**, not “billable pharmacy units”.
 * Internal COGS lines must not multiply unit cost by 30/90 for a single dispensed package.
 *
 * - **catalog** (known GLP‑1 vial SKUs): quantity = vial count (cap only for sanity).
 * - **fallback / unpriced**: oral maintenance meds → **1** package per consolidated line; injectables → use qty
 *   only when ≤ 12 (typical vial counts); otherwise treat as **1** (mis-encoded days supply).
 */
export function effectiveOtPharmacyBillQuantity(params: {
  medName: string;
  form: string;
  consolidatedRawQty: number;
  pricingSource: 'catalog' | 'fallback' | null;
}): number {
  const raw = Math.max(1, Math.floor(params.consolidatedRawQty) || 1);

  const blob = `${params.medName} ${params.form}`.toLowerCase();
  const oralLike =
    /\b(tab|tabs|tablet|tablets|capsule|capsules|cap|oral)\b/.test(blob) ||
    blob.includes('enclomiphene') ||
    blob.includes('clomiphene') ||
    blob.includes('anastrozole') ||
    blob.includes('tadalafil');

  // Oral / capsule SKUs in {@link OT_PRODUCT_PRICES} must still bill **one package**, not tablet count (e.g. 90).
  if (oralLike) {
    return 1;
  }

  if (params.pricingSource === 'catalog') {
    return Math.min(raw, 48);
  }

  if (params.pricingSource === 'fallback' || params.pricingSource === null) {
    if (raw > 12) {
      return 1;
    }
    return raw;
  }

  return Math.min(raw, 48);
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
/**
 * Doctor/Rx approval **sync vs async** for OT reporting (tab counts, CSV labels).
 * - **sync**: order includes **testosterone cypionate** (any Rx line matches name/strength/form/key).
 * - **async**: all other prescriptions (GLP-1, peptides, enclomiphene, etc.).
 * Fee *amounts* use {@link OT_RX_ASYNC_APPROVAL_FEE_CENTS} ($30) vs {@link OT_RX_SYNC_APPROVAL_FEE_CENTS} ($50).
 */
export function getOtDoctorApprovalModeFromRxs(rxs: {
  medName: string;
  medicationKey: string;
  form?: string;
  strength?: string;
}[]): 'async' | 'sync' {
  for (const rx of rxs) {
    const blob = [rx.medName, rx.medicationKey, rx.form ?? '', rx.strength ?? '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (blob.includes('testosterone') && blob.includes('cypionate')) {
      return 'sync';
    }
  }
  return 'async';
}

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

/** Typical standalone bloodwork / lab panel charge at OT (Stripe cents). Used to label non-Rx invoice lines. */
export const OT_BLOODWORK_STANDARD_FEE_CENTS = 18_000;

export type OtNonPharmacyChargeKind = 'bloodwork' | 'consult' | 'other';

/**
 * Classify Stripe invoice lines that are not pharmacy SKU rows (bloodwork, consults, bundles).
 * Amount-only match helps when descriptions are empty in webhook sync.
 */
export function classifyOtNonPharmacyChargeLine(
  description: string,
  amountCents: number,
): OtNonPharmacyChargeKind {
  const d = description.toLowerCase();
  if (
    amountCents === OT_BLOODWORK_STANDARD_FEE_CENTS ||
    /\b(blood\s*work|bloodwork|lab\s*panel|quest|labcorp|phlebotom|cmp\b|cbc\b|baseline\s*lab)\b/i.test(
      description,
    )
  ) {
    return 'bloodwork';
  }
  if (/\b(consult|telehealth|new\s*patient\s*visit|follow[-\s]?up\s*visit|membership)\b/i.test(d)) {
    return 'consult';
  }
  return 'other';
}
