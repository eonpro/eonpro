import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  shouldUseEonproCookieDomain,
  getRequestHost,
  getRequestHostWithUrlFallback,
} from '@/lib/request-host';

describe('Cross-subdomain cookie sharing (*.eonpro.io)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('shouldUseEonproCookieDomain', () => {
    it('returns true for app.eonpro.io', () => {
      expect(shouldUseEonproCookieDomain('app.eonpro.io')).toBe(true);
    });

    it('returns true for wellmedr.eonpro.io', () => {
      expect(shouldUseEonproCookieDomain('wellmedr.eonpro.io')).toBe(true);
    });

    it('returns true for ot.eonpro.io', () => {
      expect(shouldUseEonproCookieDomain('ot.eonpro.io')).toBe(true);
    });

    it('returns true for eonmeds.eonpro.io', () => {
      expect(shouldUseEonproCookieDomain('eonmeds.eonpro.io')).toBe(true);
    });

    it('returns true for www.eonpro.io', () => {
      expect(shouldUseEonproCookieDomain('www.eonpro.io')).toBe(true);
    });

    it('returns true for any arbitrary subdomain of eonpro.io', () => {
      expect(shouldUseEonproCookieDomain('newclinic.eonpro.io')).toBe(true);
    });

    it('returns false when EONPRO_COOKIE_DOMAIN is empty string', () => {
      process.env.EONPRO_COOKIE_DOMAIN = '';
      expect(shouldUseEonproCookieDomain('app.eonpro.io')).toBe(false);
    });

    it('returns false for localhost in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.EONPRO_COOKIE_DOMAIN;
      expect(shouldUseEonproCookieDomain('localhost:3000')).toBe(false);
    });

    it('returns true in production when EONPRO_COOKIE_DOMAIN is .eonpro.io and host is non-eonpro', () => {
      process.env.NODE_ENV = 'production';
      process.env.EONPRO_COOKIE_DOMAIN = '.eonpro.io';
      expect(shouldUseEonproCookieDomain('custom-domain.com')).toBe(true);
    });

    it('returns true in production by default when env var is not set', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.EONPRO_COOKIE_DOMAIN;
      expect(shouldUseEonproCookieDomain('custom-domain.com')).toBe(true);
    });

    it('returns false for non-eonpro host in development even with EONPRO_COOKIE_DOMAIN set', () => {
      process.env.NODE_ENV = 'development';
      process.env.EONPRO_COOKIE_DOMAIN = '.eonpro.io';
      expect(shouldUseEonproCookieDomain('localhost:3000')).toBe(false);
    });
  });

  describe('getRequestHost', () => {
    it('prefers x-forwarded-host header', () => {
      const headers = new Headers({
        'x-forwarded-host': 'app.eonpro.io',
        host: 'internal-lb.example.com',
      });
      expect(getRequestHost({ headers })).toBe('app.eonpro.io');
    });

    it('falls back to host header', () => {
      const headers = new Headers({
        host: 'wellmedr.eonpro.io',
      });
      expect(getRequestHost({ headers })).toBe('wellmedr.eonpro.io');
    });

    it('handles comma-separated x-forwarded-host (takes first)', () => {
      const headers = new Headers({
        'x-forwarded-host': 'app.eonpro.io, proxy.internal',
      });
      expect(getRequestHost({ headers })).toBe('app.eonpro.io');
    });
  });

  describe('cookie domain value derivation', () => {
    it('produces .eonpro.io domain for app.eonpro.io login', () => {
      const host = 'app.eonpro.io';
      const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;
      expect(cookieDomain).toBe('.eonpro.io');
    });

    it('produces .eonpro.io domain for wellmedr.eonpro.io login', () => {
      const host = 'wellmedr.eonpro.io';
      const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;
      expect(cookieDomain).toBe('.eonpro.io');
    });

    it('produces .eonpro.io domain for ot.eonpro.io login', () => {
      const host = 'ot.eonpro.io';
      const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;
      expect(cookieDomain).toBe('.eonpro.io');
    });

    it('produces undefined domain for localhost (no sharing)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.EONPRO_COOKIE_DOMAIN;
      const host = 'localhost:3000';
      const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;
      expect(cookieDomain).toBeUndefined();
    });
  });
});
