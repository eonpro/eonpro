/**
 * Phase 4 regression: NAD+ and B12 must NOT double-render in both the
 * dosing schedule AND the "Additional Medication Directions" block on
 * the patient portal medications page.
 *
 * The page's `nonInjectableActiveMeds` filter (in
 * `src/app/patient-portal/medications/page.tsx`) skips meds where
 * `isInjectableMedication(name) === true`. Once Phase 1 reclassified
 * NAD+ and B12 as injectable, that filter automatically excludes them.
 * This test pins the invariant so a future revert of Phase 1 (or a
 * regression in `isInjectableMedication`) immediately breaks here.
 */
import { describe, it, expect } from 'vitest';
import { isInjectableMedication, isSupplyMedication } from '@/lib/utils/rx-sig-parser';

// The `nonInjectableActiveMeds` filter from the medications page,
// extracted as a pure function so we can unit-test the rule. Keep this
// in sync with the inline implementation in
// `src/app/patient-portal/medications/page.tsx` lines ~443–475.
function shouldShowInAdditionalDirections(med: {
  name: string;
  directions: string | null;
}): boolean {
  if (isSupplyMedication(med.name)) return false;
  if (isInjectableMedication(med.name)) return false;
  if (!med.directions) return false;
  return true;
}

describe('Medications page — Additional Medication Directions filter', () => {
  it('NAD+ does NOT appear in Additional Directions (it belongs in the dosing schedule)', () => {
    expect(
      shouldShowInAdditionalDirections({
        name: 'NAD+ 100 mg/mL (10 mL)',
        directions: 'Inject 40 units once daily Monday-Friday',
      })
    ).toBe(false);
  });

  it('B12 (Cyanocobalamin) does NOT appear in Additional Directions', () => {
    expect(
      shouldShowInAdditionalDirections({
        name: 'Cyanocobalamin (B12) 1000mcg/mL',
        directions: 'Inject 50 units twice per week',
      })
    ).toBe(false);
  });

  it('Sermorelin does NOT appear in Additional Directions', () => {
    expect(
      shouldShowInAdditionalDirections({
        name: 'Sermorelin Acetate 5mg',
        directions: 'Inject 20 units subcutaneously Monday-Friday at bedtime',
      })
    ).toBe(false);
  });

  it('Semaglutide does NOT appear in Additional Directions', () => {
    expect(
      shouldShowInAdditionalDirections({
        name: 'Semaglutide 2.5mg/1mL',
        directions: 'Inject 0.25 mg once weekly',
      })
    ).toBe(false);
  });

  it('Sildenafil (oral) DOES appear in Additional Directions', () => {
    expect(
      shouldShowInAdditionalDirections({
        name: 'Sildenafil 55 mg Capsule',
        directions: 'Take 1 capsule by mouth as needed.',
      })
    ).toBe(true);
  });

  it('Oral B12 supplement DOES appear in Additional Directions (NOT classified as injectable)', () => {
    expect(
      shouldShowInAdditionalDirections({
        name: 'Vitamin B12 Methylcobalamin Tablet',
        directions: 'Take 1 tablet daily.',
      })
    ).toBe(true);
  });

  it('Syringe kits do NOT appear (supply, not a medication)', () => {
    expect(
      shouldShowInAdditionalDirections({
        name: 'Syringes/Alcohol Pads (Kit of #10)',
        directions: 'Use as directed.',
      })
    ).toBe(false);
  });
});
