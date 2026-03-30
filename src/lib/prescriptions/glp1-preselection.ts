/**
 * GLP-1 Pre-selection Logic for Prescription Queue
 *
 * Determines the correct medication, dose, and order set to pre-select based on:
 * - Medication type (semaglutide vs tirzepatide)
 * - Patient's GLP-1 history (previous dose in mg)
 * - Payment plan duration (1-month vs 3/6/12-month)
 *
 * 1-month plans: pre-select individual medication + sig
 * Multi-month plans: auto-apply named order set (must have >1 vial)
 * 1-month safeguard: only 1 vial allowed
 */

// ─── Product IDs ───────────────────────────────────────────────────────────────

const SEMA_1ML = '203448971';       // Semaglutide 2.5mg/mL, 1 mL vial
const SEMA_2ML = '203448947';       // Semaglutide 2.5mg/mL, 2 mL vial
const SEMA_3ML = '203449363';       // Semaglutide 2.5mg/mL, 3 mL vial
const SEMA_5MG_2ML = '202851329';   // Semaglutide 5mg/mL, 2 mL vial

const TIRZ_1ML = '203448972';       // Tirzepatide 10mg/mL, 1 mL vial
const TIRZ_2ML = '203448973';       // Tirzepatide 10mg/mL, 2 mL vial
const TIRZ_3ML = '203449364';       // Tirzepatide 10mg/mL, 3 mL vial
const TIRZ_4ML = '203449500';       // Tirzepatide 10mg/mL, 4 mL vial
const TIRZ_30MG_2ML = '203418602';  // Tirzepatide 30mg/mL, 2 mL vial

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OneMonthPreselection {
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply: string;
}

export interface MultiMonthPreselection {
  orderSetName: string;
}

export interface GLP1PreselectionResult {
  oneMonth: OneMonthPreselection;
  multiMonth: MultiMonthPreselection;
}

// ─── Dose Tier Definitions ─────────────────────────────────────────────────────

interface DoseTier {
  previousDose: number;
  oneMonth: OneMonthPreselection;
  orderSetName: string;
}

const SEMAGLUTIDE_TIERS: DoseTier[] = [
  {
    previousDose: 0,
    oneMonth: {
      medicationKey: SEMA_1ML,
      sig: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Semaglutide A- 3 Month',
  },
  {
    previousDose: 0.25,
    oneMonth: {
      medicationKey: SEMA_1ML,
      sig: 'Inject 0.5 mg (20 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Semaglutide B - 3 Month',
  },
  {
    previousDose: 0.5,
    oneMonth: {
      medicationKey: SEMA_2ML,
      sig: 'Inject 1 mg (40 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Semaglutide C - 3 Month',
  },
  {
    previousDose: 1,
    oneMonth: {
      medicationKey: SEMA_3ML,
      sig: 'Inject 1.7 mg (68 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Semaglutide C - 3 Month',
  },
  {
    previousDose: 1.7,
    oneMonth: {
      medicationKey: SEMA_5MG_2ML,
      sig: 'Inject 2.4 mg (48 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Semaglutide D - 3 Month',
  },
  {
    previousDose: 2.4,
    oneMonth: {
      medicationKey: SEMA_5MG_2ML,
      sig: 'Inject 2.4 mg (48 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Semaglutide D - 3 Month',
  },
];

const TIRZEPATIDE_TIERS: DoseTier[] = [
  {
    previousDose: 0,
    oneMonth: {
      medicationKey: TIRZ_1ML,
      sig: 'Inject 2.5 mg (25 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Tirzepatide A- 3 Month',
  },
  {
    previousDose: 2.5,
    oneMonth: {
      medicationKey: TIRZ_2ML,
      sig: 'Inject 5 mg (50 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Tirzepatide B- 3 Month',
  },
  {
    previousDose: 5,
    oneMonth: {
      medicationKey: TIRZ_3ML,
      sig: 'Inject 7.5 mg (75 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Tirzepatide D- 3 Month',
  },
  {
    previousDose: 7.5,
    oneMonth: {
      medicationKey: TIRZ_4ML,
      sig: 'Inject 10 mg (100 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Tirzepatide D2- 3 Month',
  },
  {
    previousDose: 10,
    oneMonth: {
      medicationKey: TIRZ_30MG_2ML,
      sig: 'Inject 12.5 mg (42 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Tirzepatide E- 3 Month',
  },
  {
    previousDose: 12.5,
    oneMonth: {
      medicationKey: TIRZ_30MG_2ML,
      sig: 'Inject 15 mg (50 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Tirzepatide E- 3 Month',
  },
  {
    previousDose: 15,
    oneMonth: {
      medicationKey: TIRZ_30MG_2ML,
      sig: 'Inject 15 mg (50 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Tirzepatide E- 3 Month',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseLastDose(lastDose: string | null): number {
  if (!lastDose) return 0;
  const cleaned = lastDose.replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function findDoseTier(tiers: DoseTier[], previousDose: number): DoseTier {
  const exact = tiers.find((t) => t.previousDose === previousDose);
  if (exact) return exact;

  // Nearest lower tier (conservative: don't jump to a higher dose)
  const sorted = [...tiers].sort((a, b) => b.previousDose - a.previousDose);
  for (const tier of sorted) {
    if (tier.previousDose <= previousDose) {
      return tier;
    }
  }

  return tiers[0];
}

function classifyMedString(text: string): 'semaglutide' | 'tirzepatide' | null {
  const lower = text.toLowerCase();
  if (lower.includes('tirzepatide') || lower.includes('mounjaro') || lower.includes('zepbound')) {
    return 'tirzepatide';
  }
  if (lower.includes('semaglutide') || lower.includes('ozempic') || lower.includes('wegovy')) {
    return 'semaglutide';
  }
  return null;
}

function identifyMedication(
  treatment: string,
  glp1Type: string | null
): 'semaglutide' | 'tirzepatide' | null {
  const fromTreatment = classifyMedString(treatment);
  if (fromTreatment) return fromTreatment;

  if (glp1Type) {
    const fromType = classifyMedString(glp1Type);
    if (fromType) return fromType;
  }

  return null;
}

// Fixed switch tiers: Semaglutide C (1mg/week) and Tirzepatide B (5mg/week).
// Index references into the tier arrays defined above.
const SEMA_SWITCH_TIER_INDEX = 2; // previousDose=0.5 → Semaglutide C
const TIRZ_SWITCH_TIER_INDEX = 1; // previousDose=2.5 → Tirzepatide B

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the GLP-1 preselection result based on medication type and patient history.
 * Returns both 1-month (individual medication) and multi-month (order set name)
 * preselection data so the caller can decide based on planMonths.
 */
export function getGlp1Preselection(
  treatment: string,
  glp1Info: { usedGlp1: boolean; glp1Type: string | null; lastDose: string | null }
): GLP1PreselectionResult | null {
  const medication = identifyMedication(treatment, glp1Info.glp1Type);
  if (!medication) return null;

  // Detect medication switch: patient's GLP-1 history is on one med but the
  // treatment/invoice targets the other. In switch scenarios, dose history from
  // the old medication is not transferable — use fixed clinically-appropriate tiers.
  if (glp1Info.usedGlp1 && glp1Info.glp1Type) {
    const previousMed = classifyMedString(glp1Info.glp1Type);
    const targetMed = classifyMedString(treatment);

    if (previousMed && targetMed && previousMed !== targetMed) {
      if (targetMed === 'semaglutide') {
        // Tirzepatide → Semaglutide: start at Semaglutide C (1mg/week)
        const tier = SEMAGLUTIDE_TIERS[SEMA_SWITCH_TIER_INDEX];
        return { oneMonth: tier.oneMonth, multiMonth: { orderSetName: tier.orderSetName } };
      }
      // Semaglutide → Tirzepatide: start at Tirzepatide B (5mg/week)
      const tier = TIRZEPATIDE_TIERS[TIRZ_SWITCH_TIER_INDEX];
      return { oneMonth: tier.oneMonth, multiMonth: { orderSetName: tier.orderSetName } };
    }
  }

  const tiers = medication === 'semaglutide' ? SEMAGLUTIDE_TIERS : TIRZEPATIDE_TIERS;
  const previousDose = glp1Info.usedGlp1 ? parseLastDose(glp1Info.lastDose) : 0;
  const tier = findDoseTier(tiers, previousDose);

  return {
    oneMonth: tier.oneMonth,
    multiMonth: { orderSetName: tier.orderSetName },
  };
}

/**
 * Find matching order set by name (case-insensitive, trimmed).
 * Uses progressive matching: exact → normalized → fuzzy → core-token.
 * Handles real-world naming quirks (trailing periods, inconsistent dashes/spaces).
 */
export function findOrderSetByName(
  orderSets: Array<{ id: number; name: string; [key: string]: unknown }>,
  targetName: string
): { id: number; name: string } | null {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const target = normalize(targetName);

  // 1. Exact (case-insensitive, whitespace-normalized)
  const exact = orderSets.find((s) => normalize(s.name) === target);
  if (exact) return exact;

  // 2. Fuzzy: strip dashes, trailing punctuation, collapse whitespace
  const fuzzyNormalize = (s: string) =>
    normalize(s)
      .replace(/[-–—.,:;!]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const fuzzyTarget = fuzzyNormalize(targetName);
  const fuzzy = orderSets.find((s) => fuzzyNormalize(s.name) === fuzzyTarget);
  if (fuzzy) return fuzzy;

  // 3. Core-token match: extract "medication letter" pattern (e.g. "tirzepatide b")
  //    and match against order sets that contain the same core token.
  const coreTokenMatch = fuzzyTarget.match(/^((?:semaglutide|tirzepatide)\s+\w+)/);
  if (coreTokenMatch) {
    const coreToken = coreTokenMatch[1];
    const byCore = orderSets.find((s) => fuzzyNormalize(s.name).startsWith(coreToken));
    if (byCore) return byCore;
  }

  // 4. Substring containment
  return (
    orderSets.find(
      (s) => fuzzyNormalize(s.name).includes(fuzzyTarget) || fuzzyTarget.includes(fuzzyNormalize(s.name))
    ) || null
  );
}
