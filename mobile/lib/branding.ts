import { createContext, useContext } from 'react';

export interface PortalFeatures {
  showBMICalculator: boolean;
  showCalorieCalculator: boolean;
  showDoseCalculator: boolean;
  showShipmentTracking: boolean;
  showMedicationReminders: boolean;
  showWeightTracking: boolean;
  showResources: boolean;
  showBilling: boolean;
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
}

export const DEFAULT_FEATURES: PortalFeatures = {
  showBMICalculator: true,
  showCalorieCalculator: true,
  showDoseCalculator: true,
  showShipmentTracking: true,
  showMedicationReminders: true,
  showWeightTracking: true,
  showResources: true,
  showBilling: true,
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

export interface BrandColors {
  primary: string;
  primaryLight: string;
  primaryMedium: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  primaryText: string;
  secondaryText: string;
  accentText: string;
}

export interface BrandTheme {
  colors: BrandColors;
  logo: {
    full: string | null;
    icon: string | null;
  };
  clinic: {
    id: number;
    name: string;
    welcomeMessage: string | null;
    dashboardMessage: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
    supportHours: string | null;
    emergencyContact: string | null;
  };
  features: PortalFeatures;
  treatment: {
    types: string[];
    primaryTreatment: string;
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function getContrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

function withOpacity(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export function buildThemeFromBranding(data: Record<string, unknown>): BrandTheme {
  const primary = (data.primaryColor as string) || '#4fa77e';
  const secondary = (data.secondaryColor as string) || '#3B82F6';
  const accent = (data.accentColor as string) || '#d3f931';

  return {
    colors: {
      primary,
      primaryLight: withOpacity(primary, 0.15),
      primaryMedium: withOpacity(primary, 0.3),
      primaryDark: withOpacity(primary, 0.8),
      secondary,
      accent,
      primaryText: getContrastText(primary),
      secondaryText: getContrastText(secondary),
      accentText: getContrastText(accent),
    },
    logo: {
      full: (data.logoUrl as string) ?? null,
      icon: (data.iconUrl as string) ?? null,
    },
    clinic: {
      id: (data.clinicId as number) ?? 0,
      name: (data.clinicName as string) ?? '',
      welcomeMessage: (data.welcomeMessage as string) ?? null,
      dashboardMessage: (data.dashboardMessage as string) ?? null,
      supportEmail: (data.supportEmail as string) ?? null,
      supportPhone: (data.supportPhone as string) ?? null,
      supportHours: (data.supportHours as string) ?? null,
      emergencyContact: (data.emergencyContact as string) ?? null,
    },
    features: {
      ...DEFAULT_FEATURES,
      ...((data.features as Partial<PortalFeatures>) ?? {}),
    },
    treatment: {
      types: (data.treatmentTypes as string[]) ?? [],
      primaryTreatment: (data.primaryTreatment as string) ?? 'weight_loss',
    },
  };
}

const DEFAULT_THEME: BrandTheme = {
  colors: {
    primary: '#4fa77e',
    primaryLight: 'rgba(79, 167, 126, 0.15)',
    primaryMedium: 'rgba(79, 167, 126, 0.3)',
    primaryDark: 'rgba(79, 167, 126, 0.8)',
    secondary: '#3B82F6',
    accent: '#d3f931',
    primaryText: '#ffffff',
    secondaryText: '#ffffff',
    accentText: '#1a1a1a',
  },
  logo: { full: null, icon: null },
  clinic: {
    id: 0,
    name: 'Health Portal',
    welcomeMessage: null,
    dashboardMessage: null,
    supportEmail: null,
    supportPhone: null,
    supportHours: null,
    emergencyContact: null,
  },
  features: DEFAULT_FEATURES,
  treatment: { types: [], primaryTreatment: 'weight_loss' },
};

export interface BrandingContextValue {
  theme: BrandTheme;
  isLoading: boolean;
  error: string | null;
  refreshBranding: () => Promise<void>;
}

export const BrandingContext = createContext<BrandingContextValue>({
  theme: DEFAULT_THEME,
  isLoading: true,
  error: null,
  refreshBranding: async () => {},
});

export function useBrandTheme(): BrandTheme {
  return useContext(BrandingContext).theme;
}

export function usePortalFeatures(): PortalFeatures {
  return useContext(BrandingContext).theme.features;
}

export function useBrandColors(): BrandColors {
  return useContext(BrandingContext).theme.colors;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
