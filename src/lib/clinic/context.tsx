'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { logger } from '../logger';

import { Clinic } from '@prisma/client';

interface ClinicContextValue {
  clinic: Clinic | null;
  isLoading: boolean;
  error: string | null;
  switchClinic: (clinicId: number) => Promise<void>;
  refreshClinic: () => Promise<void>;
}

const ClinicContext = createContext<ClinicContextValue | null>(null);

interface ClinicProviderProps {
  children: ReactNode;
  initialClinic?: Clinic | null;
}

export function ClinicProvider({ children, initialClinic }: ClinicProviderProps) {
  const [clinic, setClinic] = useState<Clinic | null>(initialClinic || null);
  const [isLoading, setIsLoading] = useState(!initialClinic);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialClinic) {
      fetchCurrentClinic();
    }
  }, [initialClinic]);

  const fetchCurrentClinic = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/clinic/current');

      if (!response.ok) {
        if (response.status === 404) {
          // No clinic context, might need to select one
          setClinic(null);
          return;
        }
        throw new Error('Failed to fetch current clinic');
      }

      const data = await response.json();
      setClinic(data);
    } catch (err) {
      logger.error('Error fetching current clinic:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const switchClinic = async (clinicId: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });

      if (!response.ok) {
        throw new Error('Failed to switch clinic');
      }

      const data = await response.json();
      setClinic(data);

      // Set cookie for persistence
      document.cookie = `selected-clinic=${clinicId}; path=/; max-age=${30 * 24 * 60 * 60}`; // 30 days

      // Optionally reload the page to ensure all data is refreshed
      if (data.requiresReload) {
        window.location.reload();
      }
    } catch (err) {
      logger.error('Error switching clinic:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshClinic = async () => {
    await fetchCurrentClinic();
  };

  return (
    <ClinicContext.Provider
      value={{
        clinic,
        isLoading,
        error,
        switchClinic,
        refreshClinic,
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
}

export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within ClinicProvider');
  }
  return context;
};

// Helper hook for requiring clinic context
export const useRequireClinic = () => {
  const { clinic, isLoading, error } = useClinic();

  if (isLoading) {
    return { clinic: null, isReady: false };
  }

  if (!clinic) {
    throw new Error('Clinic context is required but not available');
  }

  return { clinic, isReady: true };
};
