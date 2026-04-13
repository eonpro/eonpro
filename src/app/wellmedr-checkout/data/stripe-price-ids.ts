import { ProductNameType, MedicationType, AddonId } from '@/app/wellmedr-checkout/types/checkout';

// Fallback Stripe Price IDs (test mode)
// These are used if dynamic Stripe fetching fails
// Production IDs are fetched dynamically via stripe-server.ts
const STRIPE_PRICE_IDS: Record<
  ProductNameType,
  Record<MedicationType, Record<string, string>>
> = {
  semaglutide: {
    injections: {
      monthly: 'price_1T1ACMDfH4PWyxxd9epL77td',
      quarterly: 'price_1TFyg5DfH4PWyxxdpaD3QOOx',
      sixMonth: 'price_1TFyenDfH4PWyxxdKVUMqqIB',
      annual: 'price_1TFyeHDfH4PWyxxdFvA6Z2so',
    },
    tablets: {
      monthly: 'price_1T1ACMDfH4PWyxxd9epL77td',
      quarterly: 'price_1TFyg5DfH4PWyxxdpaD3QOOx',
      sixMonth: 'price_1TFyenDfH4PWyxxdKVUMqqIB',
      annual: 'price_1TFyeHDfH4PWyxxdFvA6Z2so',
    },
  },
  tirzepatide: {
    injections: {
      monthly: 'price_1T1AChDfH4PWyxxd0yWUKCVf',
      quarterly: 'price_1TFyfKDfH4PWyxxdT5t6CoQH',
      sixMonth: 'price_1TFydzDfH4PWyxxdGAVQR6HY',
      annual: 'price_1TFydaDfH4PWyxxdfrvVPVva',
    },
    tablets: {
      monthly: 'price_1T1AChDfH4PWyxxd0yWUKCVf',
      quarterly: 'price_1TFyfKDfH4PWyxxdT5t6CoQH',
      sixMonth: 'price_1TFydzDfH4PWyxxdGAVQR6HY',
      annual: 'price_1TFydaDfH4PWyxxdfrvVPVva',
    },
  },
};

/**
 * Stripe Price IDs for add-on products (one-time prices).
 * Add-ons are flat charges added to each subscription invoice regardless of billing interval.
 * Create these as one-time prices in WellMedR's Stripe connected account.
 */
const ADDON_STRIPE_PRICE_IDS: Record<AddonId, string> = {
  nad_plus: 'price_1TEFJTDfH4PWyxxdJY3Ngi7T',
  sermorelin: 'price_1TEFKJDfH4PWyxxdDZkq3vD5',
  b12: 'price_1TEFJ8DfH4PWyxxdgUpek4Yt',
  elite_bundle: 'price_1TEFKjDfH4PWyxxd4roD32Ae',
};

export const getStripePriceId = (
  productName: ProductNameType,
  medicationType: MedicationType,
  planType: 'monthly' | 'quarterly' | 'sixMonth' | 'annual',
): string => {
  const product = STRIPE_PRICE_IDS[productName];
  if (!product) {
    console.warn(`Product not found for stripe price id: ${productName}`);
    return '';
  }

  const type = product[medicationType];
  if (!type) {
    console.warn(
      `Medication type not found for stripe price id: ${medicationType}`,
    );
    return '';
  }

  const priceId = type[planType];
  if (!priceId) {
    console.warn(`Plan type not found for stripe price id: ${planType}`);
    return '';
  }

  return priceId;
};

export const getAddonStripePriceId = (addonId: AddonId): string => {
  const priceId = ADDON_STRIPE_PRICE_IDS[addonId];
  if (!priceId) {
    console.warn(`Addon not found for stripe price id: ${addonId}`);
    return '';
  }
  return priceId;
};
