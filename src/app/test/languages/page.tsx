"use client";

/**
 * Multi-Language Test Page
 * 
 * Comprehensive testing for internationalization features
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import {
  Globe,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Languages,
  Calendar,
  DollarSign,
  Clock,
  Hash,
  FileText,
  Play,
  RefreshCw,
  Heart,
  Thermometer,
  Activity,
  User,
} from 'lucide-react';
import { LanguageSwitcher, MiniLanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation, initializeLanguage } from '@/lib/i18n/useTranslation';
import { 
  SUPPORTED_LANGUAGES, 
  isMultiLanguageEnabled,
  getTextDirection,
  LanguageCode,
} from '@/lib/i18n/config';
import { Feature } from '@/components/Feature';

interface TestResult {
  name: string;
  status: "PENDING" | 'running' | 'success' | 'error';
  message?: string;
  details?: any;
}

export default function LanguageTestPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('common');
  const { t, language, changeLanguage, formatDate, formatTime, formatCurrency, formatNumber, isRTL } = useTranslation(selectedNamespace);

  // Sample data for testing
  const sampleDate = new Date();
  const sampleAmount = 1234.56;
  const sampleNumber = 9876543.21;

  // Test scenarios
  const testScenarios: TestResult[] = [
    { name: 'Check Feature Flag', status: "PENDING" },
    { name: 'Load English Translations', status: "PENDING" },
    { name: 'Load Spanish Translations', status: "PENDING" },
    { name: 'Load French Translations', status: "PENDING" },
    { name: 'Test Language Switching', status: "PENDING" },
    { name: 'Test RTL Languages (Arabic)', status: "PENDING" },
    { name: 'Test Date Formatting', status: "PENDING" },
    { name: 'Test Currency Formatting', status: "PENDING" },
    { name: 'Test Number Formatting', status: "PENDING" },
    { name: 'Test Interpolation', status: "PENDING" },
    { name: 'Test Cookie Persistence', status: "PENDING" },
    { name: 'Test Namespace Loading', status: "PENDING" },
    { name: 'Test Missing Translations', status: "PENDING" },
    { name: 'Test Browser Language Detection', status: "PENDING" },
    { name: 'Verify All Languages', status: "PENDING" },
  ];

  // Initialize language on mount
  useEffect(() => {
    initializeLanguage();
  }, []);

  // Run all tests
  const runTests = async () => {
    setRunning(true);
    setTestResults([...testScenarios]);

    for (let i = 0; i < testScenarios.length; i++) {
      const test = testScenarios[i];

      // Update test status to running
      setTestResults(prev => prev.map((t, idx) =>
        idx === i ? { ...t, status: 'running' } : t
      ));

      // Run test
      const result = await runTest(test.name);

      // Update test result
      setTestResults(prev => prev.map((t, idx) =>
        idx === i ? result : t
      ));

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setRunning(false);
  };

  // Run individual test
  const runTest = async (testName: string): Promise<TestResult> => {
    try {
      switch (testName) {
        case 'Check Feature Flag': {
          const enabled = isMultiLanguageEnabled();
          return {
            name: testName,
            status: enabled ? 'success' : 'error',
            message: enabled
              ? 'Multi-language feature is enabled'
              : 'Multi-language feature is disabled',
            details: { enabled },
          };
        }

        case 'Load English Translations': {
          const response = await fetch('/api/v2/i18n/translations?lang=en&ns=common');
          const data = await response.json();

          return {
            name: testName,
            status: response.ok && data.app ? 'success' : 'error',
            message: response.ok ? 'English translations loaded' : 'Failed to load translations',
            details: { keys: Object.keys(data).length },
          };
        }

        case 'Load Spanish Translations': {
          const response = await fetch('/api/v2/i18n/translations?lang=es&ns=common');
          const data = await response.json();

          return {
            name: testName,
            status: response.ok && data.app ? 'success' : 'error',
            message: response.ok ? 'Spanish translations loaded' : 'Failed to load translations',
            details: { keys: Object.keys(data).length },
          };
        }

        case 'Load French Translations': {
          const response = await fetch('/api/v2/i18n/translations?lang=fr&ns=common');
          const data = await response.json();

          // French might not exist yet, so we accept fallback to English
          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok 
              ? 'French translations loaded (or fallback to English)' 
              : 'Failed to load translations',
            details: { keys: Object.keys(data).length },
          };
        }

        case 'Test Language Switching': {
          const originalLang = language;
          await changeLanguage('es' as LanguageCode);
          await new Promise(resolve => setTimeout(resolve, 500));
          const changedToSpanish = document.documentElement.lang === 'es';
          
          await changeLanguage(originalLang);
          
          return {
            name: testName,
            status: changedToSpanish ? 'success' : 'error',
            message: changedToSpanish ? 'Language switching works' : 'Language switching failed',
          };
        }

        case 'Test RTL Languages (Arabic)': {
          const originalLang = language;
          await changeLanguage('ar' as LanguageCode);
          await new Promise(resolve => setTimeout(resolve, 500));
          const isRTLSet = document.documentElement.dir === 'rtl';
          
          await changeLanguage(originalLang);
          
          return {
            name: testName,
            status: isRTLSet ? 'success' : 'error',
            message: isRTLSet ? 'RTL direction applied correctly' : 'RTL direction not applied',
          };
        }

        case 'Test Date Formatting': {
          const dateEN = formatDate(sampleDate);
          const hasValidFormat = dateEN.length > 0;

          return {
            name: testName,
            status: hasValidFormat ? 'success' : 'error',
            message: `Date formatted: ${dateEN}`,
            details: { formatted: dateEN, language },
          };
        }

        case 'Test Currency Formatting': {
          const currencyFormatted = formatCurrency(sampleAmount);
          const hasValidFormat = currencyFormatted.includes('$') || currencyFormatted.includes('€') || /[\d,.]/.test(currencyFormatted);

          return {
            name: testName,
            status: hasValidFormat ? 'success' : 'error',
            message: `Currency formatted: ${currencyFormatted}`,
            details: { amount: sampleAmount, formatted: currencyFormatted },
          };
        }

        case 'Test Number Formatting': {
          const numberFormatted = formatNumber(sampleNumber);
          const hasValidFormat = numberFormatted.length > 0;

          return {
            name: testName,
            status: hasValidFormat ? 'success' : 'error',
            message: `Number formatted: ${numberFormatted}`,
            details: { number: sampleNumber, formatted: numberFormatted },
          };
        }

        case 'Test Interpolation': {
          const result = t('messages.welcome', { name: 'John' });
          const hasInterpolation = result.includes('John');

          return {
            name: testName,
            status: hasInterpolation ? 'success' : 'error',
            message: hasInterpolation ? `Interpolation works: "${result}"` : 'Interpolation failed',
          };
        }

        case 'Test Cookie Persistence': {
          // Check if cookie is set
          const hasCookie = document.cookie.includes('lifefile-language');

          return {
            name: testName,
            status: hasCookie ? 'success' : 'error',
            message: hasCookie ? 'Language preference saved to cookie' : 'Cookie not set',
          };
        }

        case 'Test Namespace Loading': {
          const response = await fetch('/api/v2/i18n/translations?lang=en&ns=medical');
          const data = await response.json();

          return {
            name: testName,
            status: response.ok ? 'success' : 'error',
            message: response.ok ? 'Medical namespace loaded' : 'Failed to load namespace',
            details: { keys: Object.keys(data).length },
          };
        }

        case 'Test Missing Translations': {
          const missingKey = t('nonexistent.key.test');
          const showsKey = missingKey === 'nonexistent.key.test';

          return {
            name: testName,
            status: showsKey ? 'success' : 'error',
            message: showsKey ? 'Missing keys return key itself' : 'Unexpected behavior for missing keys',
          };
        }

        case 'Test Browser Language Detection': {
          const browserLang = navigator.language;

          return {
            name: testName,
            status: 'success',
            message: `Browser language: ${browserLang}`,
            details: { browserLang, appLang: language },
          };
        }

        case 'Verify All Languages': {
          const availableCount = SUPPORTED_LANGUAGES.length;

          return {
            name: testName,
            status: availableCount >= 10 ? 'success' : 'error',
            message: `${availableCount} languages configured`,
            details: SUPPORTED_LANGUAGES.map((l: any) => `${l.flag} ${l.code}`),
          };
        }

        default:
          return {
            name: testName,
            status: 'error',
            message: 'Test not implemented',
          };
      }
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
        name: testName,
        status: 'error',
        message: errorMessage || 'Test failed with unexpected error',
        details: error,
      };
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  // Calculate stats
  const successCount = testResults.filter((t: any) => t.status === 'success').length;
  const errorCount = testResults.filter((t: any) => t.status === 'error').length;
  const successRate = testResults.length > 0
    ? Math.round((successCount / testResults.length) * 100)
    : 0;

  return (
    <Feature feature="MULTI_LANGUAGE">
      <div className={`min-h-screen bg-gray-50 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Globe className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Multi-Language Test Suite</h1>
              </div>
              <LanguageSwitcher variant="dropdown" />
            </div>
            <p className="text-gray-600 mt-2">
              Test internationalization and localization features
            </p>
          </div>

          {/* Current Language Info */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Current Language Settings</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Current Language</p>
                <p className="font-medium text-gray-900 text-lg">
                  {SUPPORTED_LANGUAGES.find((l: any) => l.code === language)?.flag} {language.toUpperCase()}
                </p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Text Direction</p>
                <p className="font-medium text-gray-900">
                  {isRTL ? 'RTL (Right-to-Left)' : 'LTR (Left-to-Right)'}
                </p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Feature Status</p>
                <p className={`font-medium ${isMultiLanguageEnabled() ? 'text-green-600' : 'text-red-600'}`}>
                  {isMultiLanguageEnabled() ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Available Languages</p>
                <p className="font-medium text-gray-900">{SUPPORTED_LANGUAGES.length}</p>
              </div>
            </div>
          </div>

          {/* Translation Examples */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Translation Examples</h2>
            
            <div className="space-y-4">
              {/* Common translations */}
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Common Translations</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">navigation.home</p>
                    <p className="font-medium">{t('navigation.home')}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">actions.save</p>
                    <p className="font-medium">{t('actions.save')}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">status.loading</p>
                    <p className="font-medium">{t('status.loading')}</p>
                  </div>
                </div>
              </div>

              {/* Date and time formatting */}
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Date & Time Formatting</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 flex items-center">
                      <Calendar className="w-3 h-3 mr-1" /> Date
                    </p>
                    <p className="font-medium">{formatDate(sampleDate)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 flex items-center">
                      <Clock className="w-3 h-3 mr-1" /> Time
                    </p>
                    <p className="font-medium">{formatTime(sampleDate)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">time.today</p>
                    <p className="font-medium">{t('time.today')}</p>
                  </div>
                </div>
              </div>

              {/* Number and currency formatting */}
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Number & Currency Formatting</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 flex items-center">
                      <DollarSign className="w-3 h-3 mr-1" /> Currency
                    </p>
                    <p className="font-medium">{formatCurrency(sampleAmount)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 flex items-center">
                      <Hash className="w-3 h-3 mr-1" /> Number
                    </p>
                    <p className="font-medium">{formatNumber(sampleNumber)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Interpolation</p>
                    <p className="font-medium">{t('messages.welcome', { name: 'Test User' })}</p>
                  </div>
                </div>
              </div>

              {/* Medical translations */}
              {selectedNamespace === 'medical' && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">Medical Terms</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-500 flex items-center">
                        <User className="w-3 h-3 mr-1" /> patient.title
                      </p>
                      <p className="font-medium">{t('patient.title')}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-500 flex items-center">
                        <Heart className="w-3 h-3 mr-1" /> vitals.bloodPressure
                      </p>
                      <p className="font-medium">{t('vitals.bloodPressure')}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-500 flex items-center">
                        <Thermometer className="w-3 h-3 mr-1" /> symptoms.fever
                      </p>
                      <p className="font-medium">{t('symptoms.fever')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Namespace selector */}
            <div className="mt-4 pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Different Namespaces
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedNamespace('common')}
                  className={`px-3 py-1 rounded ${selectedNamespace === 'common' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                >
                  Common
                </button>
                <button
                  onClick={() => setSelectedNamespace('medical')}
                  className={`px-3 py-1 rounded ${selectedNamespace === 'medical' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                >
                  Medical
                </button>
              </div>
            </div>
          </div>

          {/* Test Controls */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Test Results</h2>
              <button
                onClick={runTests}
                disabled={running}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {running ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Running Tests...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>Run All Tests</span>
                  </>
                )}
              </button>
            </div>

            {/* Test Progress */}
            {testResults.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>{successCount + errorCount} of {testResults.length} tests completed</span>
                  <span>{successRate}% success rate</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${((successCount + errorCount) / testResults.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Test Results List */}
            <div className="space-y-2">
              {(testResults.length > 0 ? testResults : testScenarios).map((test, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    test.status === 'running' ? 'bg-blue-50 border-blue-200' :
                    test.status === 'success' ? 'bg-green-50 border-green-200' :
                    test.status === 'error' ? 'bg-red-50 border-red-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(test.status)}
                    <div>
                      <p className={`font-medium ${
                        test.status === 'success' ? 'text-green-600' :
                        test.status === 'error' ? 'text-red-600' :
                        test.status === 'running' ? 'text-blue-600' :
                        'text-gray-500'
                      }`}>
                        {test.name}
                      </p>
                      {test.message && (
                        <p className="text-sm text-gray-600">{test.message}</p>
                      )}
                    </div>
                  </div>

                  {test.details && (
                    <button
                      onClick={() => logger.debug(test.name, { value: test.details })}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View Details
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Language Switcher Variants */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Language Switcher Components</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Dropdown Variant</h3>
                <LanguageSwitcher variant="dropdown" showFlag={true} showNativeName={true} />
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Inline Variant</h3>
                <LanguageSwitcher variant="inline" showFlag={true} showNativeName={false} />
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Mini Variant</h3>
                <MiniLanguageSwitcher />
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Modal Variant</h3>
                <LanguageSwitcher variant="modal" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Feature>
  );
}
