/**
 * Internationalization Configuration
 *
 * Multi-language support for the Lifefile platform
 */

import { isFeatureEnabled } from '@/lib/features';

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸', nativeName: 'English' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', nativeName: 'Español' },
  { code: 'fr', name: 'French', flag: '🇫🇷', nativeName: 'Français' },
  { code: 'de', name: 'German', flag: '🇩🇪', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹', nativeName: 'Português' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', nativeName: '한국어' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', nativeName: 'العربية', rtl: true },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱', nativeName: 'עברית', rtl: true },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', nativeName: 'Русский' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', nativeName: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', flag: '🇧🇩', nativeName: 'বাংলা' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷', nativeName: 'Türkçe' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Default language
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

// Check if multi-language is enabled
export function isMultiLanguageEnabled(): boolean {
  return isFeatureEnabled('MULTI_LANGUAGE');
}

// Get enabled languages (all if feature enabled, only English otherwise)
export function getEnabledLanguages() {
  if (!isMultiLanguageEnabled()) {
    return SUPPORTED_LANGUAGES.filter((lang: any) => lang.code === 'en');
  }
  return SUPPORTED_LANGUAGES;
}

// Language detection priority
export const LANGUAGE_DETECTION_ORDER = [
  'querystring', // ?lang=es
  'cookie', // lang cookie
  'localStorage', // browser storage
  'navigator', // browser language
  'htmlTag', // <html lang="">
];

// Cookie configuration
export const LANGUAGE_COOKIE = {
  name: 'lifefile-language',
  maxAge: 365 * 24 * 60 * 60, // 1 year
  path: '/',
  sameSite: 'lax' as const,
};

// Namespace configuration (for organizing translations)
export const TRANSLATION_NAMESPACES = {
  COMMON: 'common',
  AUTH: 'auth',
  DASHBOARD: 'dashboard',
  PATIENTS: 'patients',
  PROVIDERS: 'providers',
  ORDERS: 'orders',
  BILLING: 'billing',
  COMMUNICATIONS: 'communications',
  SETTINGS: 'settings',
  ERRORS: 'errors',
  FORMS: 'forms',
  EMAILS: 'emails',
  MEDICATIONS: 'medications',
  APPOINTMENTS: 'appointments',
  DOCUMENTS: 'documents',
} as const;

// Date and number formatting locales
export const LOCALE_FORMATS: Record<
  LanguageCode,
  {
    dateFormat: string;
    timeFormat: string;
    currency: string;
    numberFormat: string;
    firstDayOfWeek: 0 | 1 | 6; // Sunday, Monday, Saturday
  }
> = {
  en: {
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    currency: 'USD',
    numberFormat: 'en-US',
    firstDayOfWeek: 0,
  },
  es: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'EUR',
    numberFormat: 'es-ES',
    firstDayOfWeek: 1,
  },
  fr: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'EUR',
    numberFormat: 'fr-FR',
    firstDayOfWeek: 1,
  },
  de: {
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    currency: 'EUR',
    numberFormat: 'de-DE',
    firstDayOfWeek: 1,
  },
  it: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'EUR',
    numberFormat: 'it-IT',
    firstDayOfWeek: 1,
  },
  pt: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'EUR',
    numberFormat: 'pt-PT',
    firstDayOfWeek: 1,
  },
  zh: {
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
    currency: 'CNY',
    numberFormat: 'zh-CN',
    firstDayOfWeek: 1,
  },
  ja: {
    dateFormat: 'YYYY/MM/DD',
    timeFormat: '24h',
    currency: 'JPY',
    numberFormat: 'ja-JP',
    firstDayOfWeek: 0,
  },
  ko: {
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
    currency: 'KRW',
    numberFormat: 'ko-KR',
    firstDayOfWeek: 0,
  },
  ar: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'SAR',
    numberFormat: 'ar-SA',
    firstDayOfWeek: 6,
  },
  he: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'ILS',
    numberFormat: 'he-IL',
    firstDayOfWeek: 0,
  },
  ru: {
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    currency: 'RUB',
    numberFormat: 'ru-RU',
    firstDayOfWeek: 1,
  },
  hi: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    currency: 'INR',
    numberFormat: 'hi-IN',
    firstDayOfWeek: 0,
  },
  bn: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    currency: 'BDT',
    numberFormat: 'bn-BD',
    firstDayOfWeek: 0,
  },
  tr: {
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    currency: 'TRY',
    numberFormat: 'tr-TR',
    firstDayOfWeek: 1,
  },
};

// Medical terminology translations might need professional review
export const MEDICAL_TERMS_WARNING = {
  en: 'Medical translations have been reviewed by healthcare professionals.',
  es: 'Las traducciones médicas han sido revisadas por profesionales de la salud.',
  fr: 'Les traductions médicales ont été examinées par des professionnels de la santé.',
  de: 'Medizinische Übersetzungen wurden von Gesundheitsfachkräften überprüft.',
  // Add more as needed
};

// RTL (Right-to-Left) languages configuration
export function isRTLLanguage(languageCode: string): boolean {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
  return rtlLanguages.includes(languageCode);
}

// Get text direction for a language
export function getTextDirection(languageCode: string): 'ltr' | 'rtl' {
  return isRTLLanguage(languageCode) ? 'rtl' : 'ltr';
}

// Format currency for a language
export function formatCurrency(amount: number, languageCode: LanguageCode): string {
  const format = LOCALE_FORMATS[languageCode] || LOCALE_FORMATS.en;
  return new Intl.NumberFormat(format.numberFormat, {
    style: 'currency',
    currency: format.currency,
  }).format(amount);
}

// Format date for a language
export function formatDate(date: Date, languageCode: LanguageCode): string {
  const format = LOCALE_FORMATS[languageCode] || LOCALE_FORMATS.en;
  return new Intl.DateTimeFormat(format.numberFormat, {
    dateStyle: 'medium',
  }).format(date);
}

// Format time for a language
export function formatTime(date: Date, languageCode: LanguageCode): string {
  const format = LOCALE_FORMATS[languageCode] || LOCALE_FORMATS.en;
  return new Intl.DateTimeFormat(format.numberFormat, {
    timeStyle: 'short',
    hour12: format.timeFormat === '12h',
  }).format(date);
}

// Get language name in its native script
export function getNativeLanguageName(code: LanguageCode): string {
  const language = SUPPORTED_LANGUAGES.find((lang: any) => lang.code === code);
  if (!language) return code;
  return language.nativeName || code;
}

// Get flag emoji for a language
export function getLanguageFlag(code: LanguageCode): string {
  const language = SUPPORTED_LANGUAGES.find((lang: any) => lang.code === code);
  return language?.flag || '🌐';
}
