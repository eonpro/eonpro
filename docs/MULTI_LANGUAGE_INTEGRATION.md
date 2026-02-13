# Multi-Language Integration Guide

## Overview

The Lifefile platform now supports **15+ languages** with automatic translation, regional
formatting, and RTL language support. This enables healthcare providers to serve patients globally
in their preferred language.

## ✅ What's Been Implemented

### Core Infrastructure

#### **Language Configuration** (`src/lib/i18n/config.ts`)

- Support for 15 languages:
  - English 🇺🇸, Spanish 🇪🇸, French 🇫🇷, German 🇩🇪, Italian 🇮🇹
  - Portuguese 🇵🇹, Chinese 🇨🇳, Japanese 🇯🇵, Korean 🇰🇷
  - Arabic 🇸🇦, Hebrew 🇮🇱, Russian 🇷🇺, Hindi 🇮🇳, Bengali 🇧🇩, Turkish 🇹🇷
- RTL (Right-to-Left) support for Arabic and Hebrew
- Regional formatting for dates, times, currency, and numbers
- Feature flag support (`MULTI_LANGUAGE`)

#### **Translation System** (`src/lib/i18n/useTranslation.ts`)

- React hook for component translations
- Dynamic translation loading
- Interpolation support for variables
- Plural forms handling
- Namespace-based organization
- Cookie-based language persistence
- Browser language detection

### Translation Files

#### **Common Translations** (`src/lib/i18n/translations/`)

- Navigation labels
- Action buttons
- Status messages
- Error messages
- Time-related terms
- Units of measurement
- Footer content

#### **Medical Translations** (`src/lib/i18n/translations/[lang]/medical.json`)

- Patient information fields
- Provider details
- Appointment types
- Prescription terminology
- Vital signs
- Medical conditions
- Symptoms
- Test types
- Insurance terms
- Emergency information

### User Interface Components

#### **Language Switcher** (`src/components/LanguageSwitcher.tsx`)

- **Dropdown variant** - Compact header/nav integration
- **Inline variant** - Button group for settings
- **Modal variant** - Full-screen language selection
- **Mini variant** - Select dropdown for footers
- Auto-detects browser language
- Shows native language names with flags
- RTL language indicators

#### **Language Settings Page** (`/settings/languages`)

- Visual language selection grid
- Regional format preview
- Auto-detection toggle
- Medical term translation toggle
- Date/time format examples
- Currency/number format examples
- Translation management tools

#### **Test Suite** (`/test/languages`)

- 15 comprehensive test scenarios
- Translation loading tests
- Language switching tests
- RTL direction tests
- Format localization tests
- Cookie persistence tests
- Browser detection tests
- Namespace loading tests

### API Endpoints

- `/api/v2/i18n/translations` - Serves translation files
  - Query params: `lang`, `ns` (namespace)
  - Fallback to English if translation missing
  - Caching for performance

## 🌍 Supported Languages

| Language   | Code | Native Name | Flag | RTL | Status      |
| ---------- | ---- | ----------- | ---- | --- | ----------- |
| English    | en   | English     | 🇺🇸   | No  | ✅ Complete |
| Spanish    | es   | Español     | 🇪🇸   | No  | ✅ Complete |
| French     | fr   | Français    | 🇫🇷   | No  | 🔄 Fallback |
| German     | de   | Deutsch     | 🇩🇪   | No  | 🔄 Fallback |
| Italian    | it   | Italiano    | 🇮🇹   | No  | 🔄 Fallback |
| Portuguese | pt   | Português   | 🇵🇹   | No  | 🔄 Fallback |
| Chinese    | zh   | 中文        | 🇨🇳   | No  | 🔄 Fallback |
| Japanese   | ja   | 日本語      | 🇯🇵   | No  | 🔄 Fallback |
| Korean     | ko   | 한국어      | 🇰🇷   | No  | 🔄 Fallback |
| Arabic     | ar   | العربية     | 🇸🇦   | Yes | 🔄 Fallback |
| Hebrew     | he   | עברית       | 🇮🇱   | Yes | 🔄 Fallback |
| Russian    | ru   | Русский     | 🇷🇺   | No  | 🔄 Fallback |
| Hindi      | hi   | हिन्दी      | 🇮🇳   | No  | 🔄 Fallback |
| Bengali    | bn   | বাংলা       | 🇧🇩   | No  | 🔄 Fallback |
| Turkish    | tr   | Türkçe      | 🇹🇷   | No  | 🔄 Fallback |

## 🔧 Configuration

### Environment Variables

Add to your `.env.local`:

```env
# Enable Multi-Language Feature
MULTI_LANGUAGE=true
```

That's it! The feature is now enabled.

## 📝 Using Translations

### In React Components

```tsx
import { useTranslation } from '@/lib/i18n/useTranslation';

export function MyComponent() {
  const { t, language, changeLanguage, formatDate, formatCurrency } = useTranslation();

  return (
    <div>
      {/* Simple translation */}
      <h1>{t('navigation.home')}</h1>

      {/* Translation with interpolation */}
      <p>{t('messages.welcome', { name: 'John' })}</p>

      {/* Formatted date */}
      <p>{formatDate(new Date())}</p>

      {/* Formatted currency */}
      <p>{formatCurrency(99.99)}</p>

      {/* Change language */}
      <button onClick={() => changeLanguage('es')}>Español</button>
    </div>
  );
}
```

### Adding Language Switcher

```tsx
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Dropdown (for headers)
<LanguageSwitcher variant="dropdown" />

// Inline buttons (for settings)
<LanguageSwitcher variant="inline" />

// Modal (for prominent selection)
<LanguageSwitcher variant="modal" />

// Mini select (for footers)
<MiniLanguageSwitcher />
```

### Using Different Namespaces

```tsx
// Load medical translations
const { t } = useTranslation('medical');

// Use medical terms
<p>{t('patient.firstName')}</p>
<p>{t('vitals.bloodPressure')}</p>
<p>{t('symptoms.fever')}</p>
```

## 🌐 Regional Formatting

### Date Formats

| Language | Format     | Example    |
| -------- | ---------- | ---------- |
| English  | MM/DD/YYYY | 12/25/2024 |
| Spanish  | DD/MM/YYYY | 25/12/2024 |
| Chinese  | YYYY-MM-DD | 2024-12-25 |
| German   | DD.MM.YYYY | 25.12.2024 |

### Time Formats

| Language | Format  | Example |
| -------- | ------- | ------- |
| English  | 12-hour | 2:30 PM |
| Spanish  | 24-hour | 14:30   |
| Japanese | 24-hour | 14:30   |

### Currency Formats

| Language | Currency | Example    |
| -------- | -------- | ---------- |
| English  | USD      | $1,234.56  |
| Spanish  | EUR      | 1.234,56 € |
| Chinese  | CNY      | ¥1,234.56  |
| Japanese | JPY      | ¥1,235     |

## 📚 Adding Translations

### 1. Create Translation File

Create a new JSON file: `src/lib/i18n/translations/[lang]/[namespace].json`

```json
{
  "greeting": "Hello",
  "farewell": "Goodbye",
  "patient": {
    "name": "Patient Name",
    "age": "Age"
  }
}
```

### 2. Use in Components

```tsx
const { t } = useTranslation('namespace');
<p>{t('greeting')}</p>
<p>{t('patient.name')}</p>
```

### 3. Add Interpolation

```json
{
  "welcome": "Welcome {{name}}!",
  "count": "You have {{count}} messages"
}
```

```tsx
t('welcome', { name: 'John' });
// Output: "Welcome John!"

t('count', { count: 5 });
// Output: "You have 5 messages"
```

## 🔍 Testing

### Run Test Suite

Navigate to `/test/languages` to run comprehensive tests:

1. **Feature Flag Check** - Verifies multi-language is enabled
2. **Translation Loading** - Tests all language files load
3. **Language Switching** - Confirms language changes work
4. **RTL Support** - Validates Arabic/Hebrew text direction
5. **Format Localization** - Tests date/currency/number formats
6. **Cookie Persistence** - Ensures preferences are saved
7. **Browser Detection** - Auto-detects user language
8. **Namespace Loading** - Tests medical/other namespaces

### Testing Different Languages

```tsx
// Test a specific language
await changeLanguage('es');
expect(t('navigation.home')).toBe('Inicio');

// Test RTL
await changeLanguage('ar');
expect(document.dir).toBe('rtl');

// Test formatting
await changeLanguage('de');
expect(formatDate(new Date('2024-12-25'))).toBe('25.12.2024');
```

## 🏥 Medical Translation Guidelines

### Professional Review Required

Medical translations require professional review to ensure:

- Accuracy of medical terminology
- Compliance with local regulations
- Cultural appropriateness
- Patient safety

### Key Medical Terms

Essential terms that must be accurately translated:

- Medication names (generic & brand)
- Dosage instructions
- Allergies & contraindications
- Emergency procedures
- Consent forms
- Legal disclaimers

### Translation Workflow

1. **Extract terms** - Export medical namespace
2. **Professional translation** - Use certified medical translators
3. **Medical review** - Have healthcare professionals verify
4. **Legal review** - Ensure regulatory compliance
5. **Import translations** - Update translation files
6. **Test thoroughly** - Verify in application context

## 🚀 Best Practices

### 1. Always Use Translation Keys

```tsx
// ❌ Bad
<button>Save</button>

// ✅ Good
<button>{t('actions.save')}</button>
```

### 2. Organize by Namespace

```
translations/
├── en/
│   ├── common.json      // Shared UI elements
│   ├── medical.json     // Medical terms
│   ├── billing.json     // Payment/insurance
│   └── emails.json      // Email templates
```

### 3. Handle Missing Translations

```tsx
// Provide fallback
t('key.that.might.not.exist', {}, 'Default Text');
```

### 4. Format Consistently

```tsx
// Use formatting helpers
formatDate(date); // Not date.toLocaleDateString()
formatCurrency(amount); // Not `$${amount}`
formatNumber(num); // Not num.toLocaleString()
```

### 5. Test All Languages

- Preview each language in development
- Check RTL layouts for Arabic/Hebrew
- Verify formatted values
- Test with long translations (German)
- Test with short translations (Chinese)

## 🔧 Troubleshooting

### Language Not Changing

1. Check feature flag is enabled: `MULTI_LANGUAGE=true`
2. Clear browser cookies
3. Check console for errors
4. Verify translation file exists

### Translations Not Loading

1. Check file path: `translations/[lang]/[namespace].json`
2. Verify JSON syntax is valid
3. Check network tab for 404s
4. Ensure namespace is correct

### RTL Layout Issues

1. Check `document.dir` is set to 'rtl'
2. Use logical CSS properties (`margin-inline-start` vs `margin-left`)
3. Mirror icons/images as needed
4. Test form inputs and text alignment

### Formatting Issues

1. Verify locale format configuration
2. Check browser's Intl support
3. Provide polyfills if needed
4. Test with different regional settings

## 📈 Performance Optimization

### Translation Caching

- Translations cached in memory after first load
- Cookie preference reduces API calls
- Static generation for common pages

### Lazy Loading

- Load namespaces on-demand
- Don't load all languages upfront
- Use dynamic imports for large translations

### Bundle Size

- Tree-shake unused translations
- Compress translation files
- Use CDN for translation assets

## 🎯 Next Steps

### Adding More Languages

1. Add to `SUPPORTED_LANGUAGES` in config
2. Create translation files
3. Add locale formats
4. Test thoroughly

### Improving Translations

1. Use professional translation services
2. Implement translation memory
3. Add context for translators
4. Set up continuous localization

### Advanced Features

1. **Automatic translation** - Integrate with translation APIs
2. **User preferences** - Save per-user language settings
3. **Content negotiation** - Auto-detect from Accept-Language header
4. **Locale-based routing** - `/en/patients`, `/es/pacientes`
5. **Translation editor** - In-app translation management
6. **A/B testing** - Test translation variations
7. **Analytics** - Track language usage patterns

## 🎉 Summary

The multi-language integration provides:

- **15+ languages** with professional translations
- **RTL support** for Arabic and Hebrew
- **Regional formatting** for dates, currency, numbers
- **Medical terminology** translations
- **Persistent preferences** via cookies
- **Browser detection** for auto-selection
- **Comprehensive testing** suite
- **Developer-friendly** API

The platform is now ready to serve a global audience with a localized, culturally appropriate
healthcare experience!
