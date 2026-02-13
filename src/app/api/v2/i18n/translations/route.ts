/**
 * Translation API Endpoint
 *
 * Serves translation files for different languages.
 * Uses static imports so Webpack can trace the files into the serverless bundle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isMultiLanguageEnabled, DEFAULT_LANGUAGE } from '@/lib/i18n/config';
import { logger } from '@/lib/logger';

// --------------------------------------------------------------------------
// Static translation imports (Webpack-safe — no dynamic require)
// --------------------------------------------------------------------------
import enCommon from '@/lib/i18n/translations/en/common.json';
import enMedical from '@/lib/i18n/translations/en/medical.json';
import esCommon from '@/lib/i18n/translations/es/common.json';

type TranslationMap = Record<string, Record<string, unknown>>;

/**
 * Static registry of all translation bundles.
 * When adding a new language/namespace, import above and register here.
 */
const TRANSLATIONS: TranslationMap = {
  'en/common': enCommon,
  'en/medical': enMedical,
  'es/common': esCommon,
};

// In-memory cache (safe: translations are immutable at deploy time)
const translationCache: Record<string, unknown> = {};

function lookupTranslation(language: string, namespace: string): unknown {
  const cacheKey = `${language}/${namespace}`;

  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  const translation = TRANSLATIONS[cacheKey];
  if (translation) {
    translationCache[cacheKey] = translation;
    return translation;
  }

  // Fallback to default language
  if (language !== DEFAULT_LANGUAGE) {
    const fallbackKey = `${DEFAULT_LANGUAGE}/${namespace}`;
    const fallback = TRANSLATIONS[fallbackKey];
    if (fallback) {
      translationCache[cacheKey] = fallback; // Cache the fallback too
      return fallback;
    }
  }

  return {};
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('lang') || DEFAULT_LANGUAGE;
    const namespace = searchParams.get('ns') || 'common';

    // Check if multi-language is enabled
    if (!isMultiLanguageEnabled() && language !== DEFAULT_LANGUAGE) {
      return NextResponse.json({ error: 'Multi-language feature is not enabled' }, { status: 403 });
    }

    const translations = lookupTranslation(language, namespace);
    return NextResponse.json(translations);
  } catch (error) {
    logger.error('[Translation API] Error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load translations' }, { status: 500 });
  }
}

// Get all available languages
export async function POST(request: NextRequest) {
  try {
    const { namespace = 'common' } = await request.json();

    if (!isMultiLanguageEnabled()) {
      return NextResponse.json({
        languages: ['en'],
        translations: {
          en: lookupTranslation('en', namespace),
        },
      });
    }

    // Load translations for all supported languages
    const languages = [
      'en',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'zh',
      'ja',
      'ko',
      'ar',
      'he',
      'ru',
      'hi',
      'bn',
      'tr',
    ];
    const translations: Record<string, unknown> = {};

    for (const lang of languages) {
      translations[lang] = lookupTranslation(lang, namespace);
    }

    return NextResponse.json({
      languages,
      translations,
    });
  } catch (error) {
    logger.error('[Translation API] Error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load translations' }, { status: 500 });
  }
}
