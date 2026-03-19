import { ProductNameType, ProductType } from '@/app/wellmedr-checkout/types/checkout';

export const PRODUCT_NOBG_IMAGE = '/assets/images/products/glp1-no-bg.webp';
export const PRODUCT_IMAGE = '/assets/images/products/glp1.webp';

interface PriceConfig {
  monthly: number;
  quarterly: number;
  sixMonth: number;
}

const PRICES: Record<ProductNameType, { injections: PriceConfig; tablets: PriceConfig }> = {
  semaglutide: {
    injections: { monthly: 199, quarterly: 507, sixMonth: 894 },
    tablets: { monthly: 279, quarterly: 587, sixMonth: 974 },
  },
  tirzepatide: {
    injections: { monthly: 299, quarterly: 777, sixMonth: 1434 },
    tablets: { monthly: 379, quarterly: 857, sixMonth: 1514 },
  },
};

export const products: Record<ProductNameType, ProductType> = {
  semaglutide: {
    pricing: {
      injections: {
        monthlyPrice: PRICES.semaglutide.injections.monthly,
        quarterlyPrice: PRICES.semaglutide.injections.quarterly,
        sixMonthPrice: PRICES.semaglutide.injections.sixMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
      tablets: {
        monthlyPrice: PRICES.semaglutide.tablets.monthly,
        quarterlyPrice: PRICES.semaglutide.tablets.quarterly,
        sixMonthPrice: PRICES.semaglutide.tablets.sixMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
    },
    badgeText: 'Most Affordable',
    additionalFeatures: ['Most popular, most affordable GLP-1 weight loss medication'],
  },
  tirzepatide: {
    pricing: {
      injections: {
        monthlyPrice: PRICES.tirzepatide.injections.monthly,
        quarterlyPrice: PRICES.tirzepatide.injections.quarterly,
        sixMonthPrice: PRICES.tirzepatide.injections.sixMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
      tablets: {
        monthlyPrice: PRICES.tirzepatide.tablets.monthly,
        quarterlyPrice: PRICES.tirzepatide.tablets.quarterly,
        sixMonthPrice: PRICES.tirzepatide.tablets.sixMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
    },
    badgeText: 'Most Potent',
  },
};
