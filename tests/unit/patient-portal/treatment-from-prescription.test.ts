/**
 * Patient portal: derive treatment type from prescription/medication name.
 */

import { describe, it, expect } from 'vitest';
import {
  getTreatmentTypeFromMedicationName,
  getTreatmentTypeFromOrder,
} from '@/lib/patient-portal/treatment-from-prescription';

describe('getTreatmentTypeFromMedicationName', () => {
  it('maps semaglutide to weight_loss', () => {
    expect(getTreatmentTypeFromMedicationName('Semaglutide 2.5mg/2ml')).toBe('weight_loss');
    expect(getTreatmentTypeFromMedicationName('Ozempic')).toBe('weight_loss');
    expect(getTreatmentTypeFromMedicationName('Wegovy')).toBe('weight_loss');
  });

  it('maps tirzepatide to weight_loss', () => {
    expect(getTreatmentTypeFromMedicationName('Tirzepatide')).toBe('weight_loss');
    expect(getTreatmentTypeFromMedicationName('Mounjaro')).toBe('weight_loss');
  });

  it('maps testosterone to hormone_therapy', () => {
    expect(getTreatmentTypeFromMedicationName('Testosterone Cypionate')).toBe('hormone_therapy');
    expect(getTreatmentTypeFromMedicationName('Testosterone Enanthate')).toBe('hormone_therapy');
  });

  it('returns null for empty or unknown medication', () => {
    expect(getTreatmentTypeFromMedicationName('')).toBe(null);
    expect(getTreatmentTypeFromMedicationName(null)).toBe(null);
    expect(getTreatmentTypeFromMedicationName(undefined)).toBe(null);
    expect(getTreatmentTypeFromMedicationName('Vitamin D')).toBe(null);
  });
});

describe('getTreatmentTypeFromOrder', () => {
  it('uses primaryMedName when present', () => {
    expect(
      getTreatmentTypeFromOrder({
        primaryMedName: 'Semaglutide 2.5mg/2ml',
        rxs: [],
      })
    ).toBe('weight_loss');
  });

  it('falls back to first Rx medName when primaryMedName has no match', () => {
    expect(
      getTreatmentTypeFromOrder({
        primaryMedName: 'Compound',
        rxs: [{ medName: 'Testosterone Cypionate 200mg/ml' }],
      })
    ).toBe('hormone_therapy');
  });

  it('returns null when no match', () => {
    expect(
      getTreatmentTypeFromOrder({
        primaryMedName: 'Unknown Med',
        rxs: [{ medName: 'Other' }],
      })
    ).toBe(null);
  });
});
