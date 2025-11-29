/**
 * Translation Hook for React Components
 * 
 * Custom hook for accessing translations in the application
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '@/lib/logger';
import {
  DEFAULT_LANGUAGE, 
  LanguageCode, 
  LANGUAGE_COOKIE,
  isMultiLanguageEnabled,
  formatDate as formatDateUtil,
  formatTime as formatTimeUtil,
  formatCurrency as formatCurrencyUtil,
} from './config';
import Cookies from 'js-cookie';
import { AppError, ApiResponse } from '@/types/common';

// Translation storage
const translations: Record<string, Record<string, any>> = {};
let currentLanguage: LanguageCode = DEFAULT_LANGUAGE;

// Load translation file
async function loadTranslation(language: string, namespace: string = 'common') {
  const key = `${language}/${namespace}`;
  
  if (translations[key]) {
    return translations[key];
  }

  try {
    const response = await fetch(`/api/v2/i18n/translations?lang=${language}&ns=${namespace}`);
    if (response.ok) {
      const data = await response.json();
      translations[key] = data;
      return data;
    }
  } catch (error: any) {
    // @ts-ignore
   
    logger.error(`Failed to load translation: ${key}`, error);
  }

  // Fallback to English if translation fails
  if (language !== DEFAULT_LANGUAGE) {
    return loadTranslation(DEFAULT_LANGUAGE, namespace);
  }

  return {};
}

// Get nested translation value
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Replace placeholders in translation string
function interpolate(text: string, params?: Record<string, unknown>): string {
  if (!params) return text;
  
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key]?.toString() || match;
  });
}

// Translation function type
type TranslateFunction = (
  key: string,
  params?: Record<string, unknown>,
  defaultValue?: string
) => string;

// Plural function type
type PluralFunction = (
  key: string,
  count: number,
  params?: Record<string, unknown>
) => string;

// Translation hook return type
interface UseTranslationReturn {
  t: TranslateFunction;
  plural: PluralFunction;
  language: LanguageCode;
  changeLanguage: (lang: LanguageCode) => Promise<void>;
  isRTL: boolean;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatCurrency: (amount: number) => string;
  formatNumber: (num: number) => string;
  loading: boolean;
}

// Main translation hook
export function useTranslation(namespace: string = 'common'): UseTranslationReturn {
  const [language, setLanguageState] = useState<LanguageCode>(currentLanguage);
  const [translationData, setTranslationData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Load translations on mount and language change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await loadTranslation(language, namespace);
      setTranslationData(data);
      setLoading(false);
    };

    loadData();
  }, [language, namespace]);

  // Translation function
  const t: TranslateFunction = useCallback((key, params, defaultValue) => {
    const value = getNestedValue(translationData, key);
    
    if (value === undefined) {
      logger.warn(`Translation missing: ${key} in ${language}/${namespace}`);
      return defaultValue || key;
    }

    if (typeof value === 'string') {
      return interpolate(value, { value: params });
    }

    return value;
  }, [translationData, language, namespace]);

  // Plural function
  const plural: PluralFunction = useCallback((key, count, params) => {
    const pluralKey = count === 1 ? `${key}.one` : `${key}.other`;
    return t(pluralKey, { count, ...params }, `${count} ${key}`);
  }, [t]);

  // Change language
  const changeLanguage = useCallback(async (newLanguage: LanguageCode) => {
    if (!isMultiLanguageEnabled() && newLanguage !== DEFAULT_LANGUAGE) {
      logger.warn('Multi-language feature is not enabled');
      return;
    }

    currentLanguage = newLanguage;
    setLanguageState(newLanguage);
    
    // Save to cookie
    Cookies.set(LANGUAGE_COOKIE.name, newLanguage, {
      expires: LANGUAGE_COOKIE.maxAge / (24 * 60 * 60),
      path: LANGUAGE_COOKIE.path,
      sameSite: LANGUAGE_COOKIE.sameSite,
    });

    // Update HTML lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLanguage;
      document.documentElement.dir = isRTL(newLanguage) ? 'rtl' : 'ltr';
    }

    // Trigger global language change event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('languagechange', { detail: newLanguage }));
    }
  }, []);

  // Check if current language is RTL
  const isRTL = useCallback((lang: string) => {
    return ['ar', 'he', 'fa', 'ur'].includes(lang);
  }, []);

  // Formatting functions
  const formatDate = useCallback((date: Date) => {
    return formatDateUtil(date, language);
  }, [language]);

  const formatTime = useCallback((date: Date) => {
    return formatTimeUtil(date, language);
  }, [language]);

  const formatCurrency = useCallback((amount: number) => {
    return formatCurrencyUtil(amount, language);
  }, [language]);

  const formatNumber = useCallback((num: number) => {
    return new Intl.NumberFormat(language).format(num);
  }, [language]);

  return useMemo(() => ({
    t,
    plural,
    language,
    changeLanguage,
    isRTL: isRTL(language),
    formatDate,
    formatTime,
    formatCurrency,
    formatNumber,
    loading,
  }), [t, plural, language, changeLanguage, isRTL, formatDate, formatTime, formatCurrency, formatNumber, loading]);
}

// Initialize language from cookie or browser
export function initializeLanguage(): LanguageCode {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  // Check if multi-language is enabled
  if (!isMultiLanguageEnabled()) {
    currentLanguage = DEFAULT_LANGUAGE;
    return DEFAULT_LANGUAGE;
  }

  // Try to get from cookie
  const cookieLanguage = Cookies.get(LANGUAGE_COOKIE.name) as LanguageCode;
  if (cookieLanguage) {
    currentLanguage = cookieLanguage;
    return cookieLanguage;
  }

  // Try to get from browser
  const browserLanguage = navigator.language.split('-')[0] as LanguageCode;
  if (browserLanguage) {
    currentLanguage = browserLanguage;
    return browserLanguage;
  }

  return DEFAULT_LANGUAGE;
}

// Server-side translation function (for API routes, server components)
export async function getTranslation(
  language: LanguageCode,
  namespace: string = 'common'
): Promise<Record<string, any>> {
  return loadTranslation(language, namespace);
}

// Get all available translations for a namespace
export async function getAllTranslations(namespace: string = 'common') {
  const languages = isMultiLanguageEnabled() 
    ? ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'he', 'ru', 'hi', 'bn', 'tr']
    : ['en'];

  const allTranslations: Record<string, unknown> = {};
  
  for (const lang of languages) {
    allTranslations[lang] = await loadTranslation(lang, namespace);
  }

  return allTranslations;
}
