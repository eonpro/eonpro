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
      monthly: 'price_1StAGYDfH4PWyxxdePAervoq',
      quarterly: 'price_1StAGXDfH4PWyxxdiDPj5YCT',
      sixMonth: 'price_1StAIqDfH4PWyxxdpKvzMVhV',
    },
    tablets: {
      monthly: 'price_1StAIVDfH4PWyxxdiKKHocUW',
      quarterly: 'price_1StAIUDfH4PWyxxdBr3ZAK50',
      sixMonth: 'price_1StAITDfH4PWyxxd0kpTnor1',
    },
  },
  tirzepatide: {
    injections: {
      monthly: 'price_1StAGdDfH4PWyxxdguJ3dcVa',
      quarterly: 'price_1StAGbDfH4PWyxxdYqbwetNF',
      sixMonth: 'price_1StAGaDfH4PWyxxdSvHqicEH',
    },
    tablets: {
      monthly: 'price_1StAGSDfH4PWyxxdcq4U4LIn',
      quarterly: 'price_1StAGQDfH4PWyxxdwUgpcciy',
      sixMonth: 'price_1StAGODfH4PWyxxduoLJXLd0',
    },
  },
};

/**
 * Stripe Price IDs for add-on products (one-time prices).
 * Add-ons are flat charges added to each subscription invoice regardless of billing interval.
 * Create these as one-time prices in WellMedR's Stripe connected account.
 */
const ADDON_STRIPE_PRICE_IDS: Record<AddonId, string> = {
  nad_plus: process.env.NEXT_PUBLIC_STRIPE_ADDON_NAD_PRICE || 'price_1TEFJTDfH4PWyxxdJY3Ngi7T',
  sermorelin: process.env.NEXT_PUBLIC_STRIPE_ADDON_SERM_PRICE || 'price_1TEFKJDfH4PWyxxdDZkq3vD5',
  b12: process.env.NEXT_PUBLIC_STRIPE_ADDON_B12_PRICE || 'price_1TEFJ8DfH4PWyxxdgUpek4Yt',
  elite_bundle: process.env.NEXT_PUBLIC_STRIPE_ADDON_ELITE_PRICE || 'price_1TEFKjDfH4PWyxxd4roD32Ae',
};

export const getStripePriceId = (
  productName: ProductNameType,
  medicationType: MedicationType,
  planType: 'monthly' | 'quarterly' | 'sixMonth',
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
