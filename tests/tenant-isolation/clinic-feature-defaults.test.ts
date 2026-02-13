/**
 * Clinic Feature Defaults
 * =======================
 *
 * Guardrail: BLOODWORK_LABS and other critical feature flags default correctly.
 * Prevents tenant drift where one clinic has missing key → wrong default.
 *
 * @see docs/TENANT_CONFIG_DRIFT_CLINIC_8_DIAGNOSIS.md
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

import { describe, it, expect } from 'vitest';
import { getClinicFeatureBoolean } from '@/lib/clinic/utils';
import { DEFAULT_CLINIC_FEATURES } from '@/lib/clinic/feature-defaults';

describe('getClinicFeatureBoolean defaults', () => {
  it('returns defaultWhenMissing when features is null', () => {
    expect(getClinicFeatureBoolean(null, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean(null, 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('returns defaultWhenMissing when features is undefined', () => {
    expect(getClinicFeatureBoolean(undefined, 'BLOODWORK_LABS', true)).toBe(true);
  });

  it('returns defaultWhenMissing when key is missing', () => {
    expect(getClinicFeatureBoolean({}, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean({ other: true }, 'BLOODWORK_LABS', true)).toBe(true);
  });

  it('returns true when BLOODWORK_LABS is explicitly true', () => {
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: true }, 'BLOODWORK_LABS', true)).toBe(true);
  });

  it('returns false only when BLOODWORK_LABS is explicitly false', () => {
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: false }, 'BLOODWORK_LABS', true)).toBe(
      false
    );
  });

  it('treats truthy non-boolean as enabled (no accidental hide)', () => {
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: 1 }, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: 'yes' }, 'BLOODWORK_LABS', true)).toBe(true);
  });
});

describe('DEFAULT_CLINIC_FEATURES single source of truth', () => {
  it('includes BLOODWORK_LABS defaulting to true', () => {
    expect(DEFAULT_CLINIC_FEATURES).toHaveProperty('BLOODWORK_LABS');
    expect(DEFAULT_CLINIC_FEATURES.BLOODWORK_LABS).toBe(true);
  });

  it('has only boolean values for uniformity', () => {
    for (const [key, value] of Object.entries(DEFAULT_CLINIC_FEATURES)) {
      expect(typeof value, `DEFAULT_CLINIC_FEATURES.${key} must be boolean`).toBe('boolean');
    }
  });
});

describe('ACTIVE clinics feature completeness (DB regression)', () => {
  const runDbCheck = process.env.RUN_CLINIC_FEATURE_DB_REGRESSION === '1';

  it.skipIf(!runDbCheck)(
    'every ACTIVE clinic has all DEFAULT_CLINIC_FEATURES keys present',
    async () => {
      const { basePrisma } = await import('@/lib/db');
      const clinics = await basePrisma.clinic.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, subdomain: true, features: true },
      });
      if (!Array.isArray(clinics)) {
        return; // Prisma mocked or no DB; skip assertion
      }
      const requiredKeys = Object.keys(DEFAULT_CLINIC_FEATURES);
      const missing: Array<{ id: number; name: string; subdomain: string | null; keys: string[] }> = [];
      for (const c of clinics) {
        const current = (c.features as Record<string, unknown>) || {};
        const absent = requiredKeys.filter((k) => current[k] === undefined);
        if (absent.length) missing.push({ id: c.id, name: c.name, subdomain: c.subdomain, keys: absent });
      }
      expect(
        missing,
        `ACTIVE clinics missing DEFAULT_CLINIC_FEATURES keys. Run: npx tsx scripts/ensure-clinic-feature-defaults.ts\n${JSON.stringify(missing, null, 2)}`
      ).toHaveLength(0);
    }
  );
});
