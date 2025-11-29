"use client";

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
  const { t, language, changeLanguage, formatDate, formatTime, formatCurrency, formatNumber } = useTranslation();
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
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Globe className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Language Settings</h1>
              </div>
              <LanguageSwitcher variant="dropdown" />
            </div>
            <p className="text-gray-600 mt-2">
              Configure language preferences and regional settings
            </p>
          </div>

          {/* Feature Status Alert */}
          {!isMultiLanguageEnabled() && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Feature Disabled</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  Multi-language support is currently disabled. Enable it in your environment variables by setting MULTI_LANGUAGE=true.
                </p>
              </div>
            </div>
          )}

          {/* Main Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Language Preference</h2>
            </div>
            
            <div className="p-6">
              {/* Current Language */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Language
                </label>
                <div className="flex items-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-3xl mr-3">{getLanguageDetails(language)?.flag}</span>
                  <div>
                    <p className="font-medium text-gray-900">
                      {getLanguageDetails(language)?.nativeName}
                    </p>
                    <p className="text-sm text-gray-600">
                      {getLanguageDetails(language)?.name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Language Grid */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Available Languages
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {SUPPORTED_LANGUAGES.map((lang: any) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageSelect(lang.code as LanguageCode)}
                      disabled={!isMultiLanguageEnabled() && lang.code !== 'en'}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        selectedLang === lang.code
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${!isMultiLanguageEnabled() && lang.code !== 'en' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-2xl">{lang.flag}</span>
                        {selectedLang === lang.code && (
                          <Check className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <p className="text-xs font-medium text-gray-900">
                        {lang.nativeName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {lang.name}
                      </p>
                      {'rtl' in lang && lang.rtl && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                          RTL
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Settings Options */}
              <div className="space-y-4 pt-4 border-t">
                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={autoDetect}
                      onChange={(e: any) => setAutoDetect(e.target.checked)}
                      className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Auto-detect language</p>
                      <p className="text-xs text-gray-500">Automatically set language based on browser settings</p>
                    </div>
                  </div>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={translateMedical}
                      onChange={(e: any) => setTranslateMedical(e.target.checked)}
                      className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Translate medical terms</p>
                      <p className="text-xs text-gray-500">Show medical terminology in selected language</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Regional Formats */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <button
              onClick={() => setShowRegionalFormats(!showRegionalFormats)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-lg font-semibold">Regional Formats</h2>
              <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showRegionalFormats ? 'rotate-90' : ''}`} />
            </button>
            
            {showRegionalFormats && (
              <div className="px-6 pb-6 border-t">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  {/* Date Format */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Date Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 text-gray-500 mr-2" />
                          <span className="text-sm">Format:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.dateFormat || 'MM/DD/YYYY'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">{formatDate(sampleDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Time Format */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Time Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 text-gray-500 mr-2" />
                          <span className="text-sm">Format:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.timeFormat || '12h'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">{formatTime(sampleDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Currency Format */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Currency Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex items-center">
                          <DollarSign className="w-4 h-4 text-gray-500 mr-2" />
                          <span className="text-sm">Currency:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.currency || 'USD'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">{formatCurrency(sampleCurrency)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Number Format */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Number Format</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex items-center">
                          <Hash className="w-4 h-4 text-gray-500 mr-2" />
                          <span className="text-sm">Locale:</span>
                        </div>
                        <span className="text-sm font-medium">
                          {LOCALE_FORMATS[language]?.numberFormat || 'en-US'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <span className="text-sm">Example:</span>
                        <span className="text-sm font-medium">{formatNumber(sampleNumber)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* First Day of Week */}
                <div className="mt-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="text-sm">First day of week:</span>
                    <span className="text-sm font-medium">
                      {LOCALE_FORMATS[language]?.firstDayOfWeek === 0 ? 'Sunday' :
                       LOCALE_FORMATS[language]?.firstDayOfWeek === 1 ? 'Monday' :
                       LOCALE_FORMATS[language]?.firstDayOfWeek === 6 ? 'Saturday' : 'Sunday'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Translation Management */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Translation Management</h2>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center">
                    <Download className="w-5 h-5 text-gray-600 mr-3" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Export Translations</p>
                      <p className="text-xs text-gray-500">Download translation files for editing</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>

                <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center">
                    <Upload className="w-5 h-5 text-gray-600 mr-3" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Import Translations</p>
                      <p className="text-xs text-gray-500">Upload custom translation files</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>

                <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center">
                    <Languages className="w-5 h-5 text-gray-600 mr-3" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Translation Coverage</p>
                      <p className="text-xs text-gray-500">View translation completion status</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Translation Stats */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-start">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium text-blue-900">Translation Quality</h3>
                    <p className="text-sm text-blue-800 mt-1">
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Developer Tools</h2>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a
                  href="/test/languages"
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center">
                    <Settings className="w-5 h-5 text-gray-600 mr-3" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Test Suite</p>
                      <p className="text-xs text-gray-500">Run language tests</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </a>

                <a
                  href="/admin/features"
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center">
                    <Settings className="w-5 h-5 text-gray-600 mr-3" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">Feature Flags</p>
                      <p className="text-xs text-gray-500">Enable/disable features</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Feature>
  );
}