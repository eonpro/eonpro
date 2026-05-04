/**
 * Patient portal "Your Dosing Schedule" builder.
 *
 * Produces a list of month-by-month dosing items (used by the medications
 * page, welcome kit, and any future onboarding surface) from a patient's
 * prescription history.
 *
 * # Rule: NEWEST RX WINS PER FAMILY
 *
 * The schedule groups injectable Rxs by `MedicationFamily` (`glp1`,
 * `sermorelin`, `nad_plus`, `b12`, `testosterone`, `bpc`, `tb500`).
 * Within each family, the most recent Order containing that family is
 * the entire source of truth for the family's segment of the schedule;
 * older Rxs in the same family are intentionally hidden so the
 * "CURRENT" badge always points at the dose the prescriber most
 * recently authorized for that medication.
 *
 * This is a refinement of the original "newest Rx wins GLOBALLY" rule
 * that was introduced to fix the Argentieri/Transtrum stale-dose bugs.
 * Globally-newest correctly hid superseded vials within one family but
 * also hid the entire schedules of parallel-track injectables (NAD+,
 * Sermorelin, B12) whenever a GLP-1 refill landed on a separate Order.
 *
 * Production audit on 2026-05-04 quantified the impact: 657 WellMedR
 * patients with multi-family Rxs across separate Orders, 91 actively
 * shadowed by their GLP-1. Per-family newest-wins fixes those without
 * regressing the within-family stale-dose suppression.
 *
 * # Cadence is SIG-driven
 *
 * Each family's coverage estimate (when the SIG has no explicit
 * `Month N:` annotation) uses `parseCadenceFromDirections` to read the
 * injection frequency directly from the SIG. There is no hardcoded
 * "weekly" assumption, so Sermorelin (M-F daily) and NAD+ (2–3×/week)
 * project the right number of weeks per vial.
 */
import {
  parseDoseFromDirections,
  parseMultiMonthDirections,
  parseCadenceFromDirections,
  isInjectableMedication,
  isSupplyMedication,
  extractMlValue,
  reformatDirectionsUnitsFirst,
  rewriteDirectionsForMonth,
  getMedicationDisplayName,
  getMedicationFamily,
  type CadenceResult,
  type MedicationFamily,
} from './rx-sig-parser';

const WEEKS_PER_MONTH = 4;
const DEFAULT_WEEKS_PER_MONTH_FALLBACK = 4;
const ML_TO_UNITS_DIVISOR = 100;

export interface DosingScheduleMedication {
  id: number;
  medicationKey?: string | null;
  name: string;
  strength?: string | null;
  form?: string | null;
  quantity?: string | null;
  directions: string | null;
  daysSupply: number;
}

export interface DosingSchedulePrescription {
  id: number;
  status: string;
  prescribedDate: string;
  medications: DosingScheduleMedication[];
}

export interface DosingScheduleItem {
  monthNumber: number;
  weekStart: number;
  weekEnd: number;
  prescriptionId: number;
  date: string;
  medName: string;
  /** Which clinical family this item belongs to. Always set. */
  family: MedicationFamily;
  /** Cadence parsed from the SIG; UI uses `cadenceWasInferred` for the warning chip. */
  cadence: CadenceResult;
  directions: string;
  dose: { mg: string; units: string } | null;
  isTitration: boolean;
  isSameDose: boolean;
  status: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface DosingSchedule {
  items: DosingScheduleItem[];
  /**
   * Backward-compatible source ID. Single-family schedules return the
   * newest Rx (matches legacy Argentieri/Transtrum behavior). Multi-
   * family schedules return the newest GLP-1 Rx if present, else the
   * newest Rx across all families. New callers should consult per-item
   * `prescriptionId` instead.
   */
  sourceRxId: number | null;
}

interface PerFamilyState {
  items: DosingScheduleItem[];
  monthNum: number;
  weekCursor: number;
  prevDoseKey: string;
  startDate: Date;
  order: DosingSchedulePrescription;
  family: MedicationFamily;
  cadence: CadenceResult;
}

function makePeriod(
  startDate: Date,
  weekStart: number,
  weekEnd: number
): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodStart = new Date(startDate);
  periodStart.setDate(periodStart.getDate() + (weekStart - 1) * 7);
  const periodEnd = new Date(startDate);
  periodEnd.setDate(periodEnd.getDate() + weekEnd * 7);
  return { periodStart, periodEnd };
}

function appendMultiMonthSegments(
  state: PerFamilyState,
  med: DosingScheduleMedication,
  segments: ReturnType<typeof parseMultiMonthDirections>
): void {
  if (!segments) return;
  const medName = getMedicationDisplayName(med);
  for (const seg of segments) {
    state.monthNum += 1;
    const weekStart = state.weekCursor;
    const weekEnd = state.weekCursor + seg.weeks - 1;
    const dose = seg.dose;
    const doseKey = dose ? `${dose.mg}-${dose.units}` : seg.segment;
    const isTitration = state.prevDoseKey !== '' && doseKey !== state.prevDoseKey;
    const isSameDose = state.prevDoseKey !== '' && doseKey === state.prevDoseKey;
    state.prevDoseKey = doseKey;

    const { periodStart, periodEnd } = makePeriod(state.startDate, weekStart, weekEnd);

    let displayDir = reformatDirectionsUnitsFirst(seg.segment);
    displayDir = displayDir.replace(/for\s+\d+\s+weeks?/i, `for ${seg.weeks} weeks`);
    displayDir = `Month ${state.monthNum}: ${displayDir}`;

    state.items.push({
      monthNumber: state.monthNum,
      weekStart,
      weekEnd,
      prescriptionId: state.order.id,
      date: state.order.prescribedDate,
      medName,
      family: state.family,
      cadence: state.cadence,
      directions: displayDir,
      dose,
      isTitration,
      isSameDose,
      status: state.order.status,
      periodStart,
      periodEnd,
    });
    state.weekCursor += seg.weeks;
  }
}

function estimateLegacyCoverageWeeks(
  med: DosingScheduleMedication,
  sig: string,
  cadence: CadenceResult
): number {
  const weeksFromDaysSupply = med.daysSupply > 0 ? Math.round(med.daysSupply / 7) : 0;
  let weeksFromVial = 0;
  const vialMl = extractMlValue(med.quantity, med.name, med.form);
  const parsed = parseDoseFromDirections(sig);
  if (vialMl && parsed?.units) {
    const mlPerInjection = parseFloat(parsed.units) / ML_TO_UNITS_DIVISOR;
    if (mlPerInjection > 0) {
      // Vial volume divided by (volume per injection × injections per week)
      // = number of calendar weeks the vial covers. Higher cadence (e.g.
      // M-F daily) consumes the vial faster than weekly cadence.
      const injectionsPerWeek = Math.max(0.25, cadence.injectionsPerWeek);
      const weeklyMl = mlPerInjection * injectionsPerWeek;
      weeksFromVial = Math.floor(parseFloat(vialMl) / weeklyMl);
    }
  }
  const weeks = Math.max(weeksFromDaysSupply, weeksFromVial);
  return weeks > 0 ? weeks : DEFAULT_WEEKS_PER_MONTH_FALLBACK;
}

function appendLegacyMonths(
  state: PerFamilyState,
  med: DosingScheduleMedication,
  sig: string
): void {
  const medName = getMedicationDisplayName(med);
  const weeks = estimateLegacyCoverageWeeks(med, sig, state.cadence);
  const monthsCovered = Math.max(1, Math.ceil(weeks / WEEKS_PER_MONTH));
  const dose = parseDoseFromDirections(sig);
  const doseKey = dose ? `${dose.mg}-${dose.units}` : sig;
  const baseIsTitration = state.prevDoseKey !== '' && doseKey !== state.prevDoseKey;
  const baseIsSameDose = state.prevDoseKey !== '' && doseKey === state.prevDoseKey;
  state.prevDoseKey = doseKey;

  for (let m = 0; m < monthsCovered; m += 1) {
    state.monthNum += 1;
    const mWeekStart = state.weekCursor + m * WEEKS_PER_MONTH;
    const mWeekEnd = Math.min(mWeekStart + WEEKS_PER_MONTH - 1, state.weekCursor + weeks - 1);
    const { periodStart, periodEnd } = makePeriod(state.startDate, mWeekStart, mWeekEnd);
    const monthDirections = rewriteDirectionsForMonth(
      sig,
      `Month ${state.monthNum}`,
      mWeekEnd - mWeekStart + 1
    );
    state.items.push({
      monthNumber: state.monthNum,
      weekStart: mWeekStart,
      weekEnd: mWeekEnd,
      prescriptionId: state.order.id,
      date: state.order.prescribedDate,
      medName,
      family: state.family,
      cadence: state.cadence,
      directions: monthDirections,
      dose,
      isTitration: m === 0 ? baseIsTitration : false,
      isSameDose: m === 0 ? baseIsSameDose : true,
      status: state.order.status,
      periodStart,
      periodEnd,
    });
  }
  state.weekCursor += weeks;
}

/**
 * Order in which families are stacked in the rendered schedule. GLP-1
 * goes first because it is the dominant treatment driver for WellMedR
 * patients. The remaining families are alphabetical for stability —
 * any change here will affect snapshot tests in the medications-page
 * fixture suite.
 */
const FAMILY_DISPLAY_ORDER: MedicationFamily[] = [
  'glp1',
  'b12',
  'bpc',
  'nad_plus',
  'sermorelin',
  'tb500',
  'testosterone',
  'other', // 'other' is filtered out before sort, but listed for completeness.
];

interface InjectableLine {
  med: DosingScheduleMedication;
  family: MedicationFamily;
  order: DosingSchedulePrescription;
}

/**
 * Builds the dosing schedule from the patient's prescription history.
 *
 * Algorithm:
 *   1. Flatten every injectable medication line across all orders, tag
 *      each line with its `MedicationFamily`.
 *   2. For each family, pick the line(s) on the newest Order that
 *      contains that family.
 *   3. Render each family's segment with its own cadence, month
 *      numbering, and titration tracking. Concatenate in
 *      `FAMILY_DISPLAY_ORDER`.
 */
export function buildDosingSchedule(
  prescriptions: DosingSchedulePrescription[]
): DosingSchedule {
  const injectableLines: InjectableLine[] = [];
  for (const order of prescriptions) {
    for (const med of order.medications ?? []) {
      if (!isInjectableMedication(med.name)) continue;
      if (isSupplyMedication(med.name)) continue;
      const family = getMedicationFamily({
        name: med.name,
        medicationKey: med.medicationKey ?? null,
      });
      if (family === 'other') continue;
      injectableLines.push({ med, family, order });
    }
  }

  if (injectableLines.length === 0) {
    return { items: [], sourceRxId: null };
  }

  // Group lines by family; pick the newest Order per family.
  const linesByFamily = new Map<MedicationFamily, InjectableLine[]>();
  for (const line of injectableLines) {
    const list = linesByFamily.get(line.family) ?? [];
    list.push(line);
    linesByFamily.set(line.family, list);
  }

  const allItems: DosingScheduleItem[] = [];
  let glp1NewestOrderId: number | null = null;
  let overallNewestOrderId: number | null = null;
  let overallNewestOrderAt = -Infinity;

  for (const family of FAMILY_DISPLAY_ORDER) {
    const lines = linesByFamily.get(family);
    if (!lines || lines.length === 0) continue;

    // Newest Order containing this family.
    const newestOrder = lines.reduce<InjectableLine['order'] | null>((acc, l) => {
      if (!acc) return l.order;
      return new Date(l.order.prescribedDate).getTime() >
        new Date(acc.prescribedDate).getTime()
        ? l.order
        : acc;
    }, null);
    if (!newestOrder) continue;

    if (
      new Date(newestOrder.prescribedDate).getTime() > overallNewestOrderAt
    ) {
      overallNewestOrderAt = new Date(newestOrder.prescribedDate).getTime();
      overallNewestOrderId = newestOrder.id;
    }
    if (family === 'glp1') {
      glp1NewestOrderId = newestOrder.id;
    }

    // Within the newest Order, render every line that belongs to this
    // family (some Orders bundle multiple titration lines for one med).
    const familyLinesOnNewest = lines.filter(
      (l) => l.order.id === newestOrder.id
    );

    // Pick the cadence from the first line's SIG. Multi-line same-family
    // Rxs (e.g. GLP-1 with separate Month 1 / Months 2-3 vials) typically
    // share one cadence — using the first line is the right default.
    const firstSig = familyLinesOnNewest[0]?.med.directions ?? '';
    const cadence = parseCadenceFromDirections(firstSig);

    const state: PerFamilyState = {
      items: [],
      monthNum: 0,
      weekCursor: 1,
      prevDoseKey: '',
      startDate: new Date(newestOrder.prescribedDate),
      order: newestOrder,
      family,
      cadence,
    };

    for (const { med } of familyLinesOnNewest) {
      const sig = med.directions ?? '';
      const multi = parseMultiMonthDirections(sig);
      if (multi && multi.length >= 1) {
        appendMultiMonthSegments(state, med, multi);
      } else {
        appendLegacyMonths(state, med, sig);
      }
    }

    allItems.push(...state.items);
  }

  return {
    items: allItems,
    sourceRxId: glp1NewestOrderId ?? overallNewestOrderId,
  };
}

/**
 * Returns the index of the schedule item that covers `now`, or -1 if none
 * does. `periodEnd` is treated as exclusive so that the boundary day
 * (e.g. day 28 between week 4 and week 5) belongs to the next month.
 */
export function getCurrentDoseIndex(items: DosingScheduleItem[], now: Date): number {
  return items.findIndex((it) => now >= it.periodStart && now < it.periodEnd);
}
