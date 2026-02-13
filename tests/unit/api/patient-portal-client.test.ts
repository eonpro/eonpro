/**
 * Patient Portal API Client unit tests
 * Verifies portalFetch default cache and auth behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { portalFetch, SESSION_EXPIRED_MESSAGE, getPortalResponseError } from '@/lib/api/patient-portal-client';

vi.mock('@/lib/utils/auth-token', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer mock-token' }),
}));

describe('patient-portal-client', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  describe('portalFetch', () => {
    it('uses cache: no-store by default so refetches after mutations return fresh data', async () => {
      await portalFetch('/api/patient-progress/weight?patientId=1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/patient-progress/weight?patientId=1',
        expect.objectContaining({
          cache: 'no-store',
          credentials: 'include',
        })
      );
    });

    it('allows caller to override cache via init.cache', async () => {
      await portalFetch('/api/foo', { cache: 'force-cache' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/foo',
        expect.objectContaining({ cache: 'force-cache' })
      );
    });
  });

  describe('getPortalResponseError', () => {
    it('returns SESSION_EXPIRED_MESSAGE for 401', () => {
      expect(getPortalResponseError(new Response('', { status: 401 }))).toBe(SESSION_EXPIRED_MESSAGE);
    });
    it('returns access denied message for 403', () => {
      expect(getPortalResponseError(new Response('', { status: 403 }))).toContain('Access denied');
    });
    it('returns null for 200', () => {
      expect(getPortalResponseError(new Response('', { status: 200 }))).toBeNull();
    });
  });
});
