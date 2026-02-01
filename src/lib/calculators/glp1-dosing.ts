/**
 * GLP-1 Medication Dosing Calculation Utilities
 *
 * References:
 * - FDA-approved prescribing information for Wegovy (semaglutide)
 * - FDA-approved prescribing information for Ozempic (semaglutide)
 * - FDA-approved prescribing information for Mounjaro/Zepbound (tirzepatide)
 */

export type GLP1Medication = 'semaglutide' | 'tirzepatide';

export interface DoseConversionResult {
  mg: number;
  mL: number;
  units: number;
}

export interface TitrationStep {
  week: string;
  dose: number; // mg
  label: string;
  description: string;
  duration: string;
}

export interface ConcentrationOption {
  value: number; // mg/mL
  label: string;
  color: string;
}

export interface MedicationInfo {
  name: string;
  genericName: string;
  brandNames: string[];
  indication: string;
  concentrations: ConcentrationOption[];
  titrationSchedule: TitrationStep[];
  maintenanceDose: number;
  maxDose: number;
  administrationFrequency: string;
  storageInstructions: string[];
  commonSideEffects: string[];
  warnings: string[];
}

/**
 * Semaglutide medication information
 */
export const SEMAGLUTIDE_INFO: MedicationInfo = {
  name: 'Semaglutide',
  genericName: 'semaglutide',
  brandNames: ['Wegovy', 'Ozempic'],
  indication:
    'Chronic weight management in adults with BMI ≥30 or ≥27 with weight-related comorbidity',
  concentrations: [
    { value: 2.5, label: '2.5 mg/mL', color: '#3B82F6' },
    { value: 5, label: '5 mg/mL', color: '#10B981' },
    { value: 10, label: '10 mg/mL', color: '#8B5CF6' },
  ],
  titrationSchedule: [
    {
      week: '1-4',
      dose: 0.25,
      label: 'Weeks 1-4',
      description: 'Starting dose',
      duration: '4 weeks',
    },
    {
      week: '5-8',
      dose: 0.5,
      label: 'Weeks 5-8',
      description: 'First increase',
      duration: '4 weeks',
    },
    {
      week: '9-12',
      dose: 1.0,
      label: 'Weeks 9-12',
      description: 'Building up',
      duration: '4 weeks',
    },
    {
      week: '13-16',
      dose: 1.7,
      label: 'Weeks 13-16',
      description: 'Approaching target',
      duration: '4 weeks',
    },
    {
      week: '17+',
      dose: 2.4,
      label: 'Week 17+',
      description: 'Maintenance dose',
      duration: 'Ongoing',
    },
  ],
  maintenanceDose: 2.4,
  maxDose: 2.4,
  administrationFrequency: 'Once weekly',
  storageInstructions: [
    'Store in refrigerator at 36°F to 46°F (2°C to 8°C)',
    'After first use, can be stored at room temperature up to 77°F (25°C) for up to 28 days',
    'Do not freeze',
    'Keep away from direct light',
  ],
  commonSideEffects: [
    'Nausea',
    'Diarrhea',
    'Vomiting',
    'Constipation',
    'Abdominal pain',
    'Headache',
    'Fatigue',
    'Dyspepsia',
    'Dizziness',
  ],
  warnings: [
    'Thyroid C-cell tumors - contraindicated with personal/family history of MTC or MEN 2',
    'Pancreatitis - discontinue if suspected',
    'Gallbladder problems',
    'Hypoglycemia when used with insulin or sulfonylureas',
    'Acute kidney injury',
    'Hypersensitivity reactions',
    'Diabetic retinopathy complications in patients with diabetes',
  ],
};

/**
 * Tirzepatide medication information
 */
export const TIRZEPATIDE_INFO: MedicationInfo = {
  name: 'Tirzepatide',
  genericName: 'tirzepatide',
  brandNames: ['Mounjaro', 'Zepbound'],
  indication:
    'Chronic weight management in adults with BMI ≥30 or ≥27 with weight-related comorbidity',
  concentrations: [
    { value: 10, label: '10 mg/mL', color: '#10B981' },
    { value: 30, label: '30 mg/mL', color: '#8B5CF6' },
  ],
  titrationSchedule: [
    {
      week: '1-4',
      dose: 2.5,
      label: 'Weeks 1-4',
      description: 'Starting dose',
      duration: '4 weeks',
    },
    {
      week: '5-8',
      dose: 5.0,
      label: 'Weeks 5-8',
      description: 'First increase',
      duration: '4 weeks',
    },
    {
      week: '9-12',
      dose: 7.5,
      label: 'Weeks 9-12',
      description: 'Building up',
      duration: '4 weeks',
    },
    {
      week: '13-16',
      dose: 10.0,
      label: 'Weeks 13-16',
      description: 'Continuing increase',
      duration: '4 weeks',
    },
    {
      week: '17-20',
      dose: 12.5,
      label: 'Weeks 17-20',
      description: 'Approaching target',
      duration: '4 weeks',
    },
    {
      week: '21+',
      dose: 15.0,
      label: 'Week 21+',
      description: 'Maintenance dose',
      duration: 'Ongoing',
    },
  ],
  maintenanceDose: 15.0,
  maxDose: 15.0,
  administrationFrequency: 'Once weekly',
  storageInstructions: [
    'Store in refrigerator at 36°F to 46°F (2°C to 8°C)',
    'May be stored at room temperature up to 86°F (30°C) for up to 21 days',
    'Do not freeze',
    'Protect from light',
  ],
  commonSideEffects: [
    'Nausea',
    'Diarrhea',
    'Decreased appetite',
    'Vomiting',
    'Constipation',
    'Dyspepsia',
    'Abdominal pain',
    'Injection site reactions',
    'Fatigue',
    'Hypersensitivity reactions',
  ],
  warnings: [
    'Thyroid C-cell tumors - contraindicated with personal/family history of MTC or MEN 2',
    'Pancreatitis - discontinue if suspected',
    'Hypoglycemia when used with insulin or sulfonylureas',
    'Hypersensitivity reactions',
    'Acute kidney injury',
    'Severe gastrointestinal disease',
    'Diabetic retinopathy complications in patients with diabetes',
    'Acute gallbladder disease',
  ],
};

/**
 * Get medication info by type
 */
export function getMedicationInfo(medication: GLP1Medication): MedicationInfo {
  return medication === 'semaglutide' ? SEMAGLUTIDE_INFO : TIRZEPATIDE_INFO;
}

/**
 * Convert insulin units to mL
 * Standard: 100 units = 1 mL
 */
export function unitsToML(units: number): number {
  return Math.round((units / 100) * 1000) / 1000;
}

/**
 * Convert mL to insulin units
 */
export function mlToUnits(mL: number): number {
  return Math.round(mL * 100 * 10) / 10;
}

/**
 * Convert units to mg based on concentration
 */
export function unitsToMg(units: number, concentrationMgPerMl: number): number {
  const mL = unitsToML(units);
  const mg = mL * concentrationMgPerMl;
  return Math.round(mg * 1000) / 1000;
}

/**
 * Convert mg to units based on concentration
 */
export function mgToUnits(mg: number, concentrationMgPerMl: number): number {
  const mL = mg / concentrationMgPerMl;
  return Math.round(mlToUnits(mL) * 10) / 10;
}

/**
 * Convert mg to mL based on concentration
 */
export function mgToMl(mg: number, concentrationMgPerMl: number): number {
  return Math.round((mg / concentrationMgPerMl) * 1000) / 1000;
}

/**
 * Full dose conversion
 */
export function convertDose(
  inputValue: number,
  inputUnit: 'units' | 'mg' | 'mL',
  concentrationMgPerMl: number
): DoseConversionResult {
  let units: number;
  let mg: number;
  let mL: number;

  switch (inputUnit) {
    case 'units':
      units = inputValue;
      mL = unitsToML(units);
      mg = mL * concentrationMgPerMl;
      break;
    case 'mg':
      mg = inputValue;
      mL = mg / concentrationMgPerMl;
      units = mlToUnits(mL);
      break;
    case 'mL':
      mL = inputValue;
      units = mlToUnits(mL);
      mg = mL * concentrationMgPerMl;
      break;
    default:
      throw new Error('Invalid input unit');
  }

  return {
    mg: Math.round(mg * 1000) / 1000,
    mL: Math.round(mL * 1000) / 1000,
    units: Math.round(units * 10) / 10,
  };
}

/**
 * Get units needed for a specific dose at a given concentration
 */
export function getUnitsForDose(doseMg: number, concentrationMgPerMl: number): number {
  return mgToUnits(doseMg, concentrationMgPerMl);
}

/**
 * Get current titration step based on week number
 */
export function getCurrentTitrationStep(
  medication: GLP1Medication,
  weekNumber: number
): TitrationStep {
  const info = getMedicationInfo(medication);
  const schedule = info.titrationSchedule;

  // Find the appropriate step
  for (let i = schedule.length - 1; i >= 0; i--) {
    const step = schedule[i];
    const [startWeek] = step.week.split('-').map((w) => parseInt(w.replace('+', '')));
    if (weekNumber >= startWeek) {
      return step;
    }
  }

  return schedule[0]; // Default to first step
}

/**
 * Calculate days until next dose
 */
export function getDaysUntilNextDose(lastDoseDate: Date): number {
  const nextDoseDate = new Date(lastDoseDate);
  nextDoseDate.setDate(nextDoseDate.getDate() + 7);

  const now = new Date();
  const diffTime = nextDoseDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Check if dose is within recommended range
 */
export function validateDose(
  medication: GLP1Medication,
  doseMg: number
): { valid: boolean; message: string } {
  const info = getMedicationInfo(medication);

  if (doseMg <= 0) {
    return { valid: false, message: 'Dose must be greater than 0' };
  }

  if (doseMg > info.maxDose) {
    return {
      valid: false,
      message: `Dose exceeds maximum recommended dose of ${info.maxDose} mg`,
    };
  }

  // Check if dose matches a titration step
  const validDoses = info.titrationSchedule.map((s) => s.dose);
  if (!validDoses.includes(doseMg)) {
    return {
      valid: true,
      message: `Note: ${doseMg} mg is not a standard titration dose. Verify with prescriber.`,
    };
  }

  return { valid: true, message: 'Dose is within recommended range' };
}

/**
 * Injection site options
 */
export type InjectionSite =
  | 'abdomen_left'
  | 'abdomen_right'
  | 'thigh_left'
  | 'thigh_right'
  | 'upper_arm_left'
  | 'upper_arm_right';

export interface InjectionSiteInfo {
  site: InjectionSite;
  label: string;
  area: string;
  instructions: string;
}

export const INJECTION_SITES: InjectionSiteInfo[] = [
  {
    site: 'abdomen_left',
    label: 'Left Abdomen',
    area: 'Abdomen',
    instructions: 'Inject at least 2 inches away from navel. Rotate within the area.',
  },
  {
    site: 'abdomen_right',
    label: 'Right Abdomen',
    area: 'Abdomen',
    instructions: 'Inject at least 2 inches away from navel. Rotate within the area.',
  },
  {
    site: 'thigh_left',
    label: 'Left Thigh',
    area: 'Thigh',
    instructions: 'Inject into the front of the thigh, upper outer area.',
  },
  {
    site: 'thigh_right',
    label: 'Right Thigh',
    area: 'Thigh',
    instructions: 'Inject into the front of the thigh, upper outer area.',
  },
  {
    site: 'upper_arm_left',
    label: 'Left Upper Arm',
    area: 'Upper Arm',
    instructions: 'Inject into the back of the upper arm. May require assistance.',
  },
  {
    site: 'upper_arm_right',
    label: 'Right Upper Arm',
    area: 'Upper Arm',
    instructions: 'Inject into the back of the upper arm. May require assistance.',
  },
];

/**
 * Get next recommended injection site based on history
 */
export function getNextInjectionSite(recentSites: InjectionSite[]): InjectionSite {
  // Simple rotation: abdomen → thigh → arm, alternating sides
  const rotation: InjectionSite[] = [
    'abdomen_left',
    'abdomen_right',
    'thigh_left',
    'thigh_right',
    'upper_arm_left',
    'upper_arm_right',
  ];

  if (recentSites.length === 0) {
    return rotation[0];
  }

  const lastSite = recentSites[recentSites.length - 1];
  const lastIndex = rotation.indexOf(lastSite);
  const nextIndex = (lastIndex + 1) % rotation.length;

  return rotation[nextIndex];
}

/**
 * Calculate vial usage and refill timing
 */
export function calculateVialUsage(
  vialMg: number,
  weeklyDoseMg: number
): { dosesRemaining: number; weeksUntilRefill: number } {
  const dosesRemaining = Math.floor(vialMg / weeklyDoseMg);
  return {
    dosesRemaining,
    weeksUntilRefill: dosesRemaining,
  };
}

/**
 * Injection tips for patients
 */
export const INJECTION_TIPS = [
  'Let medication reach room temperature before injecting (about 30 minutes out of fridge)',
  'Clean injection site with alcohol swab and let dry',
  'Pinch skin and insert needle at 90-degree angle',
  'Inject slowly and steadily',
  'Hold needle in place for 5-10 seconds after injection',
  'Do not rub the injection site after',
  'Dispose of needle in sharps container',
  'Never reuse needles',
  'Store medication properly according to instructions',
  'Keep a consistent injection day each week',
];
