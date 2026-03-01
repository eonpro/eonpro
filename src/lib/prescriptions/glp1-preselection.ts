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
      medicationKey: SEMA_2ML,
      sig: 'Inject 1 mg (40 units) subcutaneously once weekly.',
      quantity: '1',
      refills: '0',
      daysSupply: '28',
    },
    orderSetName: 'Semaglutide C - 3 Month',
  },
  {
    previousDose: 1.7,
    oneMonth: {
      medicationKey: SEMA_3ML,
      sig: 'Inject 1.7 mg (68 units) subcutaneously once weekly.',
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
    orderSetName: 'Tirzepatide C- 3 Month',
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
    orderSetName: 'Tirzepatide D- 3 Month',
  },
  {
    previousDose: 10,
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

function identifyMedication(
  treatment: string,
  glp1Type: string | null
): 'semaglutide' | 'tirzepatide' | null {
  const treatmentLower = treatment.toLowerCase();
  const typeLower = (glp1Type || '').toLowerCase();

  if (
    treatmentLower.includes('tirzepatide') ||
    treatmentLower.includes('mounjaro') ||
    treatmentLower.includes('zepbound')
  ) {
    return 'tirzepatide';
  }
  if (
    treatmentLower.includes('semaglutide') ||
    treatmentLower.includes('ozempic') ||
    treatmentLower.includes('wegovy')
  ) {
    return 'semaglutide';
  }

  if (typeLower.includes('tirzepatide')) return 'tirzepatide';
  if (typeLower.includes('semaglutide')) return 'semaglutide';

  return null;
}

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
 * Uses progressive matching: exact → normalized → fuzzy → contains.
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

  const exact = orderSets.find((s) => normalize(s.name) === target);
  if (exact) return exact;

  const fuzzyNormalize = (s: string) =>
    normalize(s)
      .replace(/[-–—]/g, '')
      .replace(/\s+/g, ' ');

  const fuzzyTarget = fuzzyNormalize(targetName);
  const fuzzy = orderSets.find((s) => fuzzyNormalize(s.name) === fuzzyTarget);
  if (fuzzy) return fuzzy;

  return (
    orderSets.find(
      (s) => normalize(s.name).includes(target) || target.includes(normalize(s.name))
    ) || null
  );
}
