'use client';

/**
 * Affiliate Branding Context
 *
 * Provides clinic branding data (colors, logo, feature flags, etc.)
 * to all affiliate dashboard pages via React Context.
 *
 * CSS custom properties are set on the layout root for colors so pages
 * can use var(--brand-primary) etc. without importing the context.
 * The context is used for non-CSS data: logo, names, feature flags, support info.
 */

import { createContext, useContext, ReactNode } from 'react';

export interface AffiliateBranding {
  clinicId: number;
  clinicName: string;
  affiliateName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCss: string | null;
  features: {
    showPerformanceChart: boolean;
    showRefCodeManager: boolean;
    showPayoutHistory: boolean;
    showResources: boolean;
  };
  supportEmail: string | null;
  supportPhone: string | null;
  resources: Array<{
    id: string;
    title: string;
    description: string;
    url: string;
    type: string;
  }>;
}

const defaultBranding: AffiliateBranding = {
  clinicId: 0,
  clinicName: '',
  affiliateName: 'Partner',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#111827',
  secondaryColor: '#6B7280',
  accentColor: '#10B981',
  customCss: null,
  features: {
    showPerformanceChart: true,
    showRefCodeManager: true,
    showPayoutHistory: true,
    showResources: true,
  },
  supportEmail: null,
  supportPhone: null,
  resources: [],
};

const BrandingContext = createContext<AffiliateBranding>(defaultBranding);

export function BrandingProvider({
  branding,
  children,
}: {
  branding: AffiliateBranding | null;
  children: ReactNode;
}) {
  return (
    <BrandingContext.Provider value={branding || defaultBranding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): AffiliateBranding {
  return useContext(BrandingContext);
}

/**
 * Compute CSS custom property values from branding.
 * The layout sets these on its root element so every descendant can use
 * var(--brand-primary), var(--brand-accent), etc.
 */
export function brandingToCssVars(b: AffiliateBranding | null): Record<string, string> {
  const primary = b?.primaryColor || '#111827';
  const secondary = b?.secondaryColor || '#6B7280';
  const accent = b?.accentColor || '#10B981';

  return {
    '--brand-primary': primary,
    '--brand-secondary': secondary,
    '--brand-accent': accent,
    '--brand-accent-light': hexToLightTint(accent),
    '--brand-bg': '#F9FAFB',
  };
}

/**
 * Convert a hex color to a very light tint (for card backgrounds).
 * e.g. #10B981 -> rgba(16, 185, 129, 0.08)
 */
function hexToLightTint(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#f5f5f5';
  return `rgba(${r}, ${g}, ${b}, 0.08)`;
}
