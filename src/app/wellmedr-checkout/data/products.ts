import { ProductNameType, ProductType } from '@/app/wellmedr-checkout/types/checkout';

export const PRODUCT_NOBG_IMAGE = '/assets/images/products/glp1-no-bg.webp';
export const PRODUCT_IMAGE = '/assets/images/products/glp1.webp';

interface PriceConfig {
  monthly: number;
  quarterly: number;
  sixMonth: number;
  twelveMonth: number;
}

const PRICES: Record<ProductNameType, { injections: PriceConfig; tablets: PriceConfig }> = {
  semaglutide: {
    injections: { monthly: 149, quarterly: 435, sixMonth: 720, twelveMonth: 1140 },
    tablets: { monthly: 199, quarterly: 537, sixMonth: 894, twelveMonth: 1428 },
  },
  tirzepatide: {
    injections: { monthly: 249, quarterly: 627, sixMonth: 1134, twelveMonth: 1980 },
    tablets: { monthly: 299, quarterly: 717, sixMonth: 1314, twelveMonth: 2268 },
  },
};

export const products: Record<ProductNameType, ProductType> = {
  semaglutide: {
    pricing: {
      injections: {
        monthlyPrice: PRICES.semaglutide.injections.monthly,
        quarterlyPrice: PRICES.semaglutide.injections.quarterly,
        sixMonthPrice: PRICES.semaglutide.injections.sixMonth,
        annualPrice: PRICES.semaglutide.injections.twelveMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
      tablets: {
        monthlyPrice: PRICES.semaglutide.tablets.monthly,
        quarterlyPrice: PRICES.semaglutide.tablets.quarterly,
        sixMonthPrice: PRICES.semaglutide.tablets.sixMonth,
        annualPrice: PRICES.semaglutide.tablets.twelveMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
    },
    badgeText: 'Proven & Steady',
    additionalFeatures: [
      'Proven GLP-1 appetite control',
      'Lower starting cost',
    ],
  },
  tirzepatide: {
    pricing: {
      injections: {
        monthlyPrice: PRICES.tirzepatide.injections.monthly,
        quarterlyPrice: PRICES.tirzepatide.injections.quarterly,
        sixMonthPrice: PRICES.tirzepatide.injections.sixMonth,
        annualPrice: PRICES.tirzepatide.injections.twelveMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
      tablets: {
        monthlyPrice: PRICES.tirzepatide.tablets.monthly,
        quarterlyPrice: PRICES.tirzepatide.tablets.quarterly,
        sixMonthPrice: PRICES.tirzepatide.tablets.sixMonth,
        annualPrice: PRICES.tirzepatide.tablets.twelveMonth,
        image: PRODUCT_IMAGE,
        noBgImage: PRODUCT_NOBG_IMAGE,
        rotatedImage: PRODUCT_NOBG_IMAGE,
      },
    },
    badgeText: 'Most Powerful Option',
    additionalFeatures: [
      'Strongest appetite suppression',
      'Fastest results',
    ],
  },
};
