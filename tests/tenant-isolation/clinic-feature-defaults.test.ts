/**
 * Clinic Feature Defaults
 * =======================
 *
 * Guardrail: BLOODWORK_LABS and other critical feature flags default correctly.
 * Prevents tenant drift where one clinic has missing key → wrong default.
 *
 * @see docs/TENANT_CONFIG_DRIFT_CLINIC_8_DIAGNOSIS.md
 */

import { describe, it, expect } from 'vitest';
import { getClinicFeatureBoolean } from '@/lib/clinic/utils';

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
