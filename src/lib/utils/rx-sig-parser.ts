/**
 * Shared SIG (directions) parsing utilities for GLP-1 medications.
 *
 * These helpers extract dose information from prescription SIG text
 * and are used across the patient portal (medications page, welcome kit,
 * dose calculators) to build dosing schedules.
 */

export function parseDoseFromDirections(directions: string): { mg: string; units: string } | null {
  if (!directions) return null;
  const match = directions.match(/inject\s+([\d.]+)\s*mg\s*\([^)]*?(\d+)\s*units?\)/i);
  if (match?.[1] && match?.[2]) return { mg: match[1], units: match[2] };
  const unitsWithMg = directions.match(/inject\s+(\d+)\s*units?\s*\(([\d.]+)\s*mg\)/i);
  if (unitsWithMg?.[1] && unitsWithMg?.[2]) return { mg: unitsWithMg[2], units: unitsWithMg[1] };
  const mgOnly = directions.match(/inject\s+([\d.]+)\s*mg/i);
  if (mgOnly?.[1]) return { mg: mgOnly[1], units: '' };
  const unitsOnly = directions.match(/inject\s+(\d+)\s*units?/i);
  if (unitsOnly?.[1]) return { mg: '', units: unitsOnly[1] };
  return null;
}

/**
 * Parse a SIG (directions) string that carries one or more explicit
 * `Month N:` annotations and return one segment per month. Returns null
 * when the SIG has no `Month N:` markers at all (legacy SIGs); callers
 * should fall back to vial-volume estimation in that case.
 *
 * Originally this required ≥2 month tags ("multi-month"), but per-line
 * OT packages (e.g. WellMedR Semaglutide A — 3 Month) emit a single
 * `Month N:` per medication line. Forcing those into the legacy
 * vial-volume estimator caused the patient portal to extrapolate fake
 * extra months at the same starting dose. We now honor any number of
 * explicit month tags ≥ 1 and only fall back when none are present.
 */
export function parseMultiMonthDirections(directions: string): Array<{
  monthNumber: number;
  segment: string;
  dose: { mg: string; units: string } | null;
  weeks: number;
}> | null {
  if (!directions) return null;

  const monthMatches = [...directions.matchAll(/Month\s+(\d+)\s*:/gi)];
  if (monthMatches.length < 1) return null;

  const uniqueMonths = new Map<number, { index: number; matchLength: number }>();
  for (const m of monthMatches) {
    const num = parseInt(m[1]);
    if (!uniqueMonths.has(num)) {
      uniqueMonths.set(num, { index: m.index!, matchLength: m[0].length });
    }
  }

  if (uniqueMonths.size < 1) return null;

  const sorted = [...uniqueMonths.entries()].sort((a, b) => a[1].index - b[1].index);
  const results: Array<{
    monthNumber: number;
    segment: string;
    dose: { mg: string; units: string } | null;
    weeks: number;
  }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const [monthNum, { index, matchLength }] = sorted[i];
    const contentStart = index + matchLength;
    const contentEnd = i < sorted.length - 1 ? sorted[i + 1][1].index : directions.length;

    let segment = directions.slice(contentStart, contentEnd).trim();
    segment = segment.replace(/\s*\|\s*$/, '').trim();
    segment = segment.replace(/^Month\s+\d+\s*:\s*/i, '').trim();

    const dose = parseDoseFromDirections(segment);
    const weeksMatch = segment.match(/for\s+(\d+)\s+weeks?/i);
    const weeks = weeksMatch ? parseInt(weeksMatch[1]) : 4;

    results.push({ monthNumber: monthNum, segment, dose, weeks });
  }

  return results;
}

export function isSupplyMedication(name: string): boolean {
  const n = (name || '').toLowerCase();
  return (
    n.includes('syringe') || n.includes('alcohol pad') || n.includes('needle') || n.includes('kit')
  );
}

export function isInjectableMedication(name: string): boolean {
  return getMedicationFamily({ name }) !== 'other';
}

/**
 * A stable identifier for a medication's clinical family. The patient
 * portal "Your Dosing Schedule" widget groups parallel injectable Rxs by
 * family so an Elite Bundle patient (Semaglutide + NAD+ + Sermorelin +
 * B12) sees one schedule per medication instead of having every add-on
 * shadowed by the newest GLP-1 refill.
 *
 * NOTE: `'other'` covers both non-injectables (oral pills, supplies,
 * supplements) AND injectables we have not yet enumerated. The patient
 * portal treats `'other'` as "render as a directions block, not a
 * dosing schedule" — adding a new injectable family requires a code
 * change here AND a fixture in `tests/unit/lib/build-dosing-schedule.test.ts`.
 */
export type MedicationFamily =
  | 'glp1'
  | 'sermorelin'
  | 'nad_plus'
  | 'b12'
  | 'testosterone'
  | 'bpc'
  | 'tb500'
  | 'other';

/**
 * Lifefile medication-key → family map. Source of truth: the canonical
 * SKU mappings in `src/lib/medications.ts` (MEDS registry) and
 * `src/lib/invoices/wellmedr-pricing.ts` (`ADDON_MEDICATION_KEY_TO_ADDON`).
 *
 * If you add a new SKU there, mirror it here. There is no runtime import
 * to keep this util dependency-light; the cross-file invariant is
 * pinned by `tests/unit/lib/rx-sig-parser-medication-family.test.ts`.
 */
const MEDICATION_KEY_TO_FAMILY: Record<string, MedicationFamily> = {
  // GLP-1 — Semaglutide and Tirzepatide SKUs in production today.
  '203448971': 'glp1',
  '203448974': 'glp1',
  '202851329': 'glp1',
  // Testosterone Cypionate
  '202851334': 'testosterone',
  // NAD+ (10mL and 5mL vial SKUs)
  '203194055': 'nad_plus',
  '204754029': 'nad_plus',
  // Sermorelin
  '203666651': 'sermorelin',
  '203418853': 'sermorelin',
  // Cyanocobalamin (B12) — injectable
  '203449111': 'b12',
};

/**
 * Cadence (frequency) of an injectable medication, parsed from its SIG.
 *
 *  - `weekly`         once per week
 *  - `twice-weekly`   2× per week (also covers "2–3 times per week" lower bound)
 *  - `thrice-weekly`  3× per week
 *  - `daily`          7× per week (every day / nightly)
 *  - `daily-mf`       5× per week (Monday through Friday at bedtime, etc.)
 *  - `every-other-day` 3.5× per week (treated as 3.5 for week-coverage math)
 *  - `biweekly`       0.5× per week (every 2 weeks)
 *  - `monthly`        ~0.25× per week
 *  - `unknown`        SIG has no recognizable frequency phrase. Defaults to
 *                     1×/week so the schedule still renders, but the UI
 *                     shows a "Schedule per provider" warning chip.
 */
export type Cadence =
  | 'weekly'
  | 'twice-weekly'
  | 'thrice-weekly'
  | 'daily'
  | 'daily-mf'
  | 'every-other-day'
  | 'biweekly'
  | 'monthly'
  | 'unknown';

export interface CadenceResult {
  cadence: Cadence;
  injectionsPerWeek: number;
  cadenceWasInferred: boolean;
}

const CADENCE_DEFAULT: CadenceResult = {
  cadence: 'unknown',
  injectionsPerWeek: 1,
  cadenceWasInferred: true,
};

/**
 * Extract the injection cadence from a free-text SIG.
 *
 * Order of pattern checks matters: more-specific phrases ("Monday through
 * Friday") must run before less-specific ones ("once daily") because real
 * SIGs combine them ("once daily Monday-Friday at bedtime").
 *
 * The returned `injectionsPerWeek` is the number we need for week-coverage
 * arithmetic in `buildDosingSchedule`. `cadenceWasInferred = true` means
 * the parser fell through to the safe default and the UI should mark the
 * schedule "Schedule per provider" so clinical can verify.
 */
export function parseCadenceFromDirections(directions: string): CadenceResult {
  if (!directions) return { ...CADENCE_DEFAULT };
  const s = directions.toLowerCase();

  // Monday-Friday family. Five injections per week. Match BEFORE plain
  // daily because real SIGs are "once daily Monday-Friday".
  if (
    /\bmon(?:day)?\s*(?:through|to|–|-)\s*fri(?:day)?\b/.test(s) ||
    /\bm[-–\s]*f\b/.test(s) ||
    /\b5\s*of\s*7\b/.test(s)
  ) {
    return {
      cadence: 'daily-mf',
      injectionsPerWeek: 5,
      cadenceWasInferred: false,
    };
  }

  // Every-other-day / q.o.d. — match before plain "every day".
  if (
    /\bevery\s+other\s+day\b/.test(s) ||
    /\bq\s*\.?\s*o\s*\.?\s*d\b/.test(s) ||
    /\beod\b/.test(s)
  ) {
    return {
      cadence: 'every-other-day',
      injectionsPerWeek: 3.5,
      cadenceWasInferred: false,
    };
  }

  // Every N weeks — must run before "weekly" (matches a longer phrase).
  // Numeric form covers "2", "two", "3", "three", "4".
  const everyN = s.match(
    /\bevery\s+(\d+|two|three|four)\s+weeks?\b/
  );
  if (everyN) {
    const wordToNum: Record<string, number> = { two: 2, three: 3, four: 4 };
    const n = Number(everyN[1]) || wordToNum[everyN[1]] || 2;
    return {
      cadence: n === 2 ? 'biweekly' : 'monthly',
      injectionsPerWeek: 1 / n,
      cadenceWasInferred: false,
    };
  }

  // Numeric "N times per week" / "N times a week" / "N×/week" — match
  // before plain "weekly". Range "2-3 times per week" → take lower bound
  // (clinically conservative; under-projecting weeks is safer than
  // over-projecting and saying the patient ran out early).
  const timesPerWeek = s.match(
    /\b(\d+)\s*(?:[-–to]+\s*\d+\s*)?(?:times?|x|×)\s*(?:per|a|\/)\s*week\b/
  );
  if (timesPerWeek) {
    const n = Number(timesPerWeek[1]);
    if (n === 1) {
      return { cadence: 'weekly', injectionsPerWeek: 1, cadenceWasInferred: false };
    }
    if (n === 2) {
      return {
        cadence: 'twice-weekly',
        injectionsPerWeek: 2,
        cadenceWasInferred: false,
      };
    }
    if (n === 3) {
      return {
        cadence: 'thrice-weekly',
        injectionsPerWeek: 3,
        cadenceWasInferred: false,
      };
    }
    if (n >= 4 && n <= 7) {
      // Treat as daily-equivalent — calendar week with N injections.
      return {
        cadence: n === 7 ? 'daily' : 'daily-mf',
        injectionsPerWeek: n,
        cadenceWasInferred: false,
      };
    }
  }

  // Word forms: "twice weekly", "twice per week", "three times a week"
  if (/\btwice\s*(?:per\s+week|a\s+week|weekly|\/\s*week)\b/.test(s)) {
    return {
      cadence: 'twice-weekly',
      injectionsPerWeek: 2,
      cadenceWasInferred: false,
    };
  }
  if (
    /\b(?:thrice|three\s+times)\s*(?:per\s+week|a\s+week|weekly|\/\s*week)\b/.test(s)
  ) {
    return {
      cadence: 'thrice-weekly',
      injectionsPerWeek: 3,
      cadenceWasInferred: false,
    };
  }

  // "2–3 times per week" / "2-3 times per week" / "2 to 3 times per week"
  // (the regex above only catches the leading number; this catches the
  // explicit range phrasing for safety). Conservative lower bound.
  const range = s.match(
    /\b(\d+)\s*(?:[-–]|\s+to\s+)\s*\d+\s*(?:times?|x|×)\s*(?:per|a|\/)\s*week\b/
  );
  if (range) {
    const lower = Number(range[1]);
    if (lower === 2) {
      return {
        cadence: 'twice-weekly',
        injectionsPerWeek: 2,
        cadenceWasInferred: false,
      };
    }
    if (lower === 3) {
      return {
        cadence: 'thrice-weekly',
        injectionsPerWeek: 3,
        cadenceWasInferred: false,
      };
    }
  }

  // Monthly cadences
  if (/\b(?:once|every)\s+monthly\b/.test(s) || /\bonce\s+a\s+month\b/.test(s)) {
    return {
      cadence: 'monthly',
      injectionsPerWeek: 0.25,
      cadenceWasInferred: false,
    };
  }

  // Once weekly / once a week / weekly (plain). Anchor on "weekly" near
  // "once" or as a standalone frequency clause.
  if (/\bonce\s+(?:weekly|a\s+week|per\s+week)\b/.test(s) || /\bweekly\b/.test(s)) {
    return { cadence: 'weekly', injectionsPerWeek: 1, cadenceWasInferred: false };
  }

  // Daily / nightly / every day / every night. Must come AFTER the
  // Mon-Fri and every-other-day checks above.
  if (
    /\b(?:once|every)\s+(?:daily|day|night|morning|evening)\b/.test(s) ||
    /\bnightly\b/.test(s) ||
    /\bdaily\b/.test(s) ||
    /\bq\s*\.?\s*d\b/.test(s)
  ) {
    return { cadence: 'daily', injectionsPerWeek: 7, cadenceWasInferred: false };
  }

  // "biweekly" alone is ambiguous (English uses it for both 2×/week AND
  // every-2-weeks). Don't guess. Return unknown + flag.
  return { ...CADENCE_DEFAULT };
}

export function getMedicationFamily(med: {
  name?: string | null;
  medicationKey?: string | null;
}): MedicationFamily {
  const key = (med.medicationKey ?? '').trim();
  if (key && MEDICATION_KEY_TO_FAMILY[key]) {
    return MEDICATION_KEY_TO_FAMILY[key];
  }

  const n = (med.name ?? '').toLowerCase();
  if (!n) return 'other';

  if (n.includes('semaglutide') || n.includes('tirzepatide')) return 'glp1';
  if (n.includes('sermorelin')) return 'sermorelin';
  if (n.includes('testosterone')) return 'testosterone';

  // NAD+ — the trailing '+' (or the word "NAD" with no oral-supplement
  // disambiguator) is the brand. Real Rxs always include "NAD+" or
  // "NAD Plus"; oral NAD precursors (NMN, NR, niacinamide) use
  // different chemical names that do not contain "nad ".
  if (n.includes('nad+') || /\bnad\s+plus\b/.test(n) || /\bnad\s+\d/.test(n)) {
    return 'nad_plus';
  }

  // B12 — only when the form is clearly injectable. Oral / sublingual
  // B12 supplements (tablets, lozenges) must NOT enter the dosing
  // schedule. The pharmacy injectable always uses the chemical name
  // "Cyanocobalamin"; substring "b12" by itself is too generic.
  if (n.includes('cyanocobalamin')) return 'b12';
  if (
    /\bb-?12\b/.test(n) &&
    /(injection|injectable|sub\s*q|subcutaneous|intramuscular|im\b)/.test(n)
  ) {
    return 'b12';
  }

  // Peptides — TB-500 substring is hyphen-anchored to avoid catching
  // "tribulus", "tablet", etc. BPC-157 is the only BPC peptide in
  // production; all real Rxs spell it with the hyphen.
  if (/\btb-?500\b/.test(n)) return 'tb500';
  if (/\bbpc(?:-?\d+)?\b/.test(n)) return 'bpc';

  return 'other';
}

export function extractMlValue(...inputs: Array<string | null | undefined>): string | null {
  for (const input of inputs) {
    if (!input) continue;
    const m = input.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function extractMgValue(...inputs: Array<string | null | undefined>): string | null {
  for (const input of inputs) {
    if (!input) continue;
    const m = input.match(/(\d+(?:\.\d+)?)\s*mg/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Rewrites SIG strings that put `mg` before `units` (the prescriber-facing
 * format) into a units-first display string for the patient portal, e.g.
 * "Inject 0.25 mg (10 units)" -> "Inject 10 units (0.25 mg)". Other parts
 * of the SIG are left untouched.
 */
export function reformatDirectionsUnitsFirst(directions: string): string {
  if (!directions) return directions;
  return directions.replace(
    /inject\s+([\d.]+)\s*mg\s*\([^)]*?(\d+)\s*units?\)/gi,
    (_, mg, units) => `Inject ${units} units (${mg} mg)`
  );
}

/**
 * Rewrites a legacy SIG (no `Month N:` annotation) so the patient portal
 * can label which month-of-treatment a given period covers. Used by the
 * vial-volume fallback when a medication line has no explicit month tags.
 */
export function rewriteDirectionsForMonth(
  directions: string,
  monthLabel: string,
  weeksInMonth: number
): string {
  let d = reformatDirectionsUnitsFirst(directions);
  d = d.replace(/month\s+\d+(?:\s*[-–]\s*\d+)?:/i, `${monthLabel}:`);
  d = d.replace(/for\s+\d+\s+weeks/i, `for ${weeksInMonth} weeks`);
  return d;
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Renders a medication's display name for the patient portal. Specifically
 * normalizes Semaglutide (the most common GLP-1) into "Semaglutide {mg}mg/1ml
 * ({vialMl}ml)" so patients see consistent labels across the medications,
 * welcome-kit, and dose-calculator pages.
 */
export function getMedicationDisplayName(med: {
  name?: string | null;
  strength?: string | null;
  form?: string | null;
  quantity?: string | null;
}): string {
  const medName = med.name || 'Medication';
  if (medName.toLowerCase().includes('semaglutide')) {
    const mg = extractMgValue(med.strength, medName);
    const vialMl = extractMlValue(med.quantity, medName, med.form);
    if (mg && vialMl) return `Semaglutide ${mg}mg/1ml (${vialMl}ml)`;
    if (mg) return `Semaglutide ${mg}mg/1ml`;
    if (vialMl) return `Semaglutide (${vialMl}ml)`;
    return 'Semaglutide';
  }

  const cleanedName = medName
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+solution\s+\d+mg\/\d+mg\/ml/i, '');
  const normalizedName = toTitleCase(cleanedName);
  const normalizedStrength = med.strength ? med.strength.toLowerCase().trim() : '';
  if (!normalizedStrength || normalizedStrength.startsWith('solution')) {
    return normalizedName;
  }
  return `${normalizedName} ${normalizedStrength}`;
}
