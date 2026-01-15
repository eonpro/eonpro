/**
 * Feature Flags Tests
 * Tests for the feature flag system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Feature Flags System', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isFeatureEnabled', () => {
    it('should return true when feature is enabled', async () => {
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS = 'true';
      
      const { isFeatureEnabled } = await import('@/lib/features');
      
      expect(isFeatureEnabled('TWILIO_SMS')).toBe(true);
    });

    it('should return false when feature is disabled', async () => {
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS = 'false';
      
      const { isFeatureEnabled } = await import('@/lib/features');
      
      expect(isFeatureEnabled('TWILIO_SMS')).toBe(false);
    });

    it('should return false when feature not set', async () => {
      delete process.env.NEXT_PUBLIC_ENABLE_STRIPE_CONNECT;
      
      const { isFeatureEnabled } = await import('@/lib/features');
      
      expect(isFeatureEnabled('STRIPE_CONNECT')).toBe(false);
    });
  });

  describe('areFeaturesEnabled', () => {
    it('should return true when all features are enabled', async () => {
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS = 'true';
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_CHAT = 'true';
      
      const { areFeaturesEnabled } = await import('@/lib/features');
      
      expect(areFeaturesEnabled('TWILIO_SMS', 'TWILIO_CHAT')).toBe(true);
    });

    it('should return false when any feature is disabled', async () => {
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS = 'true';
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_CHAT = 'false';
      
      const { areFeaturesEnabled } = await import('@/lib/features');
      
      expect(areFeaturesEnabled('TWILIO_SMS', 'TWILIO_CHAT')).toBe(false);
    });
  });

  describe('isAnyFeatureEnabled', () => {
    it('should return true when any feature is enabled', async () => {
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS = 'true';
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_CHAT = 'false';
      
      const { isAnyFeatureEnabled } = await import('@/lib/features');
      
      expect(isAnyFeatureEnabled('TWILIO_SMS', 'TWILIO_CHAT')).toBe(true);
    });

    it('should return false when all features are disabled', async () => {
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS = 'false';
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_CHAT = 'false';
      
      const { isAnyFeatureEnabled } = await import('@/lib/features');
      
      expect(isAnyFeatureEnabled('TWILIO_SMS', 'TWILIO_CHAT')).toBe(false);
    });
  });

  describe('FEATURES object', () => {
    it('should load payment features', async () => {
      process.env.NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS = 'true';
      process.env.NEXT_PUBLIC_ENABLE_STRIPE_CONNECT = 'true';
      
      const { FEATURES } = await import('@/lib/features');
      
      expect(FEATURES.STRIPE_SUBSCRIPTIONS).toBe(true);
      expect(FEATURES.STRIPE_CONNECT).toBe(true);
    });

    it('should load communication features', async () => {
      process.env.NEXT_PUBLIC_ENABLE_TWILIO_SMS = 'true';
      
      const { FEATURES } = await import('@/lib/features');
      
      expect(FEATURES.TWILIO_SMS).toBe(true);
    });

    it('should load telehealth features', async () => {
      process.env.NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH = 'true';
      
      const { FEATURES } = await import('@/lib/features');
      
      expect(FEATURES.ZOOM_TELEHEALTH).toBe(true);
    });

    it('should load AWS features', async () => {
      process.env.NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE = 'true';
      process.env.NEXT_PUBLIC_ENABLE_AWS_SES_EMAIL = 'true';
      
      const { FEATURES } = await import('@/lib/features');
      
      expect(FEATURES.AWS_S3_STORAGE).toBe(true);
      expect(FEATURES.AWS_SES_EMAIL).toBe(true);
    });

    it('should load advanced features', async () => {
      process.env.NEXT_PUBLIC_ENABLE_DYNAMIC_FORMS = 'true';
      process.env.NEXT_PUBLIC_ENABLE_MULTI_LANGUAGE = 'true';
      
      const { FEATURES } = await import('@/lib/features');
      
      expect(FEATURES.DYNAMIC_FORMS).toBe(true);
      expect(FEATURES.MULTI_LANGUAGE).toBe(true);
    });
  });

  describe('FEATURE_PRESETS', () => {
    it('should have development preset', async () => {
      const { FEATURE_PRESETS } = await import('@/lib/features');
      
      expect(FEATURE_PRESETS.development).toBeDefined();
      expect(FEATURE_PRESETS.development.ALL_FEATURES).toBeDefined();
    });

    it('should have staging preset', async () => {
      const { FEATURE_PRESETS } = await import('@/lib/features');
      
      expect(FEATURE_PRESETS.staging).toBeDefined();
      expect(FEATURE_PRESETS.staging.STABLE_FEATURES).toBeDefined();
    });

    it('should have production preset', async () => {
      const { FEATURE_PRESETS } = await import('@/lib/features');
      
      expect(FEATURE_PRESETS.production).toBeDefined();
      expect(FEATURE_PRESETS.production.PRODUCTION_READY).toBeDefined();
    });
  });

  describe('Default export', () => {
    it('should export FEATURES as default', async () => {
      const featuresModule = await import('@/lib/features');
      
      expect(featuresModule.default).toBeDefined();
      expect(featuresModule.default).toHaveProperty('TWILIO_SMS');
    });
  });
});
