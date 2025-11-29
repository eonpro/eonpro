/**
 * Translation API Endpoint
 * 
 * Serves translation files for different languages
 */

import { NextRequest, NextResponse } from 'next/server';
import { isMultiLanguageEnabled, DEFAULT_LANGUAGE } from '@/lib/i18n/config';
import { logger } from '@/lib/logger';
import { AppError, ApiResponse } from '@/types/common';

// Cache for translations
const translationCache: Record<string, unknown> = {};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('lang') || DEFAULT_LANGUAGE;
    const namespace = searchParams.get('ns') || 'common';

    // Check if multi-language is enabled
    if (!isMultiLanguageEnabled() && language !== DEFAULT_LANGUAGE) {
      return NextResponse.json(
        { error: 'Multi-language feature is not enabled' },
        { status: 403 }
      );
    }

    const cacheKey = `${language}/${namespace}`;

    // Return from cache if available
    if (translationCache[cacheKey]) {
      return NextResponse.json(translationCache[cacheKey]);
    }

  // Try to load translation file
  try {
    // For development, use require to load the JSON files
    const translations = require(`@/lib/i18n/translations/${language}/${namespace}.json`);

    // Cache the result
    translationCache[cacheKey] = translations;

    return NextResponse.json(translations);
  } catch (error: any) {
    // @ts-ignore
   
    // If file doesn't exist, try fallback to English
    if (language !== DEFAULT_LANGUAGE) {
      try {
        const fallbackTranslations = require(`@/lib/i18n/translations/${DEFAULT_LANGUAGE}/${namespace}.json`);
        
        return NextResponse.json(fallbackTranslations);
      } catch (fallbackError: any) {
        // Even fallback failed, return empty object
        return NextResponse.json({});
      }
      }

      // Return empty translations if file not found
      return NextResponse.json({});
    }
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Translation API] Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to load translations' },
      { status: 500 }
    );
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
          en: await loadTranslation('en', namespace),
        },
      });
    }

    // Load translations for all supported languages
    const languages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'he', 'ru', 'hi', 'bn', 'tr'];
    const translations: Record<string, unknown> = {};

    for (const lang of languages) {
      translations[lang] = await loadTranslation(lang, namespace);
    }

    return NextResponse.json({
      languages,
      translations,
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Translation API] Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to load translations' },
      { status: 500 }
    );
  }
}

// Helper function to load translation
async function loadTranslation(language: string, namespace: string): Promise<any> {
  try {
    return require(`@/lib/i18n/translations/${language}/${namespace}.json`);
  } catch (error: any) {
    // @ts-ignore
   
    // Return empty object if file doesn't exist
    return {};
  }
}