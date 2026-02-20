'use client';

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Language, LocalizedString } from '../types/form-engine';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  getText: (ls: LocalizedString | undefined) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';

  const languages = navigator.languages || [navigator.language];
  for (const lang of languages) {
    if (lang?.toLowerCase().startsWith('es')) return 'es';
    if (lang?.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}

function getUrlLanguageParam(): Language | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang')?.toLowerCase();
  if (lang === 'en' || lang === 'es') return lang;
  return null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    const urlLang = getUrlLanguageParam();
    if (urlLang) {
      setLanguage(urlLang);
      localStorage.setItem('intake-language', urlLang);
      return;
    }

    const saved = localStorage.getItem('intake-language') as Language;
    if (saved === 'en' || saved === 'es') {
      setLanguage(saved);
    } else {
      const detected = detectBrowserLanguage();
      setLanguage(detected);
      localStorage.setItem('intake-language', detected);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('intake-language', lang);
  };

  const getText = (ls: LocalizedString | undefined): string => {
    if (!ls) return '';
    return ls[language] ?? ls.en ?? '';
  };

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage: handleSetLanguage, getText }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
