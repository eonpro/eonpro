/**
 * Patient portal multi-product injection schedule — per-family newest-Rx
 * builder (Phase 2 of `feat/patient-portal-multi-injectable-schedule`).
 *
 * Background: the original `buildDosingSchedule` had a "newest Rx wins
 * GLOBALLY" rule that fixed the Argentieri/Transtrum stale-dose bugs
 * but, as a side-effect, hid every other parallel-track injectable
 * whenever a GLP-1 refill landed.
 *
 * Production audit on 2026-05-04 confirmed 657 WellMedR patients today
 * have ≥2 injectable families across separate Orders, and 91 are
 * actively shadowed (their Sermorelin/NAD+/B12 schedule is suppressed
 * behind a newer GLP-1 Order).
 *
 * The new rule: "newest Rx wins PER FAMILY". Each `MedicationFamily`
 * (`glp1`, `nad_plus`, `sermorelin`, `b12`, `testosterone`, `bpc`,
 * `tb500`) picks its own newest Rx independently. The schedule is one
 * stacked timeline grouped by family.
 *
 * Argentieri/Transtrum regressions remain pinned in
 * `tests/unit/lib/build-dosing-schedule.test.ts` (single-family case is
 * unchanged).
 */
import { describe, it, expect } from 'vitest';
import {
  buildDosingSchedule,
  type DosingSchedulePrescription,
} from '@/lib/utils/buildDosingSchedule';

function rx(
  overrides: Partial<DosingSchedulePrescription> & {
    medications: DosingSchedulePrescription['medications'];
  }
): DosingSchedulePrescription {
  return {
    id: overrides.id ?? 1,
    status: overrides.status ?? 'active',
    prescribedDate: overrides.prescribedDate ?? '2026-04-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDosingSchedule — multi-family schedules (Elite Bundle)', () => {
  it('renders ALL families when GLP-1 + NAD+ + Sermorelin are on the SAME order', () => {
    const elite = rx({
      id: 900,
      prescribedDate: '2026-04-15T00:00:00.000Z',
      medications: [
        {
          id: 9001,
          name: 'Semaglutide 2.5mg/1ml',
          medicationKey: '203448971',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
        {
          id: 9002,
          name: 'NAD+ 100 mg/mL (10 mL)',
          medicationKey: '203194055',
          strength: '100 mg/mL',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Inject 40 units (40 mg) subcutaneously once daily for Monday-Friday.',
          daysSupply: 30,
        },
        {
          id: 9003,
          name: 'Sermorelin Acetate 5mg',
          medicationKey: '203666651',
          strength: '5mg',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Inject 25 units subcutaneously Monday through Friday at bedtime on an empty stomach.',
          daysSupply: 30,
        },
      ],
    });

    const { items } = buildDosingSchedule([elite]);

    const families = new Set(items.map((i) => i.family));
    expect(families.has('glp1')).toBe(true);
    expect(families.has('nad_plus')).toBe(true);
    expect(families.has('sermorelin')).toBe(true);
    // Item ordering: GLP-1 first, then add-ons alphabetical by family.
    const familyOrder = items.map((i) => i.family);
    const firstGlp1 = familyOrder.indexOf('glp1');
    const firstNad = familyOrder.indexOf('nad_plus');
    const firstSerm = familyOrder.indexOf('sermorelin');
    expect(firstGlp1).toBe(0);
    expect(firstGlp1).toBeLessThan(firstNad);
    expect(firstNad).toBeLessThan(firstSerm);
  });

  it('renders ALL families when prescribed on SEPARATE orders (the production bug cohort)', () => {
    // Real WellMedR pattern from the 2026-05-04 audit: full Elite Bundle
    // across 4 separate orders. Today's "newest globally" rule shows
    // only the GLP-1 schedule. The new rule must surface all four.
    const sermOrder = rx({
      id: 1001,
      prescribedDate: '2026-03-01T00:00:00.000Z',
      medications: [
        {
          id: 10001,
          name: 'Sermorelin Acetate 5mg',
          medicationKey: '203666651',
          strength: '5mg',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Inject 20 units subcutaneously once daily before bedtime Monday-Friday.',
          daysSupply: 30,
        },
      ],
    });
    const nadOrder = rx({
      id: 1002,
      prescribedDate: '2026-03-15T00:00:00.000Z',
      medications: [
        {
          id: 10002,
          name: 'NAD+ 100 mg/mL (10 mL)',
          medicationKey: '203194055',
          strength: '100 mg/mL',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Inject 40 units (40 mg) subcutaneously once daily for Monday-Friday.',
          daysSupply: 30,
        },
      ],
    });
    const b12Order = rx({
      id: 1003,
      prescribedDate: '2026-03-20T00:00:00.000Z',
      medications: [
        {
          id: 10003,
          name: 'Cyanocobalamin (B12)',
          medicationKey: '203449111',
          strength: '1000mcg/mL',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 50 units subcutaneously twice per week.',
          daysSupply: 30,
        },
      ],
    });
    const glp1Order = rx({
      id: 1004,
      prescribedDate: '2026-04-15T00:00:00.000Z',
      medications: [
        {
          id: 10004,
          name: 'Semaglutide 2.5mg/1ml',
          medicationKey: '203448971',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });

    const { items } = buildDosingSchedule([
      sermOrder,
      nadOrder,
      b12Order,
      glp1Order,
    ]);

    const families = new Set(items.map((i) => i.family));
    expect(families.has('glp1')).toBe(true);
    expect(families.has('sermorelin')).toBe(true);
    expect(families.has('nad_plus')).toBe(true);
    expect(families.has('b12')).toBe(true);

    // Each family must source from its own newest Rx (not the globally
    // newest GLP-1 order).
    const sermItems = items.filter((i) => i.family === 'sermorelin');
    const nadItems = items.filter((i) => i.family === 'nad_plus');
    const b12Items = items.filter((i) => i.family === 'b12');
    const glp1Items = items.filter((i) => i.family === 'glp1');
    expect(sermItems.every((i) => i.prescriptionId === 1001)).toBe(true);
    expect(nadItems.every((i) => i.prescriptionId === 1002)).toBe(true);
    expect(b12Items.every((i) => i.prescriptionId === 1003)).toBe(true);
    expect(glp1Items.every((i) => i.prescriptionId === 1004)).toBe(true);
  });

  it('within a family, the newest Rx still wins (Argentieri-style suppression preserved per family)', () => {
    // Two GLP-1 Rxs, the newer at a higher dose. The older one must NOT
    // contribute items, even though we now allow multi-family.
    const oldGlp1 = rx({
      id: 2001,
      prescribedDate: '2026-04-02T00:00:00.000Z',
      medications: [
        {
          id: 20001,
          name: 'Semaglutide 2.5mg/1ml',
          medicationKey: '203448971',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });
    const newGlp1 = rx({
      id: 2002,
      prescribedDate: '2026-05-02T00:00:00.000Z',
      medications: [
        {
          id: 20002,
          name: 'Semaglutide 2.5mg/1ml',
          medicationKey: '203448971',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.5 mg (20 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });
    const sermOrder = rx({
      id: 2003,
      prescribedDate: '2026-04-20T00:00:00.000Z',
      medications: [
        {
          id: 20003,
          name: 'Sermorelin Acetate 5mg',
          medicationKey: '203666651',
          strength: '5mg',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Inject 20 units subcutaneously once daily before bedtime Monday-Friday.',
          daysSupply: 30,
        },
      ],
    });

    const { items } = buildDosingSchedule([oldGlp1, newGlp1, sermOrder]);

    // Old GLP-1 (id=2001) must NOT contribute — newest-per-family rule.
    expect(items.every((i) => i.prescriptionId !== 2001)).toBe(true);
    // New GLP-1 (id=2002) and Sermorelin (id=2003) both render.
    expect(items.some((i) => i.prescriptionId === 2002)).toBe(true);
    expect(items.some((i) => i.prescriptionId === 2003)).toBe(true);
  });

  it('attaches cadence to every schedule item (downstream UI uses it)', () => {
    const elite = rx({
      id: 3000,
      prescribedDate: '2026-04-15T00:00:00.000Z',
      medications: [
        {
          id: 30001,
          name: 'Semaglutide 2.5mg/1ml',
          medicationKey: '203448971',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
        {
          id: 30002,
          name: 'NAD+ 100 mg/mL (10 mL)',
          medicationKey: '203194055',
          strength: '100 mg/mL',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Inject 40 units (40 mg) subcutaneously once daily for Monday-Friday.',
          daysSupply: 30,
        },
      ],
    });
    const { items } = buildDosingSchedule([elite]);
    const glp1 = items.find((i) => i.family === 'glp1');
    const nad = items.find((i) => i.family === 'nad_plus');
    expect(glp1?.cadence).toEqual(
      expect.objectContaining({
        cadence: 'weekly',
        injectionsPerWeek: 1,
        cadenceWasInferred: false,
      })
    );
    expect(nad?.cadence).toEqual(
      expect.objectContaining({
        cadence: 'daily-mf',
        injectionsPerWeek: 5,
        cadenceWasInferred: false,
      })
    );
  });

  it('flags cadence as inferred when SIG is unparseable', () => {
    const order = rx({
      id: 4000,
      prescribedDate: '2026-04-15T00:00:00.000Z',
      medications: [
        {
          id: 40001,
          name: 'NAD+ 100 mg/mL (10 mL)',
          medicationKey: '203194055',
          strength: '100 mg/mL',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'See provider for instructions.',
          daysSupply: 30,
        },
      ],
    });
    const { items } = buildDosingSchedule([order]);
    expect(items[0].cadence?.cadenceWasInferred).toBe(true);
  });

  it('per-family month numbering restarts at 1 for each family', () => {
    // GLP-1 has 3 months of titration (10u/20u/40u); Sermorelin has 1 flat month.
    // Each family must label months independently — Sermorelin shows "Month 1"
    // even though GLP-1 also has a "Month 1".
    const glp1 = rx({
      id: 5001,
      prescribedDate: '2026-03-21T00:00:00.000Z',
      medications: [
        {
          id: 50001,
          name: 'Semaglutide 1mL',
          medicationKey: '203448971',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Month 1: Inject 0.25 mg (0.1 mL / 10 units) subcutaneously once weekly for 4 weeks.',
          daysSupply: 28,
        },
        {
          id: 50002,
          name: 'Semaglutide 3mL',
          medicationKey: '203448971',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Month 2: Inject 0.5 mg (0.2 mL / 20 units) subcutaneously once weekly for 4 weeks. | ' +
            'Month 3: Inject 1 mg (0.4 mL / 40 units) subcutaneously once weekly for 4 weeks.',
          daysSupply: 56,
        },
      ],
    });
    const serm = rx({
      id: 5002,
      prescribedDate: '2026-03-21T00:00:00.000Z',
      medications: [
        {
          id: 50003,
          name: 'Sermorelin Acetate 5mg',
          medicationKey: '203666651',
          strength: '5mg',
          form: 'SOLUTION',
          quantity: '1',
          directions:
            'Inject 20 units subcutaneously once daily before bedtime Monday-Friday.',
          daysSupply: 30,
        },
      ],
    });
    const { items } = buildDosingSchedule([glp1, serm]);
    const glp1Months = items
      .filter((i) => i.family === 'glp1')
      .map((i) => i.monthNumber);
    const sermMonths = items
      .filter((i) => i.family === 'sermorelin')
      .map((i) => i.monthNumber);
    expect(glp1Months[0]).toBe(1);
    expect(sermMonths[0]).toBe(1); // Restarts, not continuing from GLP-1's 3.
  });
});
