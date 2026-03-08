'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { isBrowser, getLocalStorageItem, setLocalStorageItem } from '@/lib/utils/ssr-safe';

// Treatment types supported by clinics
export type TreatmentType =
  | 'weight_loss'
  | 'hormone_therapy'
  | 'mens_health'
  | 'womens_health'
  | 'sexual_health'
  | 'anti_aging'
  | 'general_wellness'
  | 'custom';

// Medication categories
export type MedicationCategory =
  | 'glp1' // Semaglutide, Tirzepatide
  | 'testosterone'
  | 'hcg'
  | 'peptides'
  | 'vitamins'
  | 'compounded'
  | 'other';

export interface TreatmentProtocol {
  id: string;
  name: string;
  description: string;
  medicationCategories: MedicationCategory[];
  durationWeeks: number;
  checkInFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  requiresWeightTracking: boolean;
  requiresPhotos: boolean;
  requiresLabWork: boolean;
}

export interface ClinicBranding {
  clinicId: number;
  clinicName: string;
  subdomain: string | null;
  logoUrl: string | null;
  iconUrl: string | null; // App icon for PWA/mobile (192x192)
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonTextColor: 'auto' | 'light' | 'dark'; // Controls text color on buttons
  customCss: string | null;

  // Treatment configuration
  treatmentTypes: TreatmentType[];
  primaryTreatment: TreatmentType;
  treatmentProtocols: TreatmentProtocol[];
  medicationCategories: MedicationCategory[];

  // Feature flags for patient portal
  features: {
    // Core features
    showBMICalculator: boolean;
    showCalorieCalculator: boolean;
    showDoseCalculator: boolean;
    showShipmentTracking: boolean;
    showMedicationReminders: boolean;
    showWeightTracking: boolean;
    showResources: boolean;
    showBilling: boolean;
    // Treatment-specific features
    showProgressPhotos: boolean;
    showLabResults: boolean;
    showDietaryPlans: boolean;
    showExerciseTracking: boolean;
    showWaterTracking: boolean;
    showSleepTracking: boolean;
    showSymptomChecker: boolean;
    showHealthScore: boolean;
    showAchievements: boolean;
    showCommunityChat: boolean;
    showAppointments: boolean;
    showTelehealth: boolean;
    showChat: boolean;
    showCarePlan: boolean;
    showCareTeam: boolean;
    showDocuments?: boolean;
    showDevices?: boolean;
  };

  // Content customization
  welcomeMessage: string | null;
  dashboardMessage: string | null;

  // Resource videos configurable per clinic
  resourceVideos: Array<{
    id: string;
    title: string;
    description: string;
    url: string;
    thumbnail: string;
    category: string;
  }>;

  // Dietary plans configurable per clinic
  dietaryPlans: Array<{
    id: string;
    name: string;
    description: string;
    calorieTarget: number;
    pdfUrl: string | null;
  }>;

  // Contact info
  supportEmail: string | null;
  supportPhone: string | null;
  supportHours: string | null;
  emergencyContact: string | null;
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
  // Core features
  showBMICalculator: true,
  showCalorieCalculator: true,
  showDoseCalculator: true,
  showShipmentTracking: true,
  showMedicationReminders: true,
  showWeightTracking: true,
  showResources: true,
  showBilling: true,
  // Treatment-specific features
  showProgressPhotos: false,
  showLabResults: false,
  showDietaryPlans: true,
  showExerciseTracking: true,
  showWaterTracking: true,
  showSleepTracking: true,
  showSymptomChecker: true,
  showHealthScore: true,
  showAchievements: true,
  showCommunityChat: false,
  showAppointments: true,
  showTelehealth: false,
  showChat: true,
  showCarePlan: true,
  showCareTeam: true,
  showDocuments: true,
  showDevices: false,
};

const defaultBranding: ClinicBranding = {
  clinicId: 0,
  clinicName: 'EONPRO',
  subdomain: null,
  logoUrl: null,
  iconUrl: null,
  faviconUrl: null,
  primaryColor: '#4fa77e',
  secondaryColor: '#3B82F6',
  accentColor: '#d3f931',
  buttonTextColor: 'auto',
  customCss: null,
  // Treatment configuration
  treatmentTypes: ['weight_loss'],
  primaryTreatment: 'weight_loss',
  treatmentProtocols: [],
  medicationCategories: ['glp1'],
  features: defaultFeatures,
  // Content
  welcomeMessage: null,
  dashboardMessage: null,
  resourceVideos: [],
  dietaryPlans: [],
  // Contact
  supportEmail: null,
  supportPhone: null,
  supportHours: null,
  emergencyContact: null,
};

/**
 * Calculate relative luminance of a color
 * Used to determine if text should be light or dark for contrast
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;

  const [r, g, b] = rgb.split(', ').map(Number);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Determine the best text color (light/dark) for a given background
 * Returns 'light' for white text, 'dark' for black text
 */
export function getContrastTextColor(
  bgColor: string,
  mode: 'auto' | 'light' | 'dark' = 'auto'
): 'light' | 'dark' {
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
  const secondaryTextColor = getContrastTextColor(
    branding.secondaryColor,
    branding.buttonTextColor
  );
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

/**
 * Sanitize clinic custom CSS to prevent XSS and data exfiltration.
 * Blocks: @import, url(), expression(), behavior, -moz-binding, javascript:
 */
function sanitizeClinicCss(css: string): string {
  if (!css || typeof css !== 'string') return '';

  // Remove comments that could hide malicious code
  let sanitized = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Block dangerous CSS features
  const dangerousPatterns = [
    /@import\b/gi,
    /url\s*\(/gi,
    /expression\s*\(/gi,
    /behavior\s*:/gi,
    /-moz-binding\s*:/gi,
    /javascript\s*:/gi,
    /@charset\b/gi,
    /@namespace\b/gi,
    /@font-face\b/gi,
  ];

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '/* blocked */');
  }

  return sanitized.trim();
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
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (initialBranding) return;

    let cancelled = false;

    const BRANDING_CACHE_TTL = 10 * 60 * 1000; // 10 minutes fresh
    const BRANDING_CACHE_STALE_TTL = 60 * 60 * 1000; // 1 hour max stale
    const RESOLVE_TIMEOUT = 8000;
    const BRANDING_TIMEOUT = 15000;

    function getBrandingCacheKey(id: number) {
      return `clinic-branding:${id}`;
    }

    function getCachedBranding(id: number): { data: ClinicBranding; isStale: boolean } | null {
      const raw = getLocalStorageItem(getBrandingCacheKey(id));
      if (!raw) return null;
      try {
        const cached = JSON.parse(raw);
        if (!cached.data || !cached.ts) return null;
        const age = Date.now() - cached.ts;
        if (age > BRANDING_CACHE_STALE_TTL) return null;
        return { data: cached.data, isStale: age > BRANDING_CACHE_TTL };
      } catch {
        return null;
      }
    }

    function setCachedBranding(id: number, data: ClinicBranding) {
      setLocalStorageItem(getBrandingCacheKey(id), JSON.stringify({ data, ts: Date.now() }));
    }

    function mergeBranding(data: Record<string, unknown>): ClinicBranding {
      return {
        ...defaultBranding,
        ...data,
        features: { ...defaultFeatures, ...(data.features as Record<string, boolean> | undefined) },
      };
    }

    const fetchBranding = async () => {
      try {
        setError(null);

        // WHITE-LABEL BRANDING LOGIC:
        // Branding is determined by the DOMAIN, not the user's clinic assignment.
        // - app.eonpro.io = Always EONPRO branding (native app)
        // - wellmedr.eonpro.io = Wellmedr branding (white-labeled)
        // - ot.eonpro.io = OT branding (white-labeled)

        let cId = clinicId;

        if (isBrowser) {
          const domain = window.location.hostname;
          const isMainDomain =
            domain.includes('app.eonpro.io') ||
            domain === 'app.eonpro.io' ||
            domain === 'localhost' ||
            domain.startsWith('localhost:') ||
            domain.endsWith('.vercel.app');

          if (isMainDomain) {
            if (!cancelled) {
              setBranding(defaultBranding);
              setIsLoading(false);
            }
            return;
          }

          // Try localStorage cache for clinic ID resolution
          const cacheKey = `clinic-resolve:${domain}`;
          const cached = getLocalStorageItem(cacheKey);
          if (cached) {
            try {
              const cachedData = JSON.parse(cached);
              if (cachedData.clinicId && cachedData.ts && Date.now() - cachedData.ts < 3600_000) {
                cId = cachedData.clinicId;
              }
            } catch {
              // Invalid cache entry, will re-fetch
            }
          }

          if (!cId) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT);

              const resolveResponse = await fetch(
                `/api/clinic/resolve?domain=${encodeURIComponent(domain)}`,
                { signal: controller.signal }
              );
              clearTimeout(timeoutId);

              if (resolveResponse.ok) {
                const resolveData = await resolveResponse.json();
                if (resolveData.clinicId) {
                  cId = resolveData.clinicId;
                  try {
                    localStorage.setItem(cacheKey, JSON.stringify({ clinicId: cId, ts: Date.now() }));
                  } catch {
                    // localStorage may be full or disabled
                  }
                }
              } else {
                console.warn('[ClinicBranding] Failed to resolve clinic, using defaults');
              }
            } catch (resolveErr) {
              if ((resolveErr as Error).name === 'AbortError') {
                console.warn('[ClinicBranding] Timeout resolving clinic domain');
              } else {
                console.warn('[ClinicBranding] Could not resolve clinic from domain:', resolveErr);
              }
            }
          }
        }

        if (cancelled) return;

        if (!cId && clinicId) {
          cId = clinicId;
        }

        if (!cId && isBrowser) {
          const user = getLocalStorageItem('user');
          if (user) {
            try {
              const userData = JSON.parse(user);
              const domain = window.location.hostname;
              const isMainDomain =
                domain.includes('app.eonpro.io') ||
                domain === 'app.eonpro.io' ||
                domain === 'localhost' ||
                domain.startsWith('localhost:') ||
                domain.endsWith('.vercel.app');
              if (!isMainDomain) {
                cId = userData.clinicId;
              }
            } catch {
              // Invalid JSON in localStorage
            }
          }
        }

        if (!cId) {
          if (!cancelled) {
            setBranding(defaultBranding);
            setIsLoading(false);
          }
          return;
        }

        // STALE-WHILE-REVALIDATE: serve cached branding immediately, refresh in background
        const cachedBranding = getCachedBranding(cId);
        if (cachedBranding) {
          if (!cancelled) {
            setBranding(cachedBranding.data);
            setIsLoading(false);
          }
          if (!cachedBranding.isStale) {
            return; // Cache is fresh, no need to refetch
          }
          // Cache is stale — continue to refetch in background (isLoading stays false)
        } else {
          setIsLoading(true);
        }

        const brandingController = new AbortController();
        const brandingTimeoutId = setTimeout(() => brandingController.abort(), BRANDING_TIMEOUT);

        try {
          const response = await fetch(`/api/patient-portal/branding?clinicId=${cId}`, {
            signal: brandingController.signal,
            credentials: 'include',
          });
          clearTimeout(brandingTimeoutId);

          if (cancelled) return;

          if (!response.ok) {
            if (response.status === 404) {
              console.warn('[ClinicBranding] Clinic not found, using defaults');
              if (!cachedBranding) setBranding(defaultBranding);
              return;
            }
            console.warn('[ClinicBranding] Failed to fetch branding:', response.status);
            if (!cachedBranding) setBranding(defaultBranding);
            return;
          }

          const data = await response.json();
          if (!cancelled) {
            const merged = mergeBranding(data);
            setBranding(merged);
            setCachedBranding(cId, merged);
          }
        } catch (brandingErr) {
          clearTimeout(brandingTimeoutId);
          if ((brandingErr as Error).name === 'AbortError') {
            console.warn('[ClinicBranding] Timeout fetching branding');
          } else {
            console.warn('[ClinicBranding] Error fetching branding:', brandingErr);
          }
          // Only fall back to defaults if we have no cached branding
          if (!cancelled && !cachedBranding) setBranding(defaultBranding);
        }
      } catch (err) {
        console.error('Error fetching clinic branding:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setBranding(defaultBranding);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchBranding();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, initialBranding, refreshKey]);

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

      // Inject custom CSS if provided (sanitized to prevent XSS/data exfiltration)
      if (branding.customCss) {
        const sanitizedCss = sanitizeClinicCss(branding.customCss);
        if (sanitizedCss) {
          let styleEl = document.getElementById('clinic-custom-css');
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'clinic-custom-css';
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = sanitizedCss;
        }
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
        let appleTouchIcon = document.querySelector(
          "link[rel='apple-touch-icon']"
        ) as HTMLLinkElement;
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
    setRefreshKey((k) => k + 1);
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
