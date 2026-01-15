/**
 * Source-file targeting tests for lib/stripe.ts
 * These tests directly import and execute the actual module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up environment before imports
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('lib/stripe.ts - Direct Source Tests', () => {
  describe('formatCurrency', () => {
    it('should format cents to USD currency', async () => {
      const { formatCurrency } = await import('@/lib/stripe');
      
      expect(formatCurrency(10000)).toBe('$100.00');
      expect(formatCurrency(1050)).toBe('$10.50');
      expect(formatCurrency(99)).toBe('$0.99');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle large amounts', async () => {
      const { formatCurrency } = await import('@/lib/stripe');
      
      expect(formatCurrency(1000000)).toBe('$10,000.00');
      expect(formatCurrency(100000000)).toBe('$1,000,000.00');
    });

    it('should handle negative amounts', async () => {
      const { formatCurrency } = await import('@/lib/stripe');
      
      expect(formatCurrency(-1000)).toBe('-$10.00');
    });
  });

  describe('STRIPE_CONFIG', () => {
    it('should have correct default values', async () => {
      const { STRIPE_CONFIG } = await import('@/lib/stripe');
      
      expect(STRIPE_CONFIG.currency).toBe('usd');
      expect(STRIPE_CONFIG.invoiceDueDays).toBe(30);
      expect(STRIPE_CONFIG.collectionMethod).toBe('send_invoice');
      expect(STRIPE_CONFIG.paymentMethods).toContain('card');
      expect(STRIPE_CONFIG.paymentMethods).toContain('ach_debit');
    });

    it('should have automaticTax enabled', async () => {
      const { STRIPE_CONFIG } = await import('@/lib/stripe');
      
      expect(STRIPE_CONFIG.automaticTax.enabled).toBe(true);
    });

    it('should have product configuration', async () => {
      const { STRIPE_CONFIG } = await import('@/lib/stripe');
      
      expect(STRIPE_CONFIG.products).toHaveProperty('consultation');
      expect(STRIPE_CONFIG.products).toHaveProperty('prescription');
      expect(STRIPE_CONFIG.products).toHaveProperty('labWork');
    });
  });

  describe('getStripe', () => {
    it('should throw when STRIPE_SECRET_KEY is not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      vi.resetModules();
      
      const { getStripe } = await import('@/lib/stripe');
      
      expect(() => getStripe()).toThrow('Stripe is not configured');
    });
  });

  describe('stripe instance', () => {
    it('should be null when STRIPE_SECRET_KEY is not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      vi.resetModules();
      
      const { stripe } = await import('@/lib/stripe');
      
      expect(stripe).toBeNull();
    });
  });
});
