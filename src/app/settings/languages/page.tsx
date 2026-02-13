'use client';

/**
 * Language Settings Page
 *
 * Configure language preferences and translations
 */

import React, { useState } from 'react';
import {
  Globe,
  Check,
  Languages,
  Download,
  Upload,
  AlertCircle,
  Info,
  Settings,
  ChevronRight,
  Calendar,
  DollarSign,
  Hash,
  Clock,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  SUPPORTED_LANGUAGES,
  LanguageCode,
  isMultiLanguageEnabled,
  LOCALE_FORMATS,
} from '@/lib/i18n/config';
import { Feature } from '@/components/Feature';

export default function LanguageSettingsPage() {
  const { t, language, changeLanguage, formatDate, formatTime, formatCurrency, formatNumber } =
    useTranslation();
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(language);
  const [autoDetect, setAutoDetect] = useState(false);
  const [translateMedical, setTranslateMedical] = useState(true);
  const [showRegionalFormats, setShowRegionalFormats] = useState(false);

  // Sample values for formatting preview
  const sampleDate = new Date();
  const sampleCurrency = 1234.56;
  const sampleNumber = 9876543.21;

  // Handle language selection
  const handleLanguageSelect = async (code: LanguageCode) => {
    setSelectedLang(code);
    await changeLanguage(code);
  };

  // Get language details
  const getLanguageDetails = (code: string) => {
    return SUPPORTED_LANGUAGES.find((lang: any) => lang.code === code);
  };

  return (
    <Feature feature="MULTI_LANGUAGE">
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Globe className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Language Settings</h1>
              </div>
              <LanguageSwitcher variant="dropdown" />
            </div>
            <p className="mt-2 text-gray-600">
              Configure language preferences and regional settings
            </p>
          </div>

          {/* Feature Status Alert */}
          {!isMultiLanguageEnabled() && (
            <div className="mb-6 flex items-start rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <AlertCircle className="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Feature Disabled</h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Multi-language support is currently disabled. Enable it in your environment
                  variables by setting MULTI_LANGUAGE=true.
                </p>
              </div>
            </div>
          )}

          {/* Main Settings */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Language Preference</h2>
            </div>

            <div className="p-6">
              {/* Current Language */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Current Language
                </label>
                <div className="flex items-center rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <span className="mr-3 text-3xl">{getLanguageDetails(language)?.flag}</span>
                  <div>
                    <p className="font-medium text-gray-900">
                      {getLanguageDetails(language)?.nativeName}
                    </p>
                    <p className="text-sm text-gray-600">{getLanguageDetails(language)?.name}</p>
                  </div>
                </div>
              </div>

              {/* Language Grid */}
              <div className="mb-6">
                <label className="mb-3 block text-sm font-medium text-gray-700">
                  Available Languages
                </label>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {SUPPORTED_LANGUAGES.map((lang: any) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageSelect(lang.code as LanguageCode)}
                      disabled={!isMultiLanguageEnabled() && lang.code !== 'en'}
                      className={`rounded-lg border-2 p-3 text-left transition-all ${
                        selectedLang === lang.code
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${!isMultiLanguageEnabled() && lang.code !== 'en' ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-2xl">{lang.flag}</span>
                        {selectedLang === lang.code && <Check className="h-4 w-4 text-blue-600" />}
                      </div>
                      <p className="text-xs font-medium text-gray-900">{lang.nativeName}</p>
                      <p className="text-xs text-gray-500">{lang.name}</p>
                      {'rtl' in lang && lang.rtl && (
                        <span className="mt-1 inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
                          RTL
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Settings Options */}
              <div className="space-y-4 border-t pt-4">
                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={autoDetect}
                      onChange={(e: any) => setAutoDetect(e.target.checked)}
                      className="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Auto-detect language</p>
                      <p className="text-xs text-gray-500">
                        Automatically set language based on browser settings
                      </p>
                    </div>
                  </div>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={translateMedical}
                      onChange={(e: any) => setTranslateMedical(e.target.checked)}
                      className="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Translate medical terms</p>
                      <p className="text-xs text-gray-500">
                        Show medical terminology in selected language
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Regional Formats */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => setShowRegionalFormats(!showRegionalFormats)}
              className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50"
            >
              <h2 className="text-lg font-semibold">Regional Formats</h2>
              <ChevronRight
                className={`h-5 w-5 text-gray-400 transition-transform ${showRegionalFormats ? 'rotate-90' : ''}`}
              />
            </button>

            {showRegionalFormats && (
              <div className="border-t px-6 pb-6">
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Date Format */}
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-gray-700">Date Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <div className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4 text-gray-500" />
                          <span className="text-sm">Format:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.dateFormat || 'MM/DD/YYYY'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">{formatDate(sampleDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Time Format */}
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-gray-700">Time Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <div className="flex items-center">
                          <Clock className="mr-2 h-4 w-4 text-gray-500" />
                          <span className="text-sm">Format:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.timeFormat || '12h'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">{formatTime(sampleDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Currency Format */}
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-gray-700">Currency Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <div className="flex items-center">
                          <DollarSign className="mr-2 h-4 w-4 text-gray-500" />
                          <span className="text-sm">Currency:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.currency || 'USD'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">
                          {formatCurrency(sampleCurrency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Number Format */}
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-gray-700">Number Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <div className="flex items-center">
                          <Hash className="mr-2 h-4 w-4 text-gray-500" />
                          <span className="text-sm">Locale:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.numberFormat || 'en-US'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">{formatNumber(sampleNumber)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* First Day of Week */}
                <div className="mt-4">
                  <div className="flex items-center justify-between rounded bg-gray-50 p-3">
                    <span className="text-sm">First day of week:</span>
                    <span className="text-sm font-medium">
                      {LOCALE_FORMATS[language]?.firstDayOfWeek === 0
                        ? 'Sunday'
                        : LOCALE_FORMATS[language]?.firstDayOfWeek === 1
                          ? 'Monday'
                          : LOCALE_FORMATS[language]?.firstDayOfWeek === 6
                            ? 'Saturday'
                            : 'Sunday'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Translation Management */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Translation Management</h2>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <button className="flex w-full items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100">
                  <div className="flex items-center">
                    <Download className="mr-3 h-5 w-5 text-gray-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Export Translations</p>
                      <p className="text-xs text-gray-500">
                        Download translation files for editing
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>

                <button className="flex w-full items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100">
                  <div className="flex items-center">
                    <Upload className="mr-3 h-5 w-5 text-gray-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Import Translations</p>
                      <p className="text-xs text-gray-500">Upload custom translation files</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>

                <button className="flex w-full items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100">
                  <div className="flex items-center">
                    <Languages className="mr-3 h-5 w-5 text-gray-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Translation Coverage</p>
                      <p className="text-xs text-gray-500">View translation completion status</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              {/* Translation Stats */}
              <div className="mt-6 rounded-lg bg-blue-50 p-4">
                <div className="flex items-start">
                  <Info className="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-medium text-blue-900">Translation Quality</h3>
                    <p className="mt-1 text-sm text-blue-800">
                      Medical terminology has been professionally reviewed for accuracy.
                      Patient-facing content is available in {SUPPORTED_LANGUAGES.length} languages.
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-blue-700">UI Translations</p>
                        <p className="text-sm font-medium text-blue-900">100%</p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-700">Medical Terms</p>
                        <p className="text-sm font-medium text-blue-900">95%</p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-700">Email Templates</p>
                        <p className="text-sm font-medium text-blue-900">90%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Developer Tools */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Developer Tools</h2>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <a
                  href="/test/languages"
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <div className="flex items-center">
                    <Settings className="mr-3 h-5 w-5 text-gray-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Test Suite</p>
                      <p className="text-xs text-gray-500">Run language tests</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>

                <a
                  href="/admin/features"
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <div className="flex items-center">
                    <Settings className="mr-3 h-5 w-5 text-gray-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Feature Flags</p>
                      <p className="text-xs text-gray-500">Enable/disable features</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Feature>
  );
}
