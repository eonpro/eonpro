'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  PatientPortalLang,
  getPatientPortalTranslation,
  getStoredPatientPortalLanguage,
  setStoredPatientPortalLanguage,
} from '@/lib/i18n/patient-portal';

type PatientPortalLanguageContextValue = {
  language: PatientPortalLang;
  setLanguage: (lang: PatientPortalLang) => Promise<void>;
  t: (key: string) => string;
  loading: boolean;
};

const PatientPortalLanguageContext = createContext<PatientPortalLanguageContextValue | null>(null);

export function PatientPortalLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<PatientPortalLang>(() =>
    getStoredPatientPortalLanguage()
  );
  const [loading, setLoading] = useState(true);

  const t = useCallback((key: string) => getPatientPortalTranslation(language, key), [language]);

  const setLanguage = useCallback(async (lang: PatientPortalLang) => {
    setLanguageState(lang);
    setStoredPatientPortalLanguage(lang);
    setLoading(true);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('patient-token') ||
        localStorage.getItem('access_token');
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ preferredLanguage: lang }),
      });
    } catch {
      // Preference still saved in localStorage; will sync on next load if API is available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('patient-token') ||
      localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetch('/api/user/profile', {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.preferredLanguage === 'es' || data?.preferredLanguage === 'en') {
          setLanguageState(data.preferredLanguage);
          setStoredPatientPortalLanguage(data.preferredLanguage);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const value: PatientPortalLanguageContextValue = {
    language,
    setLanguage,
    t,
    loading,
  };

  return (
    <PatientPortalLanguageContext.Provider value={value}>
      {children}
    </PatientPortalLanguageContext.Provider>
  );
}

export function usePatientPortalLanguage(): PatientPortalLanguageContextValue {
  const ctx = useContext(PatientPortalLanguageContext);
  if (!ctx) {
    return {
      language: getStoredPatientPortalLanguage(),
      setLanguage: async () => {},
      t: (key: string) => getPatientPortalTranslation('en', key),
      loading: false,
    };
  }
  return ctx;
}
