/**
 * Unit tests for clinic feature helpers (e.g. getClinicFeatureBoolean).
 * Ensures BLOODWORK_LABS and other clinic-gated UI flags are read correctly.
 */

import { describe, it, expect } from 'vitest';
import { getClinicFeatureBoolean } from '@/lib/clinic/utils';

describe('getClinicFeatureBoolean', () => {
  it('returns defaultWhenMissing (true) when rawFeatures is null', () => {
    expect(getClinicFeatureBoolean(null, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean(null, 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('returns defaultWhenMissing when rawFeatures is undefined', () => {
    expect(getClinicFeatureBoolean(undefined, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean(undefined, 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('returns defaultWhenMissing when rawFeatures is not an object', () => {
    expect(getClinicFeatureBoolean('string', 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean(42, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean(true, 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('returns defaultWhenMissing when rawFeatures is an array', () => {
    expect(getClinicFeatureBoolean([], 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean([1, 2], 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('returns defaultWhenMissing when key is missing from object', () => {
    expect(getClinicFeatureBoolean({}, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean({ other: true }, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean({}, 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('returns true when key is true', () => {
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: true }, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: true }, 'BLOODWORK_LABS', false)).toBe(true);
  });

  it('returns false only when key is explicitly false', () => {
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: false }, 'BLOODWORK_LABS', true)).toBe(false);
    expect(getClinicFeatureBoolean({ BLOODWORK_LABS: false }, 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('treats undefined value as default (true)', () => {
    const obj: Record<string, unknown> = { BLOODWORK_LABS: undefined };
    expect(getClinicFeatureBoolean(obj, 'BLOODWORK_LABS', true)).toBe(true);
    expect(getClinicFeatureBoolean(obj, 'BLOODWORK_LABS', false)).toBe(false);
  });

  it('defaults defaultWhenMissing to true', () => {
    expect(getClinicFeatureBoolean(null, 'BLOODWORK_LABS')).toBe(true);
    expect(getClinicFeatureBoolean({}, 'BLOODWORK_LABS')).toBe(true);
  });
});
