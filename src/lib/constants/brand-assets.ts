/**
 * Centralized brand asset paths.
 * All images are self-hosted under /public/images/ and served from our own CDN.
 */

export const BRAND = {
  logos: {
    /** Full EONPRO wordmark (SVG) – sidebars, headers, footers */
    eonproLogo: '/images/logos/eonpro-logo.svg',
    /** Square EONPRO icon (PNG) – collapsed sidebar, favicon-like uses */
    eonproIcon: '/images/logos/eonpro-icon.png',
    /** High-res logo for PDF generation (intake forms, invoices) */
    eonproLogoPdf: '/images/logos/eonpro-logo-pdf.png',
    /** Alternate logo used on affiliate landing pages */
    affiliateLogo: '/images/logos/affiliate-logo.svg',
  },

  press: {
    foxNews: '/images/press/fox-news.svg',
    mensHealth: '/images/press/mens-health.svg',
    gq: '/images/press/gq.svg',
    businessInsider: '/images/press/business-insider.svg',
    miamiHerald: '/images/press/miami-herald.svg',
  },

  brand: {
    googleStars: '/images/logos/google-stars.svg',
    categorySex: '/images/brand/category-sex.png',
    categoryPeptides: '/images/brand/category-peptides.webp',
    categoryYoung: '/images/brand/category-young.png',
    categoryTestosterone: '/images/brand/category-testosterone.webp',
    categoryWeight: '/images/brand/category-weight.webp',
  },
  cardNetworks: {
    visa: '/images/cc-logos/visa.svg',
    mastercard: '/images/cc-logos/mastercard.svg',
    amex: '/images/cc-logos/amex.svg',
    discover: '/images/cc-logos/discover.svg',
  },
} as const;

export const EONPRO_LOGO = BRAND.logos.eonproLogo;
export const EONPRO_ICON = BRAND.logos.eonproIcon;

/** Resolves a Stripe/stored card brand string to a local logo path, or null if unknown. */
export function getCardNetworkLogo(brand: string): string | null {
  const key = brand.toLowerCase().replace(/[\s-_]/g, '') as string;
  const map: Record<string, string> = {
    visa: BRAND.cardNetworks.visa,
    mastercard: BRAND.cardNetworks.mastercard,
    amex: BRAND.cardNetworks.amex,
    americanexpress: BRAND.cardNetworks.amex,
    discover: BRAND.cardNetworks.discover,
  };
  return map[key] ?? null;
}
