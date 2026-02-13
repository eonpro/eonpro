/**
 * Tenant 404 normalization – enterprise anti-enumeration.
 * Cross-tenant or not-found must return the same 404 body: { error: 'Not found' }.
 *
 * @module tests/tenant-isolation/tenant-404-normalization
 */

import { describe, it, expect } from 'vitest';
import {
  tenantNotFoundResponse,
  ensureTenantResource,
} from '@/lib/tenant-response';

describe('Tenant 404 normalization', () => {
  describe('tenantNotFoundResponse()', () => {
    it('returns status 404', () => {
      const res = tenantNotFoundResponse();
      expect(res.status).toBe(404);
    });

    it('returns body { error: "Not found" }', async () => {
      const res = tenantNotFoundResponse();
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
    });
  });

  describe('ensureTenantResource()', () => {
    it('returns 404 response when resource is null', () => {
      const res = ensureTenantResource(null, 1);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(404);
    });

    it('returns 404 response when resource is undefined', () => {
      const res = ensureTenantResource(undefined, 1);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(404);
    });

    it('returns 404 with body { error: "Not found" } when resource is null', async () => {
      const res = ensureTenantResource(null, 1);
      expect(res).not.toBeNull();
      const body = await res!.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('returns null when resource exists and clinicId matches', () => {
      const res = ensureTenantResource({ id: 1, clinicId: 10 }, 10);
      expect(res).toBeNull();
    });

    it('returns null when currentClinicId is undefined (e.g. super_admin)', () => {
      const res = ensureTenantResource({ id: 1, clinicId: 10 }, undefined);
      expect(res).toBeNull();
    });

    it('returns 404 when resource belongs to another clinic', async () => {
      const res = ensureTenantResource({ id: 1, clinicId: 10 }, 20);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(404);
      const body = await res!.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('same 404 body for nonexistent vs wrong-clinic (anti-enumeration)', async () => {
      const notFoundRes = ensureTenantResource(null, 1);
      const wrongClinicRes = ensureTenantResource({ id: 999, clinicId: 2 }, 1);
      expect(notFoundRes).not.toBeNull();
      expect(wrongClinicRes).not.toBeNull();
      const bodyNull = await notFoundRes!.json();
      const bodyWrong = await wrongClinicRes!.json();
      expect(bodyNull).toEqual(bodyWrong);
      expect(bodyNull).toEqual({ error: 'Not found' });
    });
  });
});
