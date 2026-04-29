import { LOGOS_PRODUCTS } from '@/data/logosProducts';

export type SigTemplate = {
  label: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply?: number;
};

export type MedicationConfig = {
  id: number;
  name: string;
  strength: string;
  form: string; // normalized code used for defaults + payloads (e.g., CAP/TAB/INJ)
  formLabel?: string; // original vendor label (e.g., Capsule, Troche)
  defaultQuantity?: string;
  defaultRefills?: string;
  defaultSig?: string;
  sigTemplates?: SigTemplate[];
};

// ============================================================================
// INSULIN SYRINGE CONVERSION
// ============================================================================
// For 100-unit insulin syringes (U-100):
// 1 mL = 100 units
// 0.5 mL = 50 units
// 0.25 mL = 25 units
// 0.1 mL = 10 units
// etc.
//
// Format in sigs: "X mg (Y mL / Z units)" where Z = Y * 100
// This helps patients understand dosing when using insulin syringes.
// ============================================================================

/**
 * Convert mL to insulin syringe units (assuming 100-unit/mL syringe)
 */
export function mlToUnits(ml: number): number {
  return Math.round(ml * 100);
}

/**
 * Format injection volume with both mL and units
 * Example: formatVolume(0.25) => "0.25 mL / 25 units"
 */
export function formatVolume(ml: number): string {
  const units = mlToUnits(ml);
  return `${ml} mL / ${units} units`;
}

// SEMAGLUTIDE TEMPLATES (2.5 mg/mL concentration)
// Calculation: dose (mg) / 2.5 (mg/mL) = volume (mL), volume × 100 = units
// Example: 0.5 mg / 2.5 = 0.2 mL = 20 units
const SEMAGLUTIDE_TEMPLATES: SigTemplate[] = [
  {
    label: 'Weeks 1-4 · 0.25 mg',
    sig: 'Inject 0.25 mg (10 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Weeks 5-8 · 0.5 mg',
    sig: 'Inject 0.5 mg (20 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Maintenance · 1 mg',
    sig: 'Inject 1 mg (40 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
];

// SEMAGLUTIDE 5 MG/ML TEMPLATES (5 mg/mL, 2 mL vial = 10 mg - HIGHER concentration vial)
// 1 mL = 100 units, 2 mL = 200 units. 5 mg per mL = 5 mg per 100 units. Dose (mg) / 5 * 100 = units.
const SEMAGLUTIDE_5MG_TEMPLATES: SigTemplate[] = [
  {
    label: 'Weeks 1-4 · 0.25 mg',
    sig: 'Inject 0.25 mg (5 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Weeks 5-8 · 0.5 mg',
    sig: 'Inject 0.5 mg (10 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Maintenance · 1 mg',
    sig: 'Inject 1 mg (20 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Maintenance · 1.7 mg',
    sig: 'Inject 1.7 mg (34 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Maximum · 2.4 mg',
    sig: 'Inject 2.4 mg (48 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
];

const TIRZEPATIDE_TEMPLATES: SigTemplate[] = [
  {
    label: 'Initiation · 2.5 mg',
    sig: 'Inject 2.5 mg (25 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Escalation · 5 mg',
    sig: 'Inject 5 mg (50 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Maintenance · 10 mg',
    sig: 'Inject 10 mg (100 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
];

// TIRZEPATIDE 15 MG/ML TEMPLATES (15 mg/mL concentration - HIGHER concentration vial)
// Calculation: dose (mg) / 15 (mg/mL) = volume (mL), volume × 100 = units
// Example: 2.5 mg / 15 = 0.167 mL = 17 units (rounded)
const TIRZEPATIDE_15MG_TEMPLATES: SigTemplate[] = [
  {
    label: 'Initiation · 2.5 mg',
    sig: 'Inject 2.5 mg (17 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Escalation · 5 mg',
    sig: 'Inject 5 mg (33 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Maintenance · 10 mg',
    sig: 'Inject 10 mg (67 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'High Dose · 15 mg',
    sig: 'Inject 15 mg (100 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
];

// TIRZEPATIDE 30 MG/ML TEMPLATES (30 mg/mL concentration - HIGHEST concentration vial)
// Calculation: dose (mg) / 30 (mg/mL) = volume (mL), volume × 100 = units
// Example: 2.5 mg / 30 = 0.083 mL = 8 units (rounded)
const TIRZEPATIDE_30MG_TEMPLATES: SigTemplate[] = [
  {
    label: 'Initiation · 2.5 mg',
    sig: 'Inject 2.5 mg (8 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Escalation · 5 mg',
    sig: 'Inject 5 mg (17 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'Maintenance · 10 mg',
    sig: 'Inject 10 mg (33 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
  {
    label: 'High Dose · 15 mg',
    sig: 'Inject 15 mg (50 units) subcutaneously once weekly.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
  },
];

const ENCLO_TEMPLATE_MWF: SigTemplate = {
  label: 'MWF · 3 days/week',
  sig: 'Take 1 capsule by mouth once daily on Monday, Wednesday, and Friday.',
  quantity: '12',
  refills: '0',
};

const ENCLO_TEMPLATE_DAILY: SigTemplate = {
  label: 'Daily',
  sig: 'Take 1 capsule by mouth each morning with or without food.',
  quantity: '30',
  refills: '0',
};

const ENCLO_TEMPLATE_PULSE: SigTemplate = {
  label: 'Pulse · 5 days on / 2 off',
  sig: 'Take 1 capsule by mouth daily Monday through Friday, then hold on the weekend.',
  quantity: '20',
  refills: '0',
};

const TESTOSTERONE_TEMPLATES: SigTemplate[] = [
  {
    label: 'Twice Weekly 0.5 mL SubQ',
    sig: 'Inject 0.5 mL (50 units) subcutaneously twice weekly (e.g., Monday and Thursday).',
    quantity: '1',
    refills: '0',
    daysSupply: 35,
  },
  {
    label: 'Weekly 100 mg',
    sig: 'Inject 100 mg (50 units) intramuscularly or subcutaneously once weekly.',
    quantity: '10',
    refills: '0',
    daysSupply: 70,
  },
  {
    label: 'Biweekly 200 mg',
    sig: 'Inject 200 mg (100 units) intramuscularly every 10-14 days.',
    quantity: '10',
    refills: '0',
    daysSupply: 100,
  },
  {
    label: 'Twice Weekly 50 mg x2',
    sig: 'Inject 50 mg (25 units) subcutaneously twice weekly.',
    quantity: '10',
    refills: '0',
    daysSupply: 70,
  },
];

const ANASTROZOLE_0125_TEMPLATES: SigTemplate[] = [
  {
    label: '0.125 mg twice weekly',
    sig: 'Take 0.125 mg by mouth twice weekly.',
    quantity: '8',
    refills: '0',
  },
];

const ANASTROZOLE_025_TEMPLATES: SigTemplate[] = [
  {
    label: '0.25 mg twice weekly',
    sig: 'Take 0.25 mg by mouth twice weekly.',
    quantity: '8',
    refills: '0',
  },
];

const ANASTROZOLE_05_TEMPLATES: SigTemplate[] = [
  {
    label: '0.5 mg twice weekly',
    sig: 'Take 1 capsule (0.5 mg) by mouth every Monday and Thursday to manage estradiol.',
    quantity: '8',
    refills: '0',
  },
  {
    label: '½ tablet (0.25 mg) twice weekly',
    sig: 'Take ½ tablet (0.25 mg) by mouth twice weekly.',
    quantity: '8',
    refills: '0',
  },
];

// ============================================================================
// CYANOCOBALAMIN (B12) — CANONICAL DOSING
// ============================================================================
// B12 is a fixed-dose addon medication (no titration ladder). The sig is
// authoritative and must NOT vary across order sets, refills, or manual
// medication selection. Exported so callers (and regression tests) can
// reference a single source of truth.
// ============================================================================
export const CYANOCOBALAMIN_B12_PRODUCT_ID = '203449111';
export const CYANOCOBALAMIN_B12_CANONICAL_SIG =
  'Inject 50 units subcutaneously twice per week.';
export const CYANOCOBALAMIN_B12_CANONICAL_QUANTITY = '1';
export const CYANOCOBALAMIN_B12_CANONICAL_REFILLS = '0';
export const CYANOCOBALAMIN_B12_CANONICAL_DAYS_SUPPLY = 30;

const B12_TEMPLATES: SigTemplate[] = [
  {
    label: '2x/week · 50 units',
    sig: CYANOCOBALAMIN_B12_CANONICAL_SIG,
    quantity: CYANOCOBALAMIN_B12_CANONICAL_QUANTITY,
    refills: CYANOCOBALAMIN_B12_CANONICAL_REFILLS,
    daysSupply: CYANOCOBALAMIN_B12_CANONICAL_DAYS_SUPPLY,
  },
];

/**
 * Override the sig/quantity/refills/daysSupply for medications whose dosing
 * is fixed (i.e. not titrated and not provider-specific). Returns null for
 * medications where the provider/order-set is allowed to customize the sig.
 *
 * Currently used to guarantee the Cyanocobalamin (B12) sig is always the
 * canonical "Inject 50 units subcutaneously twice per week.", regardless of
 * what may be stored in legacy Order Sets or returned by upstream APIs.
 */
export function getCanonicalAddonSigOverride(
  medicationKey: string
): { sig: string; quantity: string; refills: string; daysSupply: number } | null {
  if (medicationKey === CYANOCOBALAMIN_B12_PRODUCT_ID) {
    return {
      sig: CYANOCOBALAMIN_B12_CANONICAL_SIG,
      quantity: CYANOCOBALAMIN_B12_CANONICAL_QUANTITY,
      refills: CYANOCOBALAMIN_B12_CANONICAL_REFILLS,
      daysSupply: CYANOCOBALAMIN_B12_CANONICAL_DAYS_SUPPLY,
    };
  }
  return null;
}

const SERMORELIN_TEMPLATES: SigTemplate[] = [
  {
    label: 'M-F · 20 units before bedtime',
    sig: 'Inject 20 units subcutaneously once daily before bedtime Monday-Friday.',
    quantity: '1',
    refills: '0',
    daysSupply: 30,
  },
  {
    label: 'Nightly 0.3 mg',
    sig: 'Inject 0.3 mg (15 units) subcutaneously nightly at bedtime on an empty stomach.',
    quantity: '1',
    refills: '0',
    daysSupply: 30,
  },
];

type FormCategory = 'INJ' | 'TAB' | 'CAP' | 'TROCHE' | 'CREAM' | 'GEL' | 'SWAB' | 'KIT' | 'OTHER';

function normalizeForm(form: string): { code: FormCategory; label: string } {
  const value = form.toLowerCase();
  if (value.includes('inject')) return { code: 'INJ', label: form };
  if (value.includes('capsule')) return { code: 'CAP', label: form };
  if (value.includes('tablet')) return { code: 'TAB', label: form };
  if (value.includes('troche')) return { code: 'TROCHE', label: form };
  if (value.includes('cream')) return { code: 'CREAM', label: form };
  if (value.includes('gel')) return { code: 'GEL', label: form };
  if (value.includes('swab')) return { code: 'SWAB', label: form };
  if (value.includes('kit')) return { code: 'KIT', label: form };
  return { code: 'OTHER', label: form };
}

const SPECIAL_CONFIGS: Record<number, Partial<MedicationConfig>> = {
  203449328: {
    name: 'Enclomiphene Citrate 12.5 mg',
    strength: '12.5 mg',
    sigTemplates: [ENCLO_TEMPLATE_MWF, ENCLO_TEMPLATE_DAILY, ENCLO_TEMPLATE_PULSE],
  },
  203449329: {
    name: 'Enclomiphene Citrate 25 mg',
    strength: '25 mg',
    defaultQuantity: '12',
    defaultRefills: '0',
    sigTemplates: [ENCLO_TEMPLATE_MWF, ENCLO_TEMPLATE_DAILY, ENCLO_TEMPLATE_PULSE],
  },
  203449330: {
    name: 'Enclomiphene Citrate 50 mg',
    strength: '50 mg',
    sigTemplates: [
      ENCLO_TEMPLATE_MWF,
      {
        label: 'Titration · 50 mg qod',
        sig: 'Take 1 capsule by mouth every other day. Skip dose if labs show estradiol > 40 pg/mL.',
        quantity: '16',
        refills: '0',
      },
      ENCLO_TEMPLATE_DAILY,
    ],
  },
  203666707: {
    name: 'Anastrozole 0.125 mg',
    strength: '0.125 mg',
    defaultQuantity: '8',
    defaultRefills: '0',
    sigTemplates: ANASTROZOLE_0125_TEMPLATES,
  },
  203449460: {
    name: 'Anastrozole 0.25 mg',
    strength: '0.25 mg',
    defaultQuantity: '8',
    defaultRefills: '0',
    sigTemplates: ANASTROZOLE_025_TEMPLATES,
  },
  203194021: {
    name: 'Anastrozole 0.5 mg',
    strength: '0.5 mg',
    defaultQuantity: '8',
    defaultRefills: '0',
    sigTemplates: ANASTROZOLE_05_TEMPLATES,
  },
  203418766: {
    sigTemplates: [
      {
        label: 'Standard 40 units twice weekly × 12 wk',
        sig: 'Inject 40 units subcutaneously twice per week preferably in morning for 12 weeks.',
        quantity: '1',
        refills: '0',
      },
    ],
  },
  203419417: { name: 'MIC + B12 Injection (30 mL)', strength: '25/50/50/1 mg/mL' },
  204427073: {
    name: 'Modafinil 200 mg',
    strength: '200 mg',
    sigTemplates: [
      {
        label: 'Daily 200 mg (morning)',
        sig: 'Take 1 tablet (200 mg) by mouth once daily in the morning. Avoid late-afternoon dosing to prevent insomnia.',
        quantity: '30',
        refills: '0',
      },
      {
        label: 'Daily 100 mg (half tablet)',
        sig: 'Take half tablet (100 mg) by mouth once daily in the morning. May increase to 200 mg if tolerated.',
        quantity: '30',
        refills: '0',
      },
    ],
  },
  203449527: {
    name: 'Pregnyl 10,000 IU (HCG)',
    strength: '10,000 IU',
    sigTemplates: [
      {
        label: 'Standard 30 units three times weekly',
        sig: 'Reconstitute vial with 10 mL bacteriostatic water. Inject 30 units subcutaneously three times per week.',
        quantity: '1',
        refills: '0',
      },
    ],
  },
  203449111: {
    name: 'Cyanocobalamin (B12) 1000 mcg/mL',
    strength: '1000 mcg/mL',
    sigTemplates: B12_TEMPLATES,
  },
  203194055: {
    name: 'NAD+ 100 mg/mL (10 mL)',
    strength: '100 mg/mL',
    sigTemplates: [
      {
        label: 'M-F · 40 units (40 mg) SubQ',
        sig: 'Inject 40 units (40 mg) subcutaneously once daily for Monday-Friday.',
        quantity: '1',
        refills: '0',
        daysSupply: 30,
      },
    ],
  },
  204754029: {
    name: 'NAD+ 100 mg/mL (5 mL)',
    strength: '100 mg/mL',
    sigTemplates: [
      {
        label: 'M-F · 20 units (20 mg) SubQ',
        sig: 'Inject 20 units (20 mg) subcutaneously once daily for Monday-Friday.',
        quantity: '1',
        refills: '0',
        daysSupply: 30,
      },
    ],
  },
  203448971: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  203448947: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  203449363: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  203448974: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  202851329: { sigTemplates: SEMAGLUTIDE_5MG_TEMPLATES }, // 5 mg/mL - uses different concentration templates
  203666651: { sigTemplates: SERMORELIN_TEMPLATES },
  203418853: { sigTemplates: SERMORELIN_TEMPLATES },
  203194046: { name: 'Sildenafil 55 mg Capsule', strength: '55 mg' },
  203194048: { name: 'Sildenafil 110 mg Capsule', strength: '110 mg' },
  203666779: { name: 'Sildenafil/Tadalafil 55/11 mg Tablet', strength: '55/11 mg' },
  203666778: { name: 'Sildenafil/Tadalafil 110/22 mg Tablet', strength: '110/22 mg' },
  203449567: { name: 'Tadalafil 5 mg Tablet', strength: '5 mg' },
  203194052: { name: 'Tadalafil/Apomorphine 10/2 mg Capsule', strength: '10/2 mg' },
  202851334: {
    name: 'Testosterone Cypionate 200 mg/mL (10 mL)',
    sigTemplates: TESTOSTERONE_TEMPLATES,
  },
  203418861: {
    name: 'Testosterone Cypionate 200 mg/mL (5 mL)',
    sigTemplates: TESTOSTERONE_TEMPLATES,
  },
  203666716: {
    name: 'Testosterone Cypionate 50 mg/mL (2 mL)',
    sigTemplates: TESTOSTERONE_TEMPLATES,
  },
  203448972: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203448973: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203449364: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203449500: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203449362: { sigTemplates: TIRZEPATIDE_15MG_TEMPLATES }, // 15 mg/mL - uses different concentration templates
  203418602: { sigTemplates: TIRZEPATIDE_30MG_TEMPLATES }, // 30 mg/mL - uses highest concentration templates
  203419244: {
    name: 'Syringes/Alcohol Pads (Kit of #10)',
    defaultQuantity: '1',
    defaultRefills: '0',
    defaultSig: 'Use supplies as directed for subcutaneous injection.',
  },
};

export const MEDS: Record<string, MedicationConfig> = {};

LOGOS_PRODUCTS.forEach((product: any) => {
  const { code, label } = normalizeForm(product.form);
  const overrides = SPECIAL_CONFIGS[product.id] ?? {};
  const config: MedicationConfig = {
    id: product.id,
    name: overrides.name ?? product.name,
    strength: overrides.strength ?? (product.strength || ''),
    form: code,
    formLabel: label,
    defaultQuantity: overrides.defaultQuantity,
    defaultRefills: overrides.defaultRefills,
    defaultSig: overrides.defaultSig,
    sigTemplates: overrides.sigTemplates,
  };
  MEDS[String(product.id)] = config;
});

// ============================================================================
// GLP-1 AUTO-ADD SYRINGE KIT
// ============================================================================

export const SYRINGE_KIT_PRODUCT_ID = 203419244;

export const SEMAGLUTIDE_PRODUCT_IDS = new Set([
  203448971, 203448947, 203449363, 203448974, 202851329,
]);

export const TIRZEPATIDE_PRODUCT_IDS = new Set([
  203448972, 203448973, 203449364, 203449500, 203449362, 203418602,
]);

export const GLP1_PRODUCT_IDS = new Set([...SEMAGLUTIDE_PRODUCT_IDS, ...TIRZEPATIDE_PRODUCT_IDS]);

/**
 * WellMedR checkout add-on products → Lifefile pharmacy medication keys.
 * Used to pre-populate the Rx form when a paid invoice includes add-ons.
 */
export const ADDON_MEDICATION_MAP: Record<string, string> = {
  nad_plus: '204754029',
  sermorelin: '203666651',
  b12: '203449111',
};

/**
 * Elite Bundle injectable medication Lifefile product IDs (NAD+, Sermorelin, B12).
 * Used to auto-add syringe kits when these meds are on an order.
 */
export const ELITE_ADDON_PRODUCT_IDS = new Set(Object.values(ADDON_MEDICATION_MAP).map(Number));

/** WellMedR Elite Package ships with 5 syringe kits (50 syringes total). */
export const ELITE_SYRINGE_KIT_QUANTITY = 5;
