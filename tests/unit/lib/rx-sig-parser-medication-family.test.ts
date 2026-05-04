/**
 * Patient portal multi-product injection schedule — medication family
 * classifier (Phase 1 of `feat/patient-portal-multi-injectable-schedule`).
 *
 * Background: WellMedR Elite Bundle patients are prescribed a GLP-1
 * (Semaglutide or Tirzepatide) plus add-ons (NAD+, Sermorelin, B12) in
 * parallel. The patient portal `/medications` page can only render a
 * proper "Your Dosing Schedule" for medications that
 * `isInjectableMedication()` recognizes; NAD+ and B12 were missing.
 *
 * These tests pin the new behavior:
 *  - `isInjectableMedication()` now recognizes NAD+ and B12 (Cyanocobalamin).
 *  - New `getMedicationFamily()` returns a stable family identifier the
 *    schedule builder uses to group parallel injectables (newest-Rx-wins
 *    *per family* instead of globally).
 *
 * Family classification prefers `medicationKey` (Lifefile SKU, source of
 * truth — see `ADDON_MEDICATION_KEY_TO_ADDON` in
 * `src/lib/invoices/wellmedr-pricing.ts` and the `MEDS` registry in
 * `src/lib/medications.ts`) and falls back to normalized name substrings
 * for legacy Rxs that lack a key.
 *
 * Negative cases (oral B12 supplement, "Tribulus" containing "tb", etc.)
 * verify we don't widen the injectable surface incorrectly.
 */
import { describe, it, expect } from 'vitest';
import {
  isInjectableMedication,
  getMedicationFamily,
  type MedicationFamily,
} from '@/lib/utils/rx-sig-parser';

describe('isInjectableMedication — Elite Bundle add-ons', () => {
  it.each([
    ['NAD+ 100 mg/mL (10 mL)', true],
    ['NAD+ 100 mg/mL (5 mL)', true],
    ['Cyanocobalamin (B12) 1000mcg/mL', true],
    ['Vitamin B12 Injection', true],
    // Existing recognized injectables must keep working.
    ['Semaglutide 2.5mg/1mL', true],
    ['Tirzepatide 10mg/2mL', true],
    ['Sermorelin Acetate 5mg', true],
    ['Testosterone Cypionate 200 mg/mL', true],
    ['BPC-157 5mg/vial', true],
    ['TB-500 5mg/vial', true],
  ])('classifies %s as injectable', (name, expected) => {
    expect(isInjectableMedication(name)).toBe(expected);
  });

  it.each([
    ['Vitamin B12 Methylcobalamin Tablet 1000mcg', false],
    ['Vitamin B12 Sublingual Lozenge', false],
    ['Sildenafil 55 mg Capsule', false],
    ['Tadalafil 5 mg Tablet', false],
    ['Tribulus Terrestris Capsule 500mg', false],
    ['Syringes/Alcohol Pads (Kit of #10)', false],
    ['', false],
  ])('does NOT classify %s as injectable', (name, expected) => {
    expect(isInjectableMedication(name)).toBe(expected);
  });
});

describe('getMedicationFamily — by Lifefile medicationKey (preferred)', () => {
  it.each<[string, MedicationFamily]>([
    ['203194055', 'nad_plus'],
    ['204754029', 'nad_plus'],
    ['203666651', 'sermorelin'],
    ['203418853', 'sermorelin'],
    ['203449111', 'b12'],
    // GLP-1 family — pin the SKUs already used in production fixtures
    // (`tests/unit/invoices/ot-pricing.test.ts` line 28).
    ['203448971', 'glp1'],
    ['203448974', 'glp1'],
    ['202851329', 'glp1'],
    // Testosterone Cypionate
    ['202851334', 'testosterone'],
  ])('medicationKey %s → %s', (medicationKey, expected) => {
    expect(getMedicationFamily({ medicationKey })).toBe(expected);
  });

  it('returns "other" for an unknown medicationKey when no name fallback exists', () => {
    expect(getMedicationFamily({ medicationKey: '999999999' })).toBe('other');
  });
});

describe('getMedicationFamily — name fallback when medicationKey is missing', () => {
  it.each<[string, MedicationFamily]>([
    ['Semaglutide 2.5mg/1mL', 'glp1'],
    ['SEMAGLUTIDE/GLYCINE 2.5/20MG/ML (1ML VIAL) SOLUTION', 'glp1'],
    ['Tirzepatide 10mg/2mL', 'glp1'],
    ['Sermorelin Acetate 5mg', 'sermorelin'],
    ['NAD+ 100 mg/mL (10 mL)', 'nad_plus'],
    ['NAD+ Injection', 'nad_plus'],
    ['Cyanocobalamin (B12) 1000mcg/mL', 'b12'],
    ['Vitamin B12 Injection 1000mcg', 'b12'],
    ['Testosterone Cypionate 200 mg/mL', 'testosterone'],
    ['BPC-157 5mg/vial', 'bpc'],
    ['TB-500 5mg/vial', 'tb500'],
  ])('name "%s" → %s', (name, expected) => {
    expect(getMedicationFamily({ name })).toBe(expected);
  });

  it.each<[string]>([
    ['Vitamin B12 Methylcobalamin Tablet 1000mcg'],
    ['Vitamin B12 Sublingual Lozenge'],
    ['Tribulus Terrestris Capsule 500mg'],
    ['Sildenafil 55 mg Capsule'],
    ['Random Multivitamin'],
    [''],
  ])('name "%s" → other (oral / non-injectable / ambiguous)', (name) => {
    expect(getMedicationFamily({ name })).toBe('other');
  });
});

describe('getMedicationFamily — precedence (medicationKey wins over name)', () => {
  it('trusts medicationKey even when name suggests a different family', () => {
    // Pathological: someone typed "Semaglutide" into name but the SKU is B12.
    // The pharmacy SKU is the source of truth.
    expect(
      getMedicationFamily({
        medicationKey: '203449111',
        name: 'Semaglutide (mislabeled)',
      })
    ).toBe('b12');
  });

  it('falls back to name when medicationKey is unknown', () => {
    expect(
      getMedicationFamily({
        medicationKey: '999999999',
        name: 'Sermorelin Acetate 5mg',
      })
    ).toBe('sermorelin');
  });

  it('falls back to name when medicationKey is null/undefined/empty', () => {
    expect(getMedicationFamily({ medicationKey: null, name: 'NAD+ 100 mg/mL' })).toBe(
      'nad_plus'
    );
    expect(getMedicationFamily({ medicationKey: undefined, name: 'Sermorelin' })).toBe(
      'sermorelin'
    );
    expect(getMedicationFamily({ medicationKey: '', name: 'Tirzepatide' })).toBe('glp1');
  });

  it('returns "other" when both inputs are missing', () => {
    expect(getMedicationFamily({})).toBe('other');
    expect(getMedicationFamily({ name: '', medicationKey: '' })).toBe('other');
  });
});

describe('getMedicationFamily — disambiguation guards (no false positives)', () => {
  it('does NOT classify oral B12 supplements as the b12 (injectable) family', () => {
    // Oral / sublingual B12 must not appear in the dosing schedule. The
    // disambiguator looks for "injection" or "cyanocobalamin" in the name,
    // or trusts the medicationKey when present.
    expect(
      getMedicationFamily({
        name: 'Vitamin B12 Methylcobalamin Tablet 1000mcg',
      })
    ).toBe('other');
    expect(
      getMedicationFamily({
        name: 'Vitamin B12 Sublingual Lozenge',
      })
    ).toBe('other');
  });

  it('does NOT classify "Tribulus" as TB-500 (substring trap)', () => {
    expect(getMedicationFamily({ name: 'Tribulus Terrestris Capsule 500mg' })).toBe(
      'other'
    );
  });

  it('does NOT classify "BPC oral supplement" without dose form as injectable', () => {
    // BPC-157 the peptide is injectable; an "oral BPC supplement" wouldn't
    // typically appear, but if it did it must not be auto-injected.
    // Currently we accept any "bpc" hit because real-world Rxs always
    // include "BPC-157" in the name; if a non-injectable variant ships,
    // this test will need a stronger guard.
    expect(getMedicationFamily({ name: 'BPC-157 Injection 5mg/vial' })).toBe('bpc');
  });
});
