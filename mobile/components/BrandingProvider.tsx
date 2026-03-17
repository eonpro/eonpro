import React, { useCallback, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appConfig } from '@/lib/config';
import {
  BrandingContext,
  BrandTheme,
  buildThemeFromBranding,
  DEFAULT_FEATURES,
} from '@/lib/branding';

const CACHE_KEY = `clinic-branding:${appConfig.clinicId}`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedBranding {
  data: Record<string, unknown>;
  timestamp: number;
}

async function getCachedBranding(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedBranding = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached.data;
  } catch {
    return null;
  }
}

async function setCachedBranding(data: Record<string, unknown>): Promise<void> {
  try {
    const cached: CachedBranding = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Non-critical: cache write failure is acceptable
  }
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
    id: appConfig.clinicId,
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

interface Props {
  children: ReactNode;
}

export default function BrandingProvider({ children }: Props) {
  const [theme, setTheme] = useState<BrandTheme>(DEFAULT_THEME);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBranding = useCallback(async () => {
    try {
      const response = await fetch(
        `${appConfig.apiBaseUrl}/api/patient-portal/branding?clinicId=${appConfig.clinicId}`
      );
      if (!response.ok) {
        throw new Error(`Branding fetch failed (${response.status})`);
      }
      const data = await response.json();
      const newTheme = buildThemeFromBranding(data);
      setTheme(newTheme);
      setError(null);
      await setCachedBranding(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branding');
    }
  }, []);

  const refreshBranding = useCallback(async () => {
    setIsLoading(true);
    await fetchBranding();
    setIsLoading(false);
  }, [fetchBranding]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Try cache first for instant UI
      const cached = await getCachedBranding();
      if (cached && mounted) {
        setTheme(buildThemeFromBranding(cached));
        setIsLoading(false);
      }

      // Always refresh in background
      await fetchBranding();
      if (mounted) setIsLoading(false);
    }

    init();
    return () => { mounted = false; };
  }, [fetchBranding]);

  return (
    <BrandingContext.Provider value={{ theme, isLoading, error, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}
