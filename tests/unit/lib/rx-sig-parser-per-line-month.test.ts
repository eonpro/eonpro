/**
 * Regression: WellMedR / OT GLP-1 packages emit one prescription line per
 * dose-month with an explicit `Month N:` SIG annotation (e.g. the 1mL vial
 * carries Month 1, the 3mL vial carries Months 2+3 stitched together).
 *
 * The patient-portal "Dosing Schedule" widget previously required ≥2
 * `Month N:` tags per line before honoring them, so a single-month line
 * fell through to a vial-volume estimator that invented duplicate months
 * at the starting dose. WellMedR patient Yvonne G. (Mar 2026 Rx) saw all
 * three months show "10 UNITS (0.25 mg)" instead of the correct
 * 10u → 20u → 40u titration.
 *
 * This test pins the parser behavior so a single explicit `Month N:` is
 * trusted as exactly one period at the prescriber's dose.
 */
import { describe, it, expect } from 'vitest';
import { parseMultiMonthDirections } from '@/lib/utils/rx-sig-parser';

describe('parseMultiMonthDirections — per-line `Month N:` annotations', () => {
  // Real SIG from Yvonne Greenside's Mar 19 2026 Rx, 1mL vial line item.
  const MONTH_1_SIG =
    'Month 1: Inject 0.25 mg (0.1 mL / 10 units) subcutaneously once weekly for 4 weeks. ' +
    'Rotate injection sites. Keep refrigerated.';

  // Real SIG from the same Rx, 3mL vial line item — note the duplicated
  // "Month 3:" prefix that comes from the admin-saved Order Set template.
  const MONTHS_2_AND_3_SIG =
    'Month 2: Inject 0.5 mg (0.2 mL / 20 units) subcutaneously once weekly for 4 weeks. | ' +
    'Month 3: Month 3: Inject 1 mg (0.4 mL / 40 units) subcutaneously once weekly for 4 weeks. ' +
    'Rotate injection sites. Keep refrigerated.';

  it('returns one segment for a single explicit `Month 1:` SIG (per-line OT package)', () => {
    const segments = parseMultiMonthDirections(MONTH_1_SIG);

    expect(segments).not.toBeNull();
    expect(segments).toHaveLength(1);
    expect(segments![0].monthNumber).toBe(1);
    expect(segments![0].dose).toEqual({ mg: '0.25', units: '10' });
    expect(segments![0].weeks).toBe(4);
  });

  it('returns two segments for a `Month 2: ... | Month 3: ...` stitched SIG', () => {
    const segments = parseMultiMonthDirections(MONTHS_2_AND_3_SIG);

    expect(segments).not.toBeNull();
    expect(segments).toHaveLength(2);

    expect(segments![0].monthNumber).toBe(2);
    expect(segments![0].dose).toEqual({ mg: '0.5', units: '20' });
    expect(segments![0].weeks).toBe(4);

    expect(segments![1].monthNumber).toBe(3);
    expect(segments![1].dose).toEqual({ mg: '1', units: '40' });
    expect(segments![1].weeks).toBe(4);
  });

  it('still returns null for a legacy SIG with no `Month N:` annotation', () => {
    const legacy = 'Inject 0.25 mg (10 units) subcutaneously once weekly.';
    expect(parseMultiMonthDirections(legacy)).toBeNull();
  });

  it('reproduces the full Yvonne Rx titration (10u → 20u → 40u across 3 months)', () => {
    // Combine both medication lines as the patient portal would, in order:
    const month1 = parseMultiMonthDirections(MONTH_1_SIG)!;
    const months23 = parseMultiMonthDirections(MONTHS_2_AND_3_SIG)!;

    const fullSchedule = [...month1, ...months23];

    expect(fullSchedule).toHaveLength(3);
    expect(fullSchedule.map((s) => s.dose?.units)).toEqual(['10', '20', '40']);
    expect(fullSchedule.map((s) => s.dose?.mg)).toEqual(['0.25', '0.5', '1']);
    expect(fullSchedule.map((s) => s.weeks)).toEqual([4, 4, 4]);
  });
});
