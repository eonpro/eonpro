"use client";

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
            className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            aria-label="Change language"
          >
            <Globe className="w-5 h-5 text-gray-600" />
            {showFlag && <span>{currentLang.flag}</span>}
            <span className="text-sm font-medium text-gray-700">
              {showNativeName ? currentLang.nativeName : currentLang.code.toUpperCase()}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
              <div className="py-2">
                {languages.map((lang: any) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageSelect(lang.code as LanguageCode)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3">
                      {showFlag && <span className="text-2xl">{lang.flag}</span>}
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {lang.nativeName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {lang.name}
                        </div>
                      </div>
                    </div>
                    {language === lang.code && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
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
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
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
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Globe className="w-5 h-5" />
            <span>Change Language</span>
          </button>

          {isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-xl font-semibold">Select Language</h2>
                </div>
                
                <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
                  {languages.map((lang: any) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageSelect(lang.code as LanguageCode)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        language === lang.code
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-3xl mb-2">{lang.flag}</div>
                      <div className="font-medium text-gray-900">
                        {lang.nativeName}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {lang.name}
                      </div>
                      {language === lang.code && (
                        <Check className="w-5 h-5 text-blue-600 mx-auto mt-2" />
                      )}
                    </button>
                  ))}
                </div>
                
                <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
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
        className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
