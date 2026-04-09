/**
 * WellMedR Clinic Pricing Configuration
 *
 * Pricing for pharmacy products prescribed through wellmedr.eonpro.io (clinic ID 7).
 * Prices are in cents. Includes supplies, 2-day shipping, and syringes when
 * two or more vials are in the prescription order.
 *
 * Shipping surcharges:
 *  - Single vial order: +$15
 *  - Overnight shipping:  +$20 (on any order)
 *
 * Prescription medical services:
 *  - New patient cycle: $10 (first Rx or first after 90+ days)
 *  - Refill within 90 days of the last $10: $3
 */

export const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

export const PRESCRIPTION_SERVICE_FEE_CENTS = 1000; // $10 per new prescription (cycle start)

export const PRESCRIPTION_SERVICE_REFILL_FEE_CENTS = 300; // $3 per refill within 90-day cycle

export const PRESCRIPTION_SERVICE_CYCLE_DAYS = 90; // Days before a new $10 charge resets

export const SINGLE_VIAL_SHIPPING_FEE_CENTS = 1500; // $15 when only 1 vial in the order

export const OVERNIGHT_SHIPPING_FEE_CENTS = 2000; // $20 for overnight shipping

export const OVERNIGHT_SHIPPING_METHOD_IDS = [8233, 8097]; // FEDEX-STANDARD OVERNIGHT, UPS NEXT DAY

export const STANDARD_SHIPPING_METHOD_ID = 8234; // FEDEX-2 DAY

export interface WellmedrProductPrice {
  productId: number;
  name: string;
  strength: string;
  vialSize: string;
  priceCents: number;
}

export const WELLMEDR_PRODUCT_PRICES: WellmedrProductPrice[] = [
  // TIRZEPATIDE/GLYCINE 10/20MG/ML
  { productId: 203448972, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '1ML', priceCents: 5200 },
  { productId: 203448973, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '2ML', priceCents: 6200 },
  { productId: 203449364, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '3ML', priceCents: 7000 },
  { productId: 203449500, name: 'TIRZEPATIDE/GLYCINE', strength: '10/20MG/ML', vialSize: '4ML', priceCents: 7500 },
  // TIRZEPATIDE/GLYCINE 30/20MG/ML
  { productId: 203418602, name: 'TIRZEPATIDE/GLYCINE', strength: '30/20MG/ML', vialSize: '2ML', priceCents: 9000 },
  // SEMAGLUTIDE/GLYCINE 2.5/20MG/ML
  { productId: 203448971, name: 'SEMAGLUTIDE/GLYCINE', strength: '2.5/20MG/ML', vialSize: '1ML', priceCents: 3500 },
  { productId: 203448947, name: 'SEMAGLUTIDE/GLYCINE', strength: '2.5/20MG/ML', vialSize: '2ML', priceCents: 4000 },
  { productId: 203449363, name: 'SEMAGLUTIDE/GLYCINE', strength: '2.5/20MG/ML', vialSize: '3ML', priceCents: 4500 },
  // SEMAGLUTIDE/GLYCINE 5/20MG/ML
  { productId: 202851329, name: 'SEMAGLUTIDE/GLYCINE', strength: '5/20MG/ML', vialSize: '2ML', priceCents: 5000 },
  // ADD-ON PRODUCTS
  { productId: 203194055, name: 'NAD+', strength: '100mg/mL', vialSize: '10mL', priceCents: 4000 },
  { productId: 204754029, name: 'NAD+', strength: '100mg/mL', vialSize: '5mL', priceCents: 4000 },
  { productId: 203666651, name: 'SERMORELIN ACETATE', strength: '2MG/ML', vialSize: '5ML', priceCents: 4500 },
  { productId: 203449111, name: 'Cyanocobalamin (B12)', strength: '1000mcg/mL', vialSize: '1mL', priceCents: 2000 },
];

export const WELLMEDR_PRICE_MAP = new Map(
  WELLMEDR_PRODUCT_PRICES.map((p) => [String(p.productId), p])
);

export const WELLMEDR_PRICED_PRODUCT_IDS = new Set(
  WELLMEDR_PRODUCT_PRICES.map((p) => String(p.productId))
);

export function isOvernightShipping(shippingMethodId: number): boolean {
  return OVERNIGHT_SHIPPING_METHOD_IDS.includes(shippingMethodId);
}

export function getProductPrice(medicationKey: string): WellmedrProductPrice | undefined {
  return WELLMEDR_PRICE_MAP.get(medicationKey);
}

// ---------------------------------------------------------------------------
// Add-on Products — Pharmacy Fees (COGS) & Prescription Upcharge
// ---------------------------------------------------------------------------

export type AddonKey = 'nad_plus' | 'sermorelin' | 'b12' | 'elite_bundle';

export interface WellmedrAddonFee {
  key: AddonKey;
  name: string;
  pharmacyFeeCents: number;
  prescriptionUpchargeCents: number;
}

export const ADDON_PHARMACY_FEES: Record<AddonKey, WellmedrAddonFee> = {
  nad_plus: {
    key: 'nad_plus',
    name: 'NAD+',
    pharmacyFeeCents: 4000, // $40
    prescriptionUpchargeCents: 500, // $5
  },
  sermorelin: {
    key: 'sermorelin',
    name: 'Sermorelin',
    pharmacyFeeCents: 4500, // $45
    prescriptionUpchargeCents: 500, // $5
  },
  b12: {
    key: 'b12',
    name: 'Cyanocobalamin (B12)',
    pharmacyFeeCents: 2000, // $20
    prescriptionUpchargeCents: 500, // $5
  },
  elite_bundle: {
    key: 'elite_bundle',
    name: 'Elite Bundle (NAD+, Sermorelin, B12)',
    pharmacyFeeCents: 10500, // $105 ($40 + $45 + $20)
    prescriptionUpchargeCents: 500, // $5
  },
};

/**
 * Calculate the total pharmacy fee in cents for the selected addons.
 */
export function getAddonPharmacyFeeCents(addonKeys: AddonKey[]): number {
  return addonKeys.reduce(
    (sum, key) => sum + (ADDON_PHARMACY_FEES[key]?.pharmacyFeeCents ?? 0),
    0,
  );
}

/**
 * Calculate the total prescription upcharge in cents for the selected addons.
 * Each addon adds a $5 upcharge to the prescription invoice for EonPro.
 */
export function getAddonPrescriptionUpchargeCents(addonKeys: AddonKey[]): number {
  return addonKeys.reduce(
    (sum, key) => sum + (ADDON_PHARMACY_FEES[key]?.prescriptionUpchargeCents ?? 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Reverse lookup: Lifefile medication key → addon key
// Used by invoice generation to detect addon orders from Rx lines when
// patient.sourceMetadata.selectedAddons is not populated (standalone subs).
// ---------------------------------------------------------------------------

export const ADDON_MEDICATION_KEY_TO_ADDON: Record<string, AddonKey> = {
  '203194055': 'nad_plus',
  '204754029': 'nad_plus',
  '203666651': 'sermorelin',
  '203449111': 'b12',
};

/** Lifefile product IDs for the three Elite Bundle medications (NAD+, Sermorelin, B12). */
export const ELITE_BUNDLE_PRODUCT_IDS = ['203194055', '203666651', '203449111'] as const;

/**
 * Whether to emit a separate add-on pharmacy fee line for this order.
 * When the same products are already billed as medication line items, skip the duplicate fee row.
 */
export function shouldEmitAddonPharmacyFee(addonKey: AddonKey, rxMedicationKeys: string[]): boolean {
  const keySet = new Set(rxMedicationKeys);
  if (addonKey === 'elite_bundle') {
    return !ELITE_BUNDLE_PRODUCT_IDS.every((id) => keySet.has(id));
  }
  const productId = Object.entries(ADDON_MEDICATION_KEY_TO_ADDON).find(
    ([, v]) => v === addonKey,
  )?.[0];
  if (productId) {
    return !keySet.has(productId);
  }
  return true;
}

/**
 * Detect addon keys from an order's Rx medication keys.
 * If all 3 individual addons are present, returns 'elite_bundle' instead.
 */
export function detectAddonKeysFromRxs(medicationKeys: string[]): AddonKey[] {
  const keys = new Set<AddonKey>();
  for (const mk of medicationKeys) {
    const addonKey = ADDON_MEDICATION_KEY_TO_ADDON[mk];
    if (addonKey) keys.add(addonKey);
  }
  if (keys.has('nad_plus') && keys.has('sermorelin') && keys.has('b12')) {
    return ['elite_bundle'];
  }
  return [...keys];
}
