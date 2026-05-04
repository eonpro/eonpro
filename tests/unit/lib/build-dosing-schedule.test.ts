/**
 * Patient portal "Your Dosing Schedule" — pins the "newest Rx wins
 * globally" rule that drives the schedule widget on the medications page
 * and welcome kit.
 *
 * Two real-world bugs motivate this test file:
 *
 *  - Jennifer Argentieri (WEL-78965020): two 1mL semaglutide vials
 *    prescribed a month apart at increasing doses. Legacy code stacked
 *    them sequentially using a vial-volume estimator, so her "CURRENT"
 *    month (May) still showed the OLD dose from the April vial.
 *
 *  - Josh Transtrum (WEL-78934042): one Rx with three medication lines
 *    using explicit `Month N:` SIG annotations (10u → 20u → 40u
 *    titration). The schedule must render the prescribed titration
 *    exactly, not extrapolate fake duplicate months.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDosingSchedule,
  getCurrentDoseIndex,
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

describe('buildDosingSchedule — newest Rx wins globally', () => {
  it('Jennifer regression: a refill at a higher dose supersedes the previous Rx', () => {
    // Apr 2: 1mL vial @ 0.25mg / 10u once weekly. No `Month N:` tag.
    const apr2 = rx({
      id: 101,
      prescribedDate: '2026-04-02T00:00:00.000Z',
      medications: [
        {
          id: 1001,
          name: 'SEMAGLUTIDE/GLYCINE 2.5/20MG/ML (1ML VIAL) SOLUTION',
          strength: '2.5MG/20MG/ML',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });
    // May 2 (the new refill): 1mL vial @ 0.5mg / 20u once weekly.
    const may2 = rx({
      id: 102,
      prescribedDate: '2026-05-02T00:00:00.000Z',
      medications: [
        {
          id: 1002,
          name: 'SEMAGLUTIDE/GLYCINE 2.5/20MG/ML (1ML VIAL) SOLUTION',
          strength: '2.5MG/20MG/ML',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.5 mg (20 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });

    const { items, sourceRxId } = buildDosingSchedule([apr2, may2]);

    expect(sourceRxId).toBe(102);
    // The Apr 2 Rx must NOT contribute any items.
    expect(items.every((i) => i.prescriptionId === 102)).toBe(true);
    // First displayed month must be the new dose, not 10u.
    expect(items[0].monthNumber).toBe(1);
    expect(items[0].dose).toEqual({ mg: '0.5', units: '20' });
    expect(items[0].date).toBe('2026-05-02T00:00:00.000Z');
  });

  it('Josh regression: a single Rx with per-line `Month N:` titration renders exactly 3 months', () => {
    const month1Sig =
      'Month 1: Inject 0.25 mg (0.1 mL / 10 units) subcutaneously once weekly for 4 weeks. ' +
      'Rotate injection sites. Keep refrigerated.';
    const months2And3Sig =
      'Month 2: Inject 0.5 mg (0.2 mL / 20 units) subcutaneously once weekly for 4 weeks. | ' +
      'Month 3: Month 3: Inject 1 mg (0.4 mL / 40 units) subcutaneously once weekly for 4 weeks. ' +
      'Rotate injection sites. Keep refrigerated.';

    const order = rx({
      id: 555,
      prescribedDate: '2026-03-21T00:00:00.000Z',
      medications: [
        {
          id: 5001,
          name: 'SEMAGLUTIDE/GLYCINE 2.5/20MG/ML (1ML VIAL) SOLUTION',
          strength: '2.5MG/20MG/ML',
          form: 'SOLUTION',
          quantity: '1',
          directions: month1Sig,
          daysSupply: 28,
        },
        {
          id: 5002,
          name: 'SEMAGLUTIDE/GLYCINE 2.5/20MG/ML (3ML VIAL) SOLUTION',
          strength: '2.5MG/20MG/ML',
          form: 'SOLUTION',
          quantity: '1',
          directions: months2And3Sig,
          daysSupply: 56,
        },
        {
          id: 5003,
          name: 'Syringes/Alcohol Pads (Kit of #10)',
          strength: '',
          form: '',
          quantity: '2',
          directions: 'Use supplies as directed for subcutaneous injection.',
          daysSupply: 0,
        },
      ],
    });

    const { items, sourceRxId } = buildDosingSchedule([order]);

    expect(sourceRxId).toBe(555);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.dose?.units)).toEqual(['10', '20', '40']);
    expect(items.map((i) => i.dose?.mg)).toEqual(['0.25', '0.5', '1']);
    expect(items.map((i) => i.monthNumber)).toEqual([1, 2, 3]);
    expect(items.map((i) => i.isTitration)).toEqual([false, true, true]);
    // Each titration step gets its own 4-week window.
    expect(items.map((i) => [i.weekStart, i.weekEnd])).toEqual([
      [1, 4],
      [5, 8],
      [9, 12],
    ]);
  });

  it('legacy single Rx without `Month N:` tags expands to multiple same-dose months from vial volume', () => {
    const order = rx({
      id: 200,
      prescribedDate: '2026-04-02T00:00:00.000Z',
      medications: [
        {
          id: 2001,
          name: 'Semaglutide 2.5mg/1ml',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.5 mg (20 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });
    // 1mL / (20u/100) = 5 weeks of coverage, which rounds up to 2 months.
    const { items } = buildDosingSchedule([order]);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].dose).toEqual({ mg: '0.5', units: '20' });
    expect(items[1].dose).toEqual({ mg: '0.5', units: '20' });
    expect(items[0].isSameDose).toBe(false);
    expect(items[1].isSameDose).toBe(true);
  });

  it('returns empty schedule when no prescriptions contain injectables', () => {
    const { items, sourceRxId } = buildDosingSchedule([]);
    expect(items).toEqual([]);
    expect(sourceRxId).toBeNull();
  });

  it('skips supply-only orders and falls back to the most recent injectable order', () => {
    const supplyOnly = rx({
      id: 700,
      prescribedDate: '2026-05-15T00:00:00.000Z',
      medications: [
        {
          id: 7001,
          name: 'Syringes/Alcohol Pads (Kit of #10)',
          strength: '',
          form: '',
          quantity: '1',
          directions: 'Use as directed.',
          daysSupply: 0,
        },
      ],
    });
    const realRx = rx({
      id: 701,
      prescribedDate: '2026-05-01T00:00:00.000Z',
      medications: [
        {
          id: 7002,
          name: 'Semaglutide 2.5mg/1ml',
          strength: '2.5mg/ml',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });
    const { sourceRxId, items } = buildDosingSchedule([supplyOnly, realRx]);
    expect(sourceRxId).toBe(701);
    expect(items[0].dose).toEqual({ mg: '0.25', units: '10' });
  });

  it('also skips supply-only orders even when they are newer than the injectable order', () => {
    // A "Syringes/Alcohol Pads" Rx that arrives AFTER the GLP-1 Rx must
    // not become the schedule source — patients would see an empty or
    // bogus schedule. The injectable order remains the source of truth.
    const oldInjectable = rx({
      id: 800,
      prescribedDate: '2026-03-01T00:00:00.000Z',
      medications: [
        {
          id: 8001,
          name: 'Semaglutide 2.5mg/1ml',
          strength: '',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.5 mg (20 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });
    const newerSupplyOnly = rx({
      id: 801,
      prescribedDate: '2026-04-30T00:00:00.000Z',
      medications: [
        {
          id: 8002,
          name: 'Syringes/Alcohol Pads (Kit of #10)',
          strength: '',
          form: '',
          quantity: '1',
          directions: 'Use as directed.',
          daysSupply: 0,
        },
      ],
    });
    const { sourceRxId } = buildDosingSchedule([oldInjectable, newerSupplyOnly]);
    expect(sourceRxId).toBe(800);
  });
});

describe('buildDosingSchedule + getCurrentDoseIndex — user-visible "CURRENT" row', () => {
  // This test mirrors what the medications page renders for the CURRENT
  // row: the dose-units label, the parenthesized mg label, and the
  // medication display name. It pins the bug the user reported in
  // production where the CURRENT row showed the OLD prescription's dose
  // ("Inject weekly: 10 UNITS (0.25 mg)") despite a fresh refill at a
  // higher dose.
  it("Jennifer's CURRENT row reflects the May 2 refill, not the April 2 vial", () => {
    const apr2 = rx({
      id: 101,
      prescribedDate: '2026-04-02T00:00:00.000Z',
      medications: [
        {
          id: 1001,
          name: 'SEMAGLUTIDE/GLYCINE 2.5/20MG/ML (1ML VIAL) SOLUTION',
          strength: '2.5MG/20MG/ML',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });
    const may2 = rx({
      id: 102,
      prescribedDate: '2026-05-02T00:00:00.000Z',
      medications: [
        {
          id: 1002,
          name: 'SEMAGLUTIDE/GLYCINE 2.5/20MG/ML (1ML VIAL) SOLUTION',
          strength: '2.5MG/20MG/ML',
          form: 'SOLUTION',
          quantity: '1',
          directions: 'Inject 0.5 mg (20 units) subcutaneously once weekly.',
          daysSupply: 28,
        },
      ],
    });

    const { items } = buildDosingSchedule([apr2, may2]);
    // Pretend "today" is May 3 — one day into the new refill. This is
    // the exact moment Jennifer reported the bug: she expected the
    // current row to show her new 20u/0.5mg dose.
    const now = new Date('2026-05-03T12:00:00.000Z');
    const idx = getCurrentDoseIndex(items, now);
    expect(idx).toBeGreaterThanOrEqual(0);

    const current = items[idx];
    // Labels the page renders verbatim: "{units} units" and "({mg} mg)".
    expect(current.dose).toEqual({ mg: '0.5', units: '20' });
    expect(`${current.dose?.units} units`).toBe('20 units');
    expect(`(${current.dose?.mg} mg)`).toBe('(0.5 mg)');
    expect(current.medName).toContain('Semaglutide');
    expect(current.medName).toContain('1ml');
  });
});

describe('getCurrentDoseIndex', () => {
  // Build a deterministic 3-month schedule anchored to a known date so the
  // boundary math is easy to read.
  const month1Sig =
    'Month 1: Inject 0.25 mg (0.1 mL / 10 units) subcutaneously once weekly for 4 weeks.';
  const months2And3Sig =
    'Month 2: Inject 0.5 mg (0.2 mL / 20 units) subcutaneously once weekly for 4 weeks. | ' +
    'Month 3: Inject 1 mg (0.4 mL / 40 units) subcutaneously once weekly for 4 weeks.';
  const schedule = buildDosingSchedule([
    {
      id: 1,
      status: 'active',
      prescribedDate: '2026-03-21T00:00:00.000Z',
      medications: [
        {
          id: 1,
          name: 'SEMAGLUTIDE 2.5MG/ML (1ML VIAL)',
          strength: '',
          form: '',
          quantity: '1',
          directions: month1Sig,
          daysSupply: 28,
        },
        {
          id: 2,
          name: 'SEMAGLUTIDE 2.5MG/ML (3ML VIAL)',
          strength: '',
          form: '',
          quantity: '1',
          directions: months2And3Sig,
          daysSupply: 56,
        },
      ],
    },
  ]);

  it('returns -1 before the schedule starts', () => {
    expect(getCurrentDoseIndex(schedule.items, new Date('2026-03-20T00:00:00.000Z'))).toBe(-1);
  });

  it('returns the first month for week 1', () => {
    expect(getCurrentDoseIndex(schedule.items, new Date('2026-03-21T12:00:00.000Z'))).toBe(0);
  });

  it('treats the week-4 boundary as the start of Month 2 (periodEnd is exclusive)', () => {
    // Day 28 (4 weeks * 7 days) after Mar 21 is Apr 18 — the start of Month 2.
    expect(getCurrentDoseIndex(schedule.items, new Date('2026-04-18T00:00:00.000Z'))).toBe(1);
  });

  it('returns -1 once the schedule has ended', () => {
    expect(getCurrentDoseIndex(schedule.items, new Date('2027-01-01T00:00:00.000Z'))).toBe(-1);
  });
});
