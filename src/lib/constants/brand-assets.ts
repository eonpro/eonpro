/**
 * Centralized brand asset paths.
 * All images are self-hosted under /public/images/ and served from our own CDN.
 */

export const BRAND = {
  logos: {
    /** Full EONPRO wordmark (SVG) – sidebars, headers, footers */
    eonproLogo: '/images/logos/eonpro-logo.svg',
    /** EONPRO wordmark for dark backgrounds (green icon + white text) */
    eonproLogoDark: '/images/logos/eonpro-logo-dark.svg',
    /** Square EONPRO icon (SVG) – collapsed sidebar, favicon-like uses */
    eonproIcon: '/images/logos/EONPro favicon.svg',
    /** High-res logo for PDF generation (intake forms, invoices) */
    eonproLogoPdf: '/images/logos/eonpro-logo-pdf.png',
    /** Alternate logo used on affiliate landing pages */
    affiliateLogo: '/images/logos/affiliate-logo.svg',
  },

  partners: {
    dosepost: '/images/logos/dosepost-logo.svg',
    lifefile: '/images/logos/lifefile-logo.svg',
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
export const EONPRO_LOGO_DARK = BRAND.logos.eonproLogoDark;
export const EONPRO_ICON = BRAND.logos.eonproIcon;

/**
 * LogosRx (pharmacy) brand constants.
 * Single source of truth — import from here instead of defining per-file.
 */
export const LOGOSRX = {
  HOST: 'logosrx.eonpro.io',
  PRIMARY: '#7C3AED',
  LOGO: 'https://static.wixstatic.com/shapes/c49a9b_70a8d7f88d384ab9956055674c2632a7.svg',
  ICON: 'https://static.wixstatic.com/shapes/c49a9b_3ec136783b554ea3af0db59751e8c37d.svg',
  WHITE_LOGO: 'https://static.wixstatic.com/shapes/c49a9b_ed88aadf7f9b426f990b60e1965c329b.svg',
  NAME: 'LogosRx',
} as const;

/**
 * SIPAMed brand constants — self-hosted to avoid S3/CDN upload failures.
 */
export const SIPAMED = {
  HOST: 'sipa.eonpro.io',
  PRIMARY: '#1E3A5F',
  LOGO: '/images/logos/SIPA LOGO.png',
  ICON: '/images/logos/SIPA ICON.png',
  NAME: 'SIPAMed',
} as const;

/** Returns true when running on the LogosRx pharmacy hostname. */
export function isLogosRxHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase() === LOGOSRX.HOST;
}

/** Returns true when running on the SIPAMed hostname. */
export function isSipaMedHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase() === SIPAMED.HOST;
}

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
