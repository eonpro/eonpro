/**
 * Overtime (OT) Intake Normalizer Tests
 * Verifies Heyflow-style payloads are normalized for ot.eonpro.io
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeOvertimePayload,
  detectTreatmentType,
  isCheckoutComplete,
} from '@/lib/overtime/intakeNormalizer';

describe('Overtime Intake Normalizer (Heyflow → ot.eonpro.io)', () => {
  it('normalizes Heyflow-style weight_loss payload with Airtable field names', () => {
    const payload = {
      'Response ID': 'test-wl-123',
      'First name': 'Test',
      'Last name': 'WeightLoss',
      email: 'test.weightloss@example.com',
      'phone number': '+1 (555) 123-4567',
      DOB: '01/15/1985',
      Gender: 'Male',
      State: 'Florida',
      'Address [Street]': '123 Test Street',
      'Address [City]': 'Miami',
      'Address [State]': 'FL',
      'Address [Zip]': '33101',
      'Height [feet]': 5,
      'Height [inches]': 10,
      'starting weight': 220,
      'ideal weight': 180,
      treatmentType: 'weight_loss',
    };
    const normalized = normalizeOvertimePayload(payload);
    expect(normalized.treatmentType).toBe('weight_loss');
    expect(normalized.patient.firstName).toBe('Test');
    expect(normalized.patient.lastName).toBe('Weightloss'); // normalizer preserves title-case from input
    expect(normalized.patient.email).toBe('test.weightloss@example.com');
    expect(normalized.patient.state).toBeDefined();
    expect(normalized.submissionId).toBe('test-wl-123');
    expect(normalized.sections.length).toBeGreaterThan(0);
    expect(normalized.answers.length).toBeGreaterThan(0);
  });

  it('detects treatment type from payload', () => {
    expect(detectTreatmentType({ treatmentType: 'weight_loss' })).toBe('weight_loss');
    expect(detectTreatmentType({ treatmentType: 'peptides' })).toBe('peptides');
    expect(detectTreatmentType({ treatmentType: 'better_sex' })).toBe('better_sex');
    expect(detectTreatmentType({ treatmentType: 'nad_plus' })).toBe('nad_plus');
    expect(detectTreatmentType({ treatmentType: 'testosterone' })).toBe('testosterone');
    expect(detectTreatmentType({ treatmentType: 'baseline_bloodwork' })).toBe(
      'baseline_bloodwork'
    );
  });

  it('isCheckoutComplete returns true when checkout completed', () => {
    expect(isCheckoutComplete({ 'Checkout Completed': true })).toBe(true);
    expect(isCheckoutComplete({ 'Checkout Completed': 'Yes' })).toBe(true);
  });

  it('isCheckoutComplete returns false when not complete', () => {
    expect(isCheckoutComplete({})).toBe(false);
    expect(isCheckoutComplete({ 'Checkout Completed': false })).toBe(false);
  });
});
