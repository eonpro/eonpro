/**
 * Feature Flag System for Safe Integration Rollout
 *
 * This system allows us to enable/disable features without code changes.
 * All new EONPRO integrations should be behind feature flags.
 */

// Feature flag configuration type
export interface FeatureFlags {
  // Payment Features
  STRIPE_SUBSCRIPTIONS: boolean;
  STRIPE_CONNECT: boolean;
  SQUARE_PAYMENTS: boolean;

  // Communication Features
  TWILIO_SMS: boolean;
  TWILIO_CHAT: boolean;

  // Telehealth Features
  ZOOM_TELEHEALTH: boolean;
  ZOOM_WAITING_ROOM: boolean;

  // AWS Features
  AWS_S3_STORAGE: boolean;
  AWS_SES_EMAIL: boolean;
  AWS_EVENTBRIDGE: boolean;

  // Advanced Features
  DYNAMIC_FORMS: boolean;
  MULTI_LANGUAGE: boolean;
  ADVANCED_REPORTING: boolean;
  DOSSPOT_EPRESCRIBING: boolean;
}

// Load feature flags from environment variables
export const FEATURES: FeatureFlags = {
  // Payment Features
  STRIPE_SUBSCRIPTIONS: process.env.NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS === 'true',
  STRIPE_CONNECT: process.env.NEXT_PUBLIC_ENABLE_STRIPE_CONNECT === 'true',
  SQUARE_PAYMENTS: process.env.NEXT_PUBLIC_ENABLE_SQUARE_PAYMENTS === 'true',

  // Communication Features
  TWILIO_SMS: process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS === 'true',
  TWILIO_CHAT: process.env.NEXT_PUBLIC_ENABLE_TWILIO_CHAT === 'true',

  // Telehealth Features
  ZOOM_TELEHEALTH: process.env.NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH === 'true',
  ZOOM_WAITING_ROOM: process.env.NEXT_PUBLIC_ENABLE_ZOOM_WAITING_ROOM === 'true',

  // AWS Features
  AWS_S3_STORAGE: process.env.NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE === 'true',
  AWS_SES_EMAIL: process.env.NEXT_PUBLIC_ENABLE_AWS_SES_EMAIL === 'true',
  AWS_EVENTBRIDGE: process.env.NEXT_PUBLIC_ENABLE_AWS_EVENTBRIDGE === 'true',

  // Advanced Features
  DYNAMIC_FORMS: process.env.NEXT_PUBLIC_ENABLE_DYNAMIC_FORMS === 'true',
  MULTI_LANGUAGE: process.env.NEXT_PUBLIC_ENABLE_MULTI_LANGUAGE === 'true',
  ADVANCED_REPORTING: process.env.NEXT_PUBLIC_ENABLE_ADVANCED_REPORTING === 'true',
  DOSSPOT_EPRESCRIBING: process.env.NEXT_PUBLIC_ENABLE_DOSSPOT_EPRESCRIBING === 'true',
};

// Helper function to check if a feature is enabled
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return FEATURES[feature] || false;
}

// Helper function to check multiple features
export function areFeaturesEnabled(...features: (keyof FeatureFlags)[]): boolean {
  return features.every((feature: any) => isFeatureEnabled(feature));
}

// Helper function to check if any feature is enabled
export function isAnyFeatureEnabled(...features: (keyof FeatureFlags)[]): boolean {
  return features.some((feature: any) => isFeatureEnabled(feature));
}

// Environment-based feature presets
export const FEATURE_PRESETS = {
  development: {
    // Enable all features in development for testing
    ALL_FEATURES:
      process.env.NODE_ENV === 'development' &&
      process.env.NEXT_PUBLIC_ENABLE_ALL_FEATURES === 'true',
  },
  staging: {
    // Enable stable features in staging
    STABLE_FEATURES: process.env.NEXT_PUBLIC_ENV === 'staging',
  },
  production: {
    // Only enable tested features in production
    PRODUCTION_READY: process.env.NEXT_PUBLIC_ENV === 'production',
  },
};

// Log active features (only in development) - moved to useEffect to avoid hydration issues
// This should be done in a client component with useEffect

export default FEATURES;
