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

/**
 * EONPro per-transaction fee on patient gross (basis points: 500 = 5%).
 *
 * Replaced the prior 10% platform-compensation line on 2026-05-02 — the
 * EONPro fee structure changed to a flat 5% per transaction, computed
 * against `patientGrossCents` (not cash-collected-net like before). Refunded
 * payments naturally fall out because their per-row gross trends to zero.
 *
 * The legacy `OT_PLATFORM_COMPENSATION_BPS` export name is kept for any
 * external imports during the transition; both alias to the same value.
 */
export const OT_EONPRO_FEE_BPS = 500;
export const OT_PLATFORM_COMPENSATION_BPS = OT_EONPRO_FEE_BPS;

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
  currentPaidAt: Date
): { id: number; paidAt: Date } | null {
  const curMs = currentPaidAt.getTime();
  let best: { id: number; paidAt: Date } | null = null;
  for (const inv of patientInvoices) {
    if (inv.id === currentInvoiceId) continue;
    const t = inv.paidAt.getTime();
    if (t > curMs) continue;
    if (t === curMs && inv.id >= currentInvoiceId) continue;
    if (!best || t > best.paidAt.getTime() || (t === best.paidAt.getTime() && inv.id > best.id)) {
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
  const gapMs =
    params.currentPaidAt.getTime() - params.priorPaidPrescriptionInvoice.paidAt.getTime();
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
  {
    productId: 203448972,
    name: 'TIRZEPATIDE/GLYCINE',
    strength: '10/20MG/ML',
    vialSize: '1ML',
    priceCents: 5200,
  },
  {
    productId: 203448973,
    name: 'TIRZEPATIDE/GLYCINE',
    strength: '10/20MG/ML',
    vialSize: '2ML',
    priceCents: 6200,
  },
  {
    productId: 203449364,
    name: 'TIRZEPATIDE/GLYCINE',
    strength: '10/20MG/ML',
    vialSize: '3ML',
    priceCents: 7000,
  },
  {
    productId: 203449500,
    name: 'TIRZEPATIDE/GLYCINE',
    strength: '10/20MG/ML',
    vialSize: '4ML',
    priceCents: 8000,
  },
  {
    productId: 203418602,
    name: 'TIRZEPATIDE/GLYCINE',
    strength: '30/20MG/ML',
    vialSize: '2ML',
    priceCents: 10500,
  },
  {
    productId: 203448971,
    name: 'SEMAGLUTIDE/GLYCINE',
    strength: '2.5/20MG/ML',
    vialSize: '1ML',
    priceCents: 3500,
  },
  {
    productId: 203448947,
    name: 'SEMAGLUTIDE/GLYCINE',
    strength: '2.5/20MG/ML',
    vialSize: '2ML',
    priceCents: 4000,
  },
  {
    productId: 203449363,
    name: 'SEMAGLUTIDE/GLYCINE',
    strength: '2.5/20MG/ML',
    vialSize: '3ML',
    priceCents: 4500,
  },
  {
    productId: 202851329,
    name: 'SEMAGLUTIDE/GLYCINE',
    strength: '5/20MG/ML',
    vialSize: '2ML',
    priceCents: 5000,
  },
  /** Enclomiphene capsules — internal COGS per dispensed package (e.g. 90-count fill), not per tablet. */
  {
    productId: 203449328,
    name: 'ENCLOMIPHENE CITRATE',
    strength: '12.5mg',
    vialSize: 'CAP',
    priceCents: 3500,
  },
  {
    productId: 203449329,
    name: 'ENCLOMIPHENE CITRATE',
    strength: '25 mg',
    vialSize: 'CAP',
    priceCents: 13500,
  },
  {
    productId: 203449330,
    name: 'ENCLOMIPHENE CITRATE',
    strength: '50 mg',
    vialSize: 'CAP',
    priceCents: 4500,
  },
  {
    productId: 203418766,
    name: 'GLUTATHIONE 200MG/ML (10ML VIAL) SOLUTION',
    strength: '200MG/ML',
    vialSize: '10ML',
    priceCents: 4000,
  },
  {
    productId: 204754029,
    name: 'NAD + 100MG/ML (5ML VIAL) SOLUTION',
    strength: '100MG/ML',
    vialSize: '5ML',
    /** $75/month flat per stakeholder direction (2026-05-02). Was $50. */
    priceCents: 7500,
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
  const blob = [rx.medName, rx.strength, rx.form, rx.medicationKey]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const row = (
    priceCents: number,
    name: string,
    strength: string,
    vialSize: string
  ): OtProductPrice => ({
    productId: OT_PHARMACY_FALLBACK_PRODUCT_ID,
    name,
    strength,
    vialSize,
    priceCents,
  });

  if (blob.includes('tirzepatide')) {
    if (blob.includes('4ml') || blob.includes('4 ml'))
      return row(8000, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('3ml') || blob.includes('3 ml'))
      return row(7000, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('2ml') || blob.includes('2 ml'))
      return row(6200, rx.medName, rx.strength, rx.form || '');
    return row(5200, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('semaglutide')) {
    if (blob.includes('5/20') || blob.includes('5mg'))
      return row(5000, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('3ml') || blob.includes('3 ml'))
      return row(4500, rx.medName, rx.strength, rx.form || '');
    if (blob.includes('2ml') || blob.includes('2 ml'))
      return row(4000, rx.medName, rx.strength, rx.form || '');
    return row(3500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('sermorelin')) {
    /**
     * Per stakeholder direction (2026-05-01): Sermorelin pharmacy COGS is a
     * flat $75/month with no bulk discount ($75/$225/$450/$900 for
     * 1/3/6/12-month tiers — see `OT_PACKAGE_CATALOG.sermorelin.costCentsByTier`).
     *
     * Match the most distinctive multi-month markers in the strength/form/
     * vialSize blob so 3/6/12-month fills land on the right COGS. Default
     * to 1-month ($75) when no multi-month signal is present.
     */
    if (blob.includes('12 month') || blob.includes('12mo') || blob.includes('annual')) {
      return row(90000, rx.medName, rx.strength, rx.form || '');
    }
    if (blob.includes('6 month') || blob.includes('6mo')) {
      return row(45000, rx.medName, rx.strength, rx.form || '');
    }
    if (blob.includes('3 month') || blob.includes('3mo') || blob.includes('quarterly')) {
      return row(22500, rx.medName, rx.strength, rx.form || '');
    }
    return row(7500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('enclomiphene')) {
    if (blob.includes('12.5')) return row(3500, rx.medName, rx.strength, rx.form || '');
    if (/\b50\s*mg\b/.test(blob) || blob.includes('50mg')) {
      return row(4500, rx.medName, rx.strength, rx.form || '');
    }
    /**
     * 25 mg pricing per stakeholder direction (2026-05-02): $1.50/cap.
     * Detect dosing pattern from strength/form text to pick the right
     * tier-bundled cost. Rx blob hints we look for:
     *   maintenance / MWF / mon, wed, fri / 12/36 → $1.50 × 12/mo = $18/mo
     *   daily / 28/84                              → $1.50 × 28/mo = $42/mo
     * Tier marker (1 / 3 / 6 / 12 month) selects the multi-month bundle.
     */
    if (/\b25\s*mg\b/.test(blob) || blob.includes('25mg')) {
      const isMaintenance =
        blob.includes('maintenance') ||
        /\bmwf\b/.test(blob) ||
        blob.includes('mon') ||
        blob.includes('14/42') ||
        blob.includes('12/36');
      const tier12 = blob.includes('12 month') || blob.includes('12mo') || blob.includes('annual');
      const tier6 = blob.includes('6 month') || blob.includes('6mo');
      const tier3 = blob.includes('3 month') || blob.includes('3mo') || blob.includes('quarterly');
      if (isMaintenance) {
        if (tier12) return row(21600, rx.medName, rx.strength, rx.form || '');
        if (tier6) return row(10800, rx.medName, rx.strength, rx.form || '');
        if (tier3) return row(5400, rx.medName, rx.strength, rx.form || '');
        return row(1800, rx.medName, rx.strength, rx.form || '');
      }
      /** Daily dosing fallback (28 caps/month × $1.50 = $42/month). */
      if (tier12) return row(50400, rx.medName, rx.strength, rx.form || '');
      if (tier6) return row(25200, rx.medName, rx.strength, rx.form || '');
      if (tier3) return row(12600, rx.medName, rx.strength, rx.form || '');
      return row(4200, rx.medName, rx.strength, rx.form || '');
    }
    return row(4500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('glutathione')) return row(4000, rx.medName, rx.strength, rx.form || '');
  if (blob.includes('nad+') || blob.includes('nad +') || /\bnad\b/.test(blob)) {
    /**
     * Per stakeholder direction (2026-05-02): NAD+ pharmacy COGS is a flat
     * $75/month (same structure as Sermorelin). Tier-aware fallback so a
     * 3/6/12-month fill without a catalog SKU match still lands on the
     * correct COGS.
     */
    if (blob.includes('12 month') || blob.includes('12mo') || blob.includes('annual')) {
      return row(90000, rx.medName, rx.strength, rx.form || '');
    }
    if (blob.includes('6 month') || blob.includes('6mo')) {
      return row(45000, rx.medName, rx.strength, rx.form || '');
    }
    if (blob.includes('3 month') || blob.includes('3mo') || blob.includes('quarterly')) {
      return row(22500, rx.medName, rx.strength, rx.form || '');
    }
    return row(7500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('testosterone') || blob.includes('cypionate') || blob.includes('undecanoate')) {
    return row(3500, rx.medName, rx.strength, rx.form || '');
  }
  if (blob.includes('tadalafil')) return row(2000, rx.medName, rx.strength, rx.form || '');
  if (blob.includes('anastrozole')) return row(1500, rx.medName, rx.strength, rx.form || '');
  /**
   * HCG / Pregnyl: $240/fill clinic COGS (stakeholder direction
   * 2026-05-03 — Knowles Inv 19340 regression). Was $25 — wrong by
   * $215/unit. The package catalog already has HCG at $240 (3-month
   * fill); this aligns the Rx-loop fallback with that single source
   * of truth so any HCG sale that doesn't match a catalog tier (e.g.
   * unusual gross) still resolves to $240.
   */
  if (blob.includes('hcg') || blob.includes('pregnyl') || blob.includes('gonadotropin'))
    return row(24000, rx.medName, rx.strength, rx.form || '');

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
export function getOtDoctorApprovalModeFromRxs(
  rxs: {
    medName: string;
    medicationKey: string;
    form?: string;
    strength?: string;
  }[]
): 'async' | 'sync' {
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

export function isOtTestosteroneReplacementTherapyOrder(
  rxs: {
    medName: string;
    medicationKey: string;
    form?: string;
    strength?: string;
  }[]
): boolean {
  for (const rx of rxs) {
    const priced = getOtProductPrice(rx.medicationKey);
    const blob = [
      rx.medName,
      rx.medicationKey,
      priced?.name ?? '',
      rx.form ?? '',
      rx.strength ?? '',
    ]
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

/**
 * Editor-side equivalents of {@link isOtPremiumShippingMedication} and
 * {@link isOtTestosteroneReplacementTherapyOrder}. These accept the
 * `OtAllocationOverrideMedLine`-shaped objects the manual reconciliation
 * editor mutates (no `medicationKey` lookup against the catalog needed —
 * we match on the free-form `name`/`strength`/`vialSize` text since admins
 * can rename catalog rows or add custom lines).
 */
type EditorMedLineForFeeRules = {
  name?: string | null;
  strength?: string | null;
  vialSize?: string | null;
  medicationKey?: string | null;
};

function medLineBlob(m: EditorMedLineForFeeRules): string {
  return [m.name ?? '', m.strength ?? '', m.vialSize ?? '', m.medicationKey ?? '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * True when at least one med line on the sale qualifies for cold-shipping
 * ($30 premium tier): NAD+, glutathione, sermorelin, semaglutide, tirzepatide.
 * One match flips the whole sale to the premium tier.
 */
export function requiresColdShippingForMedLines(meds: EditorMedLineForFeeRules[]): boolean {
  for (const m of meds) {
    const blob = medLineBlob(m);
    if (blob.includes('glutathione')) return true;
    if (blob.includes('sermorelin')) return true;
    if (blob.includes('semaglutide')) return true;
    if (blob.includes('tirzepatide')) return true;
    if (blob.includes('nad+') || blob.includes('nad +')) return true;
    if (/\bnad\b/.test(blob)) return true;
  }
  return false;
}

/**
 * True when at least one med line is testosterone cypionate. When true, the
 * editor auto-applies the $50 TRT telehealth fee. Matches "cypionate" in the
 * blob (the canonical TRT signal — same logic as
 * {@link getOtDoctorApprovalModeFromRxs}).
 */
export function requiresTrtTelehealthForMedLines(meds: EditorMedLineForFeeRules[]): boolean {
  for (const m of meds) {
    const blob = medLineBlob(m);
    if (blob.includes('cypionate')) return true;
  }
  return false;
}

/** One shipping charge per order when the order has at least one Rx. */
export function getOtPrescriptionShippingCentsForOrder(
  rxs: { medName: string; medicationKey: string; form?: string }[]
): { feeCents: number; tier: 'standard' | 'premium' } {
  if (rxs.length === 0) return { feeCents: 0, tier: 'standard' };
  const premium = rxs.some((rx) => isOtPremiumShippingMedication(rx));
  return {
    feeCents: premium
      ? OT_PRESCRIPTION_SHIPPING_PREMIUM_CENTS
      : OT_PRESCRIPTION_SHIPPING_STANDARD_CENTS,
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

/**
 * Doctor / Rx review fee for a bloodwork-only sale.
 *
 * History:
 *   - 2026-05-02: $10 flat for any bloodwork sale.
 *   - 2026-05-03: dropped to $0 per stakeholder direction. Bloodwork sales
 *     no longer carry a doctor-review fee on the OT side; the consult work
 *     is bundled into the lab panel pricing itself.
 *
 * Kept as a named export so refactors that reference the constant continue
 * to compile and so future fee changes have one place to edit.
 */
export const OT_BLOODWORK_DOCTOR_FEE_CENTS = 0;

/**
 * Default doctor / Rx review fee for a non-Rx, non-bloodwork, non-consult
 * sale (i.e. `chargeKind === 'other'` — recovery bundles, skin, supplements,
 * etc.). Per stakeholder direction 2026-05-03: $5 preselected so the OT
 * editor's row default matches the chip set without admin intervention.
 */
export const OT_NON_RX_OTHER_DOCTOR_FEE_CENTS = 500;

/**
 * Drug-family tokens recognized by the rebill detector. Order matters only
 * for human readability — the matcher returns *every* family token that
 * appears in the input text. Add new families here as the OT catalog grows.
 */
const OT_DRUG_FAMILY_TOKENS = [
  // GLP-1s and incretins
  'semaglutide',
  'tirzepatide',
  'retatrutide',
  // Peptides + hormones
  'sermorelin',
  'tesamorelin',
  'cjc-ipamorelin',
  'ipamorelin',
  'bpc157',
  'bpc-157',
  'tb500',
  'tb-500',
  'mots-c',
  'epithalon',
  'kisspeptin',
  'melanotan',
  'selank',
  'semax',
  'kpv',
  'ghk-cu',
  'glutathione',
  'hcg',
  'b12',
  // Oral / SERMs / TRT adjuncts
  'enclomiphene',
  'clomiphene',
  'tadalafil',
  'anastrozole',
  // Testosterone (cypionate is the canonical TRT signal)
  'cypionate',
  'testosterone',
] as const;

/**
 * Extract drug-family tokens from a free-form text blob (Rx medName, invoice
 * line description, package name, etc.). Used by the per-product rebill
 * detector to compare what a patient bought today vs. their prior purchases.
 *
 * Returns an array of distinct family tokens found in the text, lowercased.
 * Deliberately permissive — substring matching catches "Sermorelin Acetate
 * 2mg/mL", "TIRZEPATIDE/GLYCINE 10/20MG/ML", "Cjc-Ipamorelin Recomp", etc.
 *
 * Special-cases NAD+ because the `+` and the `nad ` prefix are easy to miss
 * with a naive substring check.
 */
export function getOtProductFamilyKeysFromText(text: string): string[] {
  if (!text) return [];
  const blob = text.toLowerCase();
  const found = new Set<string>();
  if (blob.includes('nad+') || blob.includes('nad +') || /\bnad\b/.test(blob)) {
    found.add('nad');
  }
  for (const token of OT_DRUG_FAMILY_TOKENS) {
    if (blob.includes(token)) found.add(token);
  }
  return [...found];
}

export type OtNonPharmacyChargeKind = 'bloodwork' | 'consult' | 'other';

/**
 * Classify Stripe invoice lines that are not pharmacy SKU rows (bloodwork,
 * consults, bundles). Amount-only match helps when descriptions are empty
 * in webhook sync.
 *
 * `blood\s*panel` was added 2026-05-03 (regression: David Quintero Inv
 * 19339): without it, a Stripe line literally named "Blood Panel" classified
 * as `'other'`, which made `isBloodworkOnly === false` upstream and caused
 * the OT super-admin reconciliation editor to pull every phantom Rx from
 * the Lifefile order shell into the meds list.
 */
export function classifyOtNonPharmacyChargeLine(
  description: string,
  amountCents: number
): OtNonPharmacyChargeKind {
  const d = description.toLowerCase();
  if (
    amountCents === OT_BLOODWORK_STANDARD_FEE_CENTS ||
    /\b(blood\s*work|bloodwork|blood\s*panel|lab\s*panel|quest|labcorp|phlebotom|cmp\b|cbc\b|baseline\s*lab|elite\s*performance\s*panel|full\s*optimization|minimalist\s*panel|womens?\s*(?:full\s*)?panel)\b/i.test(
      description
    )
  ) {
    return 'bloodwork';
  }
  if (/\b(consult|telehealth|new\s*patient\s*visit|follow[-\s]?up\s*visit|membership)\b/i.test(d)) {
    return 'consult';
  }
  return 'other';
}
