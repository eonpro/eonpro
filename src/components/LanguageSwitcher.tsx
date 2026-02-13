'use client';

/**
 * Language Switcher Component
 *
 * Allows users to change the application language
 */

import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  LanguageCode,
  getEnabledLanguages,
  isMultiLanguageEnabled,
} from '@/lib/i18n/config';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Feature } from '@/components/Feature';

interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'inline' | 'modal';
  showFlag?: boolean;
  showNativeName?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  variant = 'dropdown',
  showFlag = true,
  showNativeName = true,
  className = '',
}: LanguageSwitcherProps) {
  const { language, changeLanguage } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get enabled languages
  const languages = getEnabledLanguages();
  const currentLang = languages.find((l: any) => l.code === language) || languages[0];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle language selection
  const handleLanguageSelect = async (langCode: LanguageCode) => {
    await changeLanguage(langCode);
    setIsOpen(false);

    // Reload page to apply translations (optional, can use state management instead)
    if (typeof window !== 'undefined') {
      // Smooth transition instead of hard reload
      document.body.style.opacity = '0.5';
      setTimeout(() => {
        document.body.style.opacity = '1';
      }, 300);
    }
  };

  // Don't render if multi-language is not enabled
  if (!isMultiLanguageEnabled()) {
    return null;
  }

  // Dropdown variant
  if (variant === 'dropdown') {
    return (
      <Feature feature="MULTI_LANGUAGE">
        <div className={`relative ${className}`} ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-2 rounded-lg border border-gray-300 px-3 py-2 transition-colors hover:bg-gray-50"
            aria-label="Change language"
          >
            <Globe className="h-5 w-5 text-gray-600" />
            {showFlag && <span>{currentLang.flag}</span>}
            <span className="text-sm font-medium text-gray-700">
              {showNativeName ? currentLang.nativeName : currentLang.code.toUpperCase()}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isOpen && (
            <div className="absolute right-0 z-50 mt-2 max-h-96 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="py-2">
                {languages.map((lang: any) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageSelect(lang.code as LanguageCode)}
                    className="group flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3">
                      {showFlag && <span className="text-2xl">{lang.flag}</span>}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{lang.nativeName}</div>
                        <div className="text-xs text-gray-500">{lang.name}</div>
                      </div>
                    </div>
                    {language === lang.code && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Feature>
    );
  }

  // Inline variant
  if (variant === 'inline') {
    return (
      <Feature feature="MULTI_LANGUAGE">
        <div className={`flex flex-wrap gap-2 ${className}`}>
          {languages.map((lang: any) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code as LanguageCode)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                language === lang.code
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {showFlag && <span className="mr-1">{lang.flag}</span>}
              {showNativeName ? lang.nativeName : lang.code.toUpperCase()}
            </button>
          ))}
        </div>
      </Feature>
    );
  }

  // Modal variant
  if (variant === 'modal') {
    return (
      <Feature feature="MULTI_LANGUAGE">
        <div className={className}>
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            <Globe className="h-5 w-5" />
            <span>Change Language</span>
          </button>

          {isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white">
                <div className="border-b px-6 py-4">
                  <h2 className="text-xl font-semibold">Select Language</h2>
                </div>

                <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-6 sm:grid-cols-3">
                  {languages.map((lang: any) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageSelect(lang.code as LanguageCode)}
                      className={`rounded-lg border-2 p-4 transition-all ${
                        language === lang.code
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="mb-2 text-3xl">{lang.flag}</div>
                      <div className="font-medium text-gray-900">{lang.nativeName}</div>
                      <div className="mt-1 text-xs text-gray-500">{lang.name}</div>
                      {language === lang.code && (
                        <Check className="mx-auto mt-2 h-5 w-5 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t bg-gray-50 px-6 py-4">
                  <p className="text-sm text-gray-600">
                    Medical translations have been professionally reviewed
                  </p>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Feature>
    );
  }

  return null;
}

// Mini language switcher for header/footer
export function MiniLanguageSwitcher() {
  const { language, changeLanguage } = useTranslation();
  const languages = getEnabledLanguages();

  if (!isMultiLanguageEnabled() || languages.length <= 1) {
    return null;
  }

  return (
    <Feature feature="MULTI_LANGUAGE">
      <select
        value={language}
        onChange={(e: any) => changeLanguage(e.target.value as LanguageCode)}
        className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Select language"
      >
        {languages.map((lang: any) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.code.toUpperCase()}
          </option>
        ))}
      </select>
    </Feature>
  );
}
