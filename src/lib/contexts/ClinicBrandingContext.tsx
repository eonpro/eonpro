'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';

export interface ClinicBranding {
  clinicId: number;
  clinicName: string;
  logoUrl: string | null;
  iconUrl: string | null; // App icon for PWA/mobile (192x192)
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonTextColor: 'auto' | 'light' | 'dark'; // Controls text color on buttons
  customCss: string | null;
  // Feature flags for patient portal
  features: {
    showBMICalculator: boolean;
    showCalorieCalculator: boolean;
    showDoseCalculator: boolean;
    showShipmentTracking: boolean;
    showMedicationReminders: boolean;
    showWeightTracking: boolean;
    showResources: boolean;
    showBilling: boolean;
  };
  // Resource videos configurable per clinic
  resourceVideos: Array<{
    id: string;
    title: string;
    description: string;
    url: string;
    thumbnail: string;
    category: string;
  }>;
  // Contact info
  supportEmail: string | null;
  supportPhone: string | null;
}

interface ClinicBrandingContextValue {
  branding: ClinicBranding | null;
  isLoading: boolean;
  error: string | null;
  refreshBranding: () => Promise<void>;
  // CSS variables for theming
  cssVariables: Record<string, string>;
}

const defaultFeatures = {
  showBMICalculator: true,
  showCalorieCalculator: true,
  showDoseCalculator: true,
  showShipmentTracking: true,
  showMedicationReminders: true,
  showWeightTracking: true,
  showResources: true,
  showBilling: true,
};

const defaultBranding: ClinicBranding = {
  clinicId: 0,
  clinicName: 'EONPRO',
  logoUrl: null,
  iconUrl: null,
  faviconUrl: null,
  primaryColor: '#4fa77e',
  secondaryColor: '#3B82F6',
  accentColor: '#d3f931',
  buttonTextColor: 'auto',
  customCss: null,
  features: defaultFeatures,
  resourceVideos: [],
  supportEmail: null,
  supportPhone: null,
};

/**
 * Calculate relative luminance of a color
 * Used to determine if text should be light or dark for contrast
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;

  const [r, g, b] = rgb.split(', ').map(Number);
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Determine the best text color (light/dark) for a given background
 * Returns 'light' for white text, 'dark' for black text
 */
export function getContrastTextColor(bgColor: string, mode: 'auto' | 'light' | 'dark' = 'auto'): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';

  // Auto mode: calculate based on luminance
  const luminance = getLuminance(bgColor);
  // Use 0.5 as threshold - darker backgrounds get light text
  return luminance > 0.5 ? 'dark' : 'light';
}

const ClinicBrandingContext = createContext<ClinicBrandingContextValue | null>(null);

interface ClinicBrandingProviderProps {
  children: ReactNode;
  clinicId?: number;
  initialBranding?: ClinicBranding | null;
}

// Helper function to generate CSS variables from branding
function generateCssVariables(branding: ClinicBranding): Record<string, string> {
  // Calculate text colors for each background
  const primaryTextColor = getContrastTextColor(branding.primaryColor, branding.buttonTextColor);
  const secondaryTextColor = getContrastTextColor(branding.secondaryColor, branding.buttonTextColor);
  const accentTextColor = getContrastTextColor(branding.accentColor, branding.buttonTextColor);

  return {
    '--brand-primary': branding.primaryColor,
    '--brand-secondary': branding.secondaryColor,
    '--brand-accent': branding.accentColor,
    '--brand-primary-light': `${branding.primaryColor}15`,
    '--brand-primary-medium': `${branding.primaryColor}30`,
    '--brand-secondary-light': `${branding.secondaryColor}15`,
    '--brand-accent-light': `${branding.accentColor}30`,
    // Text colors for buttons (light = white, dark = black)
    '--brand-primary-text': primaryTextColor === 'light' ? '#ffffff' : '#1f2937',
    '--brand-secondary-text': secondaryTextColor === 'light' ? '#ffffff' : '#1f2937',
    '--brand-accent-text': accentTextColor === 'light' ? '#ffffff' : '#1f2937',
  };
}

// Helper to convert hex to RGB for opacity support
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return '79, 167, 126'; // Default green
}

export function ClinicBrandingProvider({
  children,
  clinicId,
  initialBranding,
}: ClinicBrandingProviderProps) {
  const [branding, setBranding] = useState<ClinicBranding | null>(initialBranding || null);
  const [isLoading, setIsLoading] = useState(!initialBranding);
  const [error, setError] = useState<string | null>(null);

  const fetchBranding = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get clinic ID from localStorage user data if not provided
      let cId = clinicId;
      if (!cId) {
        const user = localStorage.getItem('user');
        if (user) {
          const userData = JSON.parse(user);
          cId = userData.clinicId;
        }
      }

      if (!cId) {
        // Use default branding if no clinic
        setBranding(defaultBranding);
        return;
      }

      const response = await fetch(`/api/patient-portal/branding?clinicId=${cId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setBranding(defaultBranding);
          return;
        }
        throw new Error('Failed to fetch clinic branding');
      }

      const data = await response.json();
      setBranding({
        ...defaultBranding,
        ...data,
        features: { ...defaultFeatures, ...data.features },
      });
    } catch (err) {
      console.error('Error fetching clinic branding:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setBranding(defaultBranding);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialBranding) {
      fetchBranding();
    }
  }, [clinicId, initialBranding]);

  // Inject CSS variables into document
  useEffect(() => {
    if (branding) {
      const root = document.documentElement;
      const variables = generateCssVariables(branding);

      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });

      // Also set RGB versions for rgba() usage
      root.style.setProperty('--brand-primary-rgb', hexToRgb(branding.primaryColor));
      root.style.setProperty('--brand-secondary-rgb', hexToRgb(branding.secondaryColor));
      root.style.setProperty('--brand-accent-rgb', hexToRgb(branding.accentColor));

      // Inject custom CSS if provided
      if (branding.customCss) {
        let styleEl = document.getElementById('clinic-custom-css');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'clinic-custom-css';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = branding.customCss;
      }

      // Update favicon if provided
      if (branding.faviconUrl) {
        const existingFavicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (existingFavicon) {
          existingFavicon.href = branding.faviconUrl;
        } else {
          const newFavicon = document.createElement('link');
          newFavicon.rel = 'icon';
          newFavicon.href = branding.faviconUrl;
          document.head.appendChild(newFavicon);
        }
      }

      // Update apple-touch-icon if iconUrl is provided (for PWA/mobile)
      if (branding.iconUrl) {
        let appleTouchIcon = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
        if (appleTouchIcon) {
          appleTouchIcon.href = branding.iconUrl;
        } else {
          appleTouchIcon = document.createElement('link');
          appleTouchIcon.rel = 'apple-touch-icon';
          appleTouchIcon.href = branding.iconUrl;
          document.head.appendChild(appleTouchIcon);
        }
      }

      // Update document title with clinic name
      if (branding.clinicName && branding.clinicName !== 'EONPRO') {
        const currentTitle = document.title;
        if (!currentTitle.includes(branding.clinicName)) {
          // Preserve page-specific title but add clinic name
          const pagePart = currentTitle.split(' | ').pop() || currentTitle;
          document.title = `${pagePart} | ${branding.clinicName}`;
        }
      }
    }
  }, [branding]);

  const cssVariables = useMemo(() => {
    return branding ? generateCssVariables(branding) : {};
  }, [branding]);

  const refreshBranding = async () => {
    await fetchBranding();
  };

  return (
    <ClinicBrandingContext.Provider
      value={{
        branding,
        isLoading,
        error,
        refreshBranding,
        cssVariables,
      }}
    >
      {children}
    </ClinicBrandingContext.Provider>
  );
}

export function useClinicBranding() {
  const context = useContext(ClinicBrandingContext);
  if (!context) {
    throw new Error('useClinicBranding must be used within ClinicBrandingProvider');
  }
  return context;
}

// Helper hook for getting branding with fallbacks
export function useBrandingColors() {
  const { branding } = useClinicBranding();

  const buttonTextMode = branding?.buttonTextColor || 'auto';

  return {
    primary: branding?.primaryColor || '#4fa77e',
    secondary: branding?.secondaryColor || '#3B82F6',
    accent: branding?.accentColor || '#d3f931',
    logo: branding?.logoUrl,
    icon: branding?.iconUrl,
    favicon: branding?.faviconUrl,
    clinicName: branding?.clinicName || 'EONPRO',
    buttonTextMode,
    // Computed text colors for each brand color
    primaryTextColor: getContrastTextColor(branding?.primaryColor || '#4fa77e', buttonTextMode),
    secondaryTextColor: getContrastTextColor(branding?.secondaryColor || '#3B82F6', buttonTextMode),
    accentTextColor: getContrastTextColor(branding?.accentColor || '#d3f931', buttonTextMode),
  };
}

// Helper hook for feature flags
export function usePortalFeatures() {
  const { branding } = useClinicBranding();
  return branding?.features || defaultFeatures;
}
