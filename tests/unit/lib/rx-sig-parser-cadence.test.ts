/**
 * Patient portal multi-product injection schedule — cadence SIG parser
 * (Phase 1.5 of `feat/patient-portal-multi-injectable-schedule`).
 *
 * Background: The dosing schedule builder previously assumed every
 * injectable is dosed once weekly (`WEEKS_PER_MONTH = 4` and one
 * injection per week). For Elite Bundle add-ons (NAD+ "M-F", Sermorelin
 * "Monday through Friday at bedtime", B12 "once weekly", etc.) this
 * extrapolates wrong week counts. Q1 was answered "cadence varies —
 * read from SIG text only", so this parser extracts cadence from the
 * SIG and the schedule builder consumes it.
 *
 * Fixtures are drawn from real anonymized WellMedR SIGs captured by
 * `scripts/audit-multi-injectable-patients.ts` on 2026-05-04. PHI-safe
 * (SIG text only, no patient identifiers).
 *
 * Defensive default: when a SIG is unparseable, the parser returns
 * `cadence: 'unknown'`, `injectionsPerWeek: 1`, `cadenceWasInferred: true`.
 * The UI uses `cadenceWasInferred` to render a "Schedule per provider"
 * warning chip so clinical can spot-check unrecognized SIGs.
 */
import { describe, it, expect } from 'vitest';
import {
  parseCadenceFromDirections,
  type CadenceResult,
} from '@/lib/utils/rx-sig-parser';

function expectCadence(
  result: CadenceResult,
  expected: Partial<CadenceResult>
): void {
  for (const [key, value] of Object.entries(expected)) {
    expect(result[key as keyof CadenceResult], `field "${key}"`).toBe(value);
  }
}

describe('parseCadenceFromDirections — production SIGs from 2026-05-04 audit', () => {
  it('GLP-1 weekly: "once weekly for 4 weeks"', () => {
    const sig =
      'Inject 2.5 mg (0.25 mL) subcutaneously once weekly for 4 weeks to initiate therapy.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'weekly',
      injectionsPerWeek: 1,
      cadenceWasInferred: false,
    });
  });

  it('Sermorelin daily M-F: "Monday through Friday at bedtime"', () => {
    const sig =
      'Inject 25 units subcutaneously Monday through Friday at bedtime on an empty stomach.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'daily-mf',
      injectionsPerWeek: 5,
      cadenceWasInferred: false,
    });
  });

  it('B12 weekly variant: "once weekly for 8 weeks"', () => {
    const sig = '10 ml vial. Inject 50 units  once weekly for 8 weeks';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'weekly',
      injectionsPerWeek: 1,
      cadenceWasInferred: false,
    });
  });

  it('NAD+ multi-phase: "2-3 times per week" → conservative lower bound 2/week', () => {
    const sig =
      'Inject 0.25 mL (25 mg / 25 units) subcutaneously 2–3 times per week for 4 wks ' +
      'then go up to 0.5–1 mL (50–100 mg / 50–100 units) subcutaneously for the remaining of the treatment.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'twice-weekly',
      injectionsPerWeek: 2,
      cadenceWasInferred: false,
    });
  });

  it('Testosterone twice weekly: "twice weekly (e.g., Monday and Thursday)"', () => {
    const sig =
      'Inject 0.5 mL (50 units) subcutaneously twice weekly (e.g., Monday and Thursday).';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'twice-weekly',
      injectionsPerWeek: 2,
      cadenceWasInferred: false,
    });
  });
});

describe('parseCadenceFromDirections — canonical SIG variants from src/lib/medications.ts', () => {
  it('B12 canonical: "twice per week"', () => {
    const sig = 'Inject 50 units subcutaneously twice per week.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'twice-weekly',
      injectionsPerWeek: 2,
      cadenceWasInferred: false,
    });
  });

  it('Sermorelin canonical: "once daily before bedtime Monday-Friday"', () => {
    const sig =
      'Inject 20 units subcutaneously once daily before bedtime Monday-Friday.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'daily-mf',
      injectionsPerWeek: 5,
      cadenceWasInferred: false,
    });
  });

  it('Sermorelin nightly variant: "nightly at bedtime"', () => {
    const sig = 'Inject 0.3 mg (15 units) subcutaneously nightly at bedtime on an empty stomach.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'daily',
      injectionsPerWeek: 7,
      cadenceWasInferred: false,
    });
  });

  it('NAD+ canonical: "once daily for Monday-Friday"', () => {
    const sig =
      'Inject 40 units (40 mg) subcutaneously once daily for Monday-Friday.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'daily-mf',
      injectionsPerWeek: 5,
      cadenceWasInferred: false,
    });
  });
});

describe('parseCadenceFromDirections — additional cadence patterns', () => {
  it.each<[string, Partial<CadenceResult>]>([
    [
      'Inject every 2 weeks',
      { cadence: 'biweekly', injectionsPerWeek: 0.5, cadenceWasInferred: false },
    ],
    [
      'Inject biweekly',
      // The word "biweekly" is ambiguous (can mean 2×/week OR every 2 weeks).
      // We flag as inferred and pick the conservative every-2-weeks reading
      // ONLY when the number is missing — see also next test.
      {
        cadence: 'unknown',
        injectionsPerWeek: 1,
        cadenceWasInferred: true,
      },
    ],
    [
      'Inject 1 mL subcutaneously every other day',
      { cadence: 'every-other-day', injectionsPerWeek: 3.5, cadenceWasInferred: false },
    ],
    [
      'Inject 50 units 3 times per week',
      { cadence: 'thrice-weekly', injectionsPerWeek: 3, cadenceWasInferred: false },
    ],
    [
      'Inject 50 units three times a week',
      { cadence: 'thrice-weekly', injectionsPerWeek: 3, cadenceWasInferred: false },
    ],
    [
      'Inject 1 mL subcutaneously once monthly',
      { cadence: 'monthly', injectionsPerWeek: 0.25, cadenceWasInferred: false },
    ],
    [
      'Inject 0.25 mg once a week.',
      { cadence: 'weekly', injectionsPerWeek: 1, cadenceWasInferred: false },
    ],
  ])('SIG "%s" → matches expected cadence', (sig, expected) => {
    expectCadence(parseCadenceFromDirections(sig), expected);
  });
});

describe('parseCadenceFromDirections — defensive fallback', () => {
  it('returns "unknown" with cadenceWasInferred=true when SIG has no frequency clue', () => {
    const result = parseCadenceFromDirections('Apply topically as directed.');
    expectCadence(result, {
      cadence: 'unknown',
      injectionsPerWeek: 1,
      cadenceWasInferred: true,
    });
  });

  it('returns "unknown" for empty / null SIGs (no harm; UI shows warning chip)', () => {
    expectCadence(parseCadenceFromDirections(''), {
      cadence: 'unknown',
      cadenceWasInferred: true,
    });
    expectCadence(parseCadenceFromDirections(null as unknown as string), {
      cadence: 'unknown',
      cadenceWasInferred: true,
    });
  });

  it('"once weekly" wins over a stray "once daily" if the latter is in a non-cadence clause', () => {
    // Real-world SIGs sometimes append unrelated counsel ("Take vitamin daily as needed.").
    // The parser should anchor on the injection cadence verb, not stray "daily" mentions.
    const sig =
      'Inject 0.5 mg subcutaneously once weekly. Drink plenty of water daily as a side note.';
    expectCadence(parseCadenceFromDirections(sig), {
      cadence: 'weekly',
      injectionsPerWeek: 1,
      cadenceWasInferred: false,
    });
  });
});
