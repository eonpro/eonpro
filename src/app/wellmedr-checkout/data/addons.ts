import { AddonId, AddonProduct } from '@/app/wellmedr-checkout/types/checkout';

export const ADDON_PRODUCTS: Record<AddonId, AddonProduct> = {
  nad_plus: {
    id: 'nad_plus',
    name: 'NAD+',
    description: 'Supports cellular energy, metabolism, and anti-aging',
    monthlyPrice: 99,
    isBundle: false,
  },
  sermorelin: {
    id: 'sermorelin',
    name: 'Sermorelin',
    description: 'Growth hormone peptide for recovery and body composition',
    monthlyPrice: 99,
    isBundle: false,
  },
  b12: {
    id: 'b12',
    name: 'Cyanocobalamin (B12)',
    description: 'Essential vitamin for energy, nerve function, and metabolism',
    monthlyPrice: 69,
    isBundle: false,
  },
  elite_bundle: {
    id: 'elite_bundle',
    name: 'Elite Bundle',
    description: 'All 3 add-ons — NAD+, Sermorelin & B12 — at a discounted rate',
    monthlyPrice: 199,
    isBundle: true,
    bundledAddonIds: ['nad_plus', 'sermorelin', 'b12'],
  },
};

export const INDIVIDUAL_ADDON_IDS: AddonId[] = ['nad_plus', 'sermorelin', 'b12'];
export const BUNDLE_ADDON_ID: AddonId = 'elite_bundle';

const INDIVIDUAL_TOTAL = INDIVIDUAL_ADDON_IDS.reduce(
  (sum, id) => sum + ADDON_PRODUCTS[id].monthlyPrice,
  0,
);
export const BUNDLE_SAVINGS = INDIVIDUAL_TOTAL - ADDON_PRODUCTS.elite_bundle.monthlyPrice;

/**
 * Calculate the flat addon total for a set of selected addons.
 * Add-ons are a flat charge added to each billing cycle regardless of plan interval.
 * If the elite bundle is selected, it replaces the individual prices.
 */
export function getAddonTotal(selectedAddons: AddonId[]): number {
  if (selectedAddons.includes('elite_bundle')) {
    return ADDON_PRODUCTS.elite_bundle.monthlyPrice;
  }
  return selectedAddons.reduce(
    (sum, id) => sum + (ADDON_PRODUCTS[id]?.monthlyPrice ?? 0),
    0,
  );
}
