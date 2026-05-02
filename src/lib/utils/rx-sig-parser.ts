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
  const n = (name || '').toLowerCase();
  return (
    n.includes('semaglutide') ||
    n.includes('tirzepatide') ||
    n.includes('testosterone') ||
    n.includes('sermorelin') ||
    n.includes('bpc') ||
    n.includes('tb-500')
  );
}

export function extractMlValue(...inputs: Array<string | null | undefined>): string | null {
  for (const input of inputs) {
    if (!input) continue;
    const m = input.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (m?.[1]) return m[1];
  }
  return null;
}
