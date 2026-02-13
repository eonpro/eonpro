/**
 * Cron tenant isolation tests
 *
 * - Job runs in tenant context (runCronPerTenant uses runWithClinicContext per clinic)
 * - Clinic A data is not touched when processing clinic B (per-clinic callback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyCronAuth,
  getClinicIdsForCron,
  runCronPerTenant,
  takeBatch,
} from '@/lib/cron/tenant-isolation';

describe('Cron tenant isolation', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('verifyCronAuth', () => {
    it('accepts Bearer CRON_SECRET', () => {
      vi.stubEnv('CRON_SECRET', 'secret123');
      const req = new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer secret123' },
      }) as unknown as Request;
      expect(verifyCronAuth(req as any)).toBe(true);
    });

    it('accepts x-cron-secret header', () => {
      vi.stubEnv('CRON_SECRET', 'secret123');
      const req = new Request('http://localhost/api/cron/test', {
        headers: { 'x-cron-secret': 'secret123' },
      }) as unknown as Request;
      expect(verifyCronAuth(req as any)).toBe(true);
    });

    it('rejects wrong secret', () => {
      vi.stubEnv('CRON_SECRET', 'secret123');
      const req = new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer wrong' },
      }) as unknown as Request;
      expect(verifyCronAuth(req as any)).toBe(false);
    });
  });

  describe('takeBatch', () => {
    it('limits array to batch size', () => {
      const items = [1, 2, 3, 4, 5];
      expect(takeBatch(items, 2)).toEqual([1, 2]);
      expect(takeBatch(items, 10)).toEqual([1, 2, 3, 4, 5]);
      expect(takeBatch(items, 0)).toEqual([]);
    });
  });

  describe('runCronPerTenant', () => {
    it('runs per-clinic callback in isolation and collects results', async () => {
      const results = await runCronPerTenant({
        jobName: 'test-job',
        clinicIds: [1, 2],
        perClinic: async (clinicId) => ({ clinicId, value: clinicId * 10 }),
      });

      expect(results.results).toHaveLength(2);
      const r1 = results.results.find((r) => r.clinicId === 1);
      const r2 = results.results.find((r) => r.clinicId === 2);
      expect(r1?.success).toBe(true);
      expect(r1?.data).toEqual({ clinicId: 1, value: 10 });
      expect(r2?.success).toBe(true);
      expect(r2?.data).toEqual({ clinicId: 2, value: 20 });
      expect(results.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('isolates errors: clinic A failure does not stop clinic B', async () => {
      const results = await runCronPerTenant({
        jobName: 'test-fail',
        clinicIds: [1, 2, 3],
        perClinic: async (clinicId) => {
          if (clinicId === 2) throw new Error('Clinic 2 failed');
          return { clinicId };
        },
      });

      expect(results.results).toHaveLength(3);
      expect(results.results.find((r) => r.clinicId === 1)?.success).toBe(true);
      expect(results.results.find((r) => r.clinicId === 2)?.success).toBe(false);
      expect(results.results.find((r) => r.clinicId === 2)?.error).toBe('Clinic 2 failed');
      expect(results.results.find((r) => r.clinicId === 3)?.success).toBe(true);
    });

    it('returns empty results when clinicIds is empty', async () => {
      const results = await runCronPerTenant({
        jobName: 'empty',
        clinicIds: [],
        perClinic: async () => ({}),
      });
      expect(results.results).toHaveLength(0);
    });
  });
});
