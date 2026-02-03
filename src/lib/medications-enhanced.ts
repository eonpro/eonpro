/**
 * Enhanced Medication Sig Templates
 * 
 * Comprehensive prescription directions with storage, administration,
 * warnings, and missed dose instructions.
 *
 * INSULIN SYRINGE UNITS (100-unit/mL syringes):
 * All injectable sigs include both mL and units for patient clarity.
 * Conversion: 1 mL = 100 units, so multiply mL by 100.
 * Format: "X mg (Y mL / Z units)" where Z = Y * 100
 */

import { MEDS, MedicationConfig, mlToUnits, formatVolume } from './medications';

// Re-export utility functions for use elsewhere
export { mlToUnits, formatVolume };

// ============================================================================
// TYPES
// ============================================================================

export interface StorageInfo {
  text: string;
  temperature?: 'refrigerated' | 'room-temperature' | 'frozen';
  temperatureRange?: string;
  lightSensitive?: boolean;
  specialInstructions?: string;
}

export interface AdministrationInfo {
  route: string;
  sites?: string[];
  timing?: string;
  foodInteraction?: string;
  specialTechnique?: string;
  preparationSteps?: string[];
}

export interface WarningsInfo {
  commonSideEffects?: string[];
  seriousSideEffects?: string[];
  contraindications?: string[];
  monitoring?: string[];
  emergencySymptoms?: string[];
  drugInteractions?: string[];
}

export interface EnhancedSigTemplate {
  // Core fields (compatible with existing SigTemplate)
  label: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply?: number;
  
  // Enhanced sections
  storage?: StorageInfo;
  administration?: AdministrationInfo;
  warnings?: WarningsInfo;
  missedDose?: string;
  
  // Metadata
  phase?: 'initiation' | 'escalation' | 'maintenance' | 'standard';
  targetDose?: string;
  weekRange?: string;
}

export interface MedicationEnhancedConfig extends MedicationConfig {
  category?: 'GLP-1' | 'TRT' | 'Peptide' | 'AI' | 'ED' | 'Other';
  enhancedTemplates?: EnhancedSigTemplate[];
  defaultStorage?: StorageInfo;
  defaultAdministration?: AdministrationInfo;
  defaultWarnings?: WarningsInfo;
  generalMissedDose?: string;
}

// ============================================================================
// STORAGE PRESETS
// ============================================================================

export const STORAGE_PRESETS = {
  REFRIGERATED_GLP1: {
    text: 'Store in refrigerator at 36-46°F (2-8°C). Do not freeze. Protect from light. May be kept at room temperature up to 77°F (25°C) for up to 21 days.',
    temperature: 'refrigerated' as const,
    temperatureRange: '36-46°F (2-8°C)',
    lightSensitive: true,
    specialInstructions: 'Discard if frozen or if exposed to temperatures above 86°F (30°C).',
  },
  REFRIGERATED_PEPTIDE: {
    text: 'Keep refrigerated at 36-46°F (2-8°C). Do not freeze. Once reconstituted, use within 28 days.',
    temperature: 'refrigerated' as const,
    temperatureRange: '36-46°F (2-8°C)',
    lightSensitive: true,
  },
  ROOM_TEMPERATURE: {
    text: 'Store at room temperature 68-77°F (20-25°C). Keep in a dry place away from heat and direct light.',
    temperature: 'room-temperature' as const,
    temperatureRange: '68-77°F (20-25°C)',
  },
  TESTOSTERONE: {
    text: 'Store at room temperature 68-77°F (20-25°C). Protect from light. Do not refrigerate or freeze.',
    temperature: 'room-temperature' as const,
    temperatureRange: '68-77°F (20-25°C)',
    lightSensitive: true,
    specialInstructions: 'Warm vial to body temperature before injection for comfort.',
  },
};

// ============================================================================
// ADMINISTRATION PRESETS
// ============================================================================

export const ADMINISTRATION_PRESETS = {
  SUBCUTANEOUS_GLP1: {
    route: 'Subcutaneous injection',
    sites: ['Abdomen (at least 2 inches from belly button)', 'Front of thigh', 'Upper outer arm'],
    timing: 'Once weekly, on the same day each week, with or without food',
    specialTechnique: 'Use a 100-unit insulin syringe (U-100). Pinch skin, insert needle at 45-90° angle, inject slowly, hold for 5-10 seconds before removing.',
    preparationSteps: [
      'Wash hands thoroughly',
      'Allow medication to reach room temperature (15-30 min)',
      'Inspect solution - should be clear and colorless',
      'Draw correct dose into insulin syringe (1 mL = 100 units)',
      'Clean injection site with alcohol swab',
      'Rotate injection sites to prevent lipodystrophy',
    ],
  },
  SUBCUTANEOUS_PEPTIDE: {
    route: 'Subcutaneous injection',
    sites: ['Abdomen (at least 2 inches from belly button)', 'Inner arm'],
    timing: 'As directed, typically at bedtime on an empty stomach',
    specialTechnique: 'Use a 100-unit insulin syringe (U-100). Inject slowly into pinched skin fold.',
    preparationSteps: [
      'Wash hands thoroughly',
      'Clean injection site with alcohol swab',
      'Draw correct dose into insulin syringe (1 mL = 100 units)',
      'Remove air bubbles by tapping syringe',
    ],
  },
  INTRAMUSCULAR: {
    route: 'Intramuscular injection',
    sites: ['Gluteal muscle (upper outer quadrant)', 'Deltoid muscle', 'Vastus lateralis (outer thigh)'],
    timing: 'As directed, typically once weekly',
    specialTechnique: 'Use 1-1.5 inch needle (22-25 gauge). Inject into muscle at 90° angle. Aspirate before injecting. For SubQ, use insulin syringe.',
    preparationSteps: [
      'Warm medication to body temperature',
      'Wash hands and clean injection site',
      'Draw medication into syringe (1 mL = 100 units if using insulin syringe)',
      'Inject slowly over 30 seconds',
    ],
  },
  ORAL_DAILY: {
    route: 'By mouth',
    timing: 'Once daily, at the same time each day',
    foodInteraction: 'May be taken with or without food unless otherwise directed.',
  },
  ORAL_WITH_FOOD: {
    route: 'By mouth',
    timing: 'Take with food to minimize GI side effects',
    foodInteraction: 'Take with a meal or snack.',
  },
  TOPICAL: {
    route: 'Topical application',
    sites: ['Apply to clean, dry skin as directed'],
    specialTechnique: 'Apply thin layer and allow to dry completely. Wash hands after application.',
  },
};

// ============================================================================
// WARNINGS PRESETS
// ============================================================================

export const WARNINGS_PRESETS = {
  GLP1: {
    commonSideEffects: [
      'Nausea (usually improves over time)',
      'Diarrhea or constipation',
      'Decreased appetite',
      'Injection site reactions',
      'Fatigue',
      'Headache',
    ],
    seriousSideEffects: [
      'Severe abdominal pain (may indicate pancreatitis)',
      'Severe nausea/vomiting',
      'Signs of thyroid tumors (neck lump, trouble swallowing)',
      'Hypoglycemia symptoms if on insulin/sulfonylureas',
    ],
    contraindications: [
      'Personal/family history of medullary thyroid carcinoma (MTC)',
      'Multiple Endocrine Neoplasia syndrome type 2 (MEN2)',
      'History of pancreatitis',
      'Severe gastroparesis',
      'Pregnancy or planning pregnancy',
    ],
    monitoring: [
      'Weight - weekly',
      'Blood glucose - if diabetic',
      'Report persistent GI symptoms',
      'Thyroid symptoms',
    ],
    emergencySymptoms: [
      'Severe abdominal pain radiating to back',
      'Persistent vomiting',
      'Difficulty breathing or swallowing',
      'Signs of allergic reaction (rash, swelling, dizziness)',
    ],
  },
  TESTOSTERONE: {
    commonSideEffects: [
      'Acne or oily skin',
      'Increased body hair',
      'Mood changes',
      'Injection site pain/swelling',
      'Fluid retention',
    ],
    seriousSideEffects: [
      'Polycythemia (elevated red blood cells)',
      'Sleep apnea worsening',
      'Prostate changes',
      'Cardiovascular events',
    ],
    contraindications: [
      'Prostate or breast cancer',
      'Severe heart failure',
      'Polycythemia (hematocrit >54%)',
      'Untreated sleep apnea',
      'Planning conception (suppresses sperm)',
    ],
    monitoring: [
      'Hematocrit/Hemoglobin - every 3-6 months',
      'PSA - annually if over 40',
      'Lipid panel - every 6-12 months',
      'Liver function - as directed',
    ],
    drugInteractions: [
      'Blood thinners (warfarin) - may increase effect',
      'Insulin/oral diabetic medications - may need dose adjustment',
    ],
  },
  PEPTIDE: {
    commonSideEffects: [
      'Injection site reactions',
      'Flushing',
      'Headache',
      'Fatigue or increased energy',
    ],
    monitoring: [
      'IGF-1 levels periodically',
      'Blood glucose',
      'Symptoms and response',
    ],
  },
  AROMATASE_INHIBITOR: {
    commonSideEffects: [
      'Joint pain/stiffness',
      'Hot flashes',
      'Fatigue',
      'Mood changes',
    ],
    monitoring: [
      'Estradiol levels',
      'Bone density if long-term use',
      'Lipid panel',
    ],
  },
};

// ============================================================================
// ENHANCED TEMPLATES BY MEDICATION CATEGORY
// ============================================================================

export const TIRZEPATIDE_ENHANCED_TEMPLATES: EnhancedSigTemplate[] = [
  {
    label: 'Initiation - Weeks 1-4 · 2.5 mg',
    phase: 'initiation',
    weekRange: '1-4',
    targetDose: '2.5 mg',
    sig: 'Inject 2.5 mg (0.25 mL / 25 units) subcutaneously once weekly for 4 weeks to initiate therapy. Inject on the same day each week. Rotate injection sites.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: {
      ...ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
      timing: 'Once weekly on the same day. Morning or evening - consistency is key.',
    },
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, administer as soon as possible within 4 days. If more than 4 days have passed, skip the missed dose and resume on regular schedule.',
  },
  {
    label: 'Escalation - Weeks 5-8 · 5 mg',
    phase: 'escalation',
    weekRange: '5-8',
    targetDose: '5 mg',
    sig: 'Inject 5 mg (0.5 mL / 50 units) subcutaneously once weekly. Continue if tolerating initiation dose well. Monitor for GI side effects.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, administer as soon as possible within 4 days. If more than 4 days have passed, skip and resume on regular schedule.',
  },
  {
    label: 'Escalation - Weeks 9-12 · 7.5 mg',
    phase: 'escalation',
    weekRange: '9-12',
    targetDose: '7.5 mg',
    sig: 'Inject 7.5 mg (0.75 mL / 75 units) subcutaneously once weekly. Titrate only if prior dose was well tolerated. Report any persistent nausea or GI symptoms.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, administer as soon as possible within 4 days.',
  },
  {
    label: 'Maintenance - 10 mg',
    phase: 'maintenance',
    targetDose: '10 mg',
    sig: 'Inject 10 mg (1 mL / 100 units) subcutaneously once weekly for maintenance therapy. Continue lifestyle modifications including diet and exercise.',
    quantity: '1',
    refills: '2',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, administer as soon as possible within 4 days.',
  },
  {
    label: 'Maximum - 15 mg',
    phase: 'maintenance',
    targetDose: '15 mg',
    sig: 'Inject 15 mg (1.5 mL / 150 units*) subcutaneously once weekly. Maximum dose. Monitor weight loss progress and metabolic parameters. *Note: May require two draws with a 100-unit syringe.',
    quantity: '1',
    refills: '2',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, administer as soon as possible within 4 days.',
  },
];

export const SEMAGLUTIDE_ENHANCED_TEMPLATES: EnhancedSigTemplate[] = [
  {
    label: 'Initiation - Weeks 1-4 · 0.25 mg',
    phase: 'initiation',
    weekRange: '1-4',
    targetDose: '0.25 mg',
    sig: 'Inject 0.25 mg (0.25 mL / 25 units) subcutaneously once weekly for 4 weeks to initiate therapy. Rotate injection sites between abdomen, thigh, and upper arm.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, inject as soon as possible within 5 days. If more than 5 days, skip and resume on regular schedule.',
  },
  {
    label: 'Escalation - Weeks 5-8 · 0.5 mg',
    phase: 'escalation',
    weekRange: '5-8',
    targetDose: '0.5 mg',
    sig: 'Inject 0.5 mg (0.5 mL / 50 units) subcutaneously once weekly. Titrate only if tolerating previous dose well. Hydrate adequately.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, inject as soon as possible within 5 days.',
  },
  {
    label: 'Escalation - Weeks 9-12 · 1 mg',
    phase: 'escalation',
    weekRange: '9-12',
    targetDose: '1 mg',
    sig: 'Inject 1 mg (1 mL / 100 units) subcutaneously once weekly. Continue lifestyle counseling. Monitor fasting glucose if diabetic.',
    quantity: '1',
    refills: '0',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, inject as soon as possible within 5 days.',
  },
  {
    label: 'Maintenance - 1.7 mg',
    phase: 'maintenance',
    targetDose: '1.7 mg',
    sig: 'Inject 1.7 mg (1.7 mL / 170 units*) subcutaneously once weekly for weight maintenance. Continue diet and exercise program. *Note: May require two draws with a 100-unit syringe.',
    quantity: '1',
    refills: '2',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, inject as soon as possible within 5 days.',
  },
  {
    label: 'Maximum - 2.4 mg',
    phase: 'maintenance',
    targetDose: '2.4 mg',
    sig: 'Inject 2.4 mg (2.4 mL / 240 units*) subcutaneously once weekly. Maximum dose for weight management. Monitor for efficacy and tolerance. *Note: Requires multiple draws with a 100-unit syringe.',
    quantity: '1',
    refills: '2',
    daysSupply: 28,
    storage: STORAGE_PRESETS.REFRIGERATED_GLP1,
    administration: ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
    warnings: WARNINGS_PRESETS.GLP1,
    missedDose: 'If a dose is missed, inject as soon as possible within 5 days.',
  },
];

export const TESTOSTERONE_ENHANCED_TEMPLATES: EnhancedSigTemplate[] = [
  {
    label: 'Standard - 100 mg Weekly',
    phase: 'standard',
    targetDose: '100 mg',
    sig: 'Inject 100 mg (0.5 mL / 50 units) intramuscularly or subcutaneously once weekly. Rotate injection sites between gluteal, deltoid, or vastus lateralis muscles.',
    quantity: '10',
    refills: '1',
    daysSupply: 70,
    storage: STORAGE_PRESETS.TESTOSTERONE,
    administration: ADMINISTRATION_PRESETS.INTRAMUSCULAR,
    warnings: WARNINGS_PRESETS.TESTOSTERONE,
    missedDose: 'If a dose is missed, inject as soon as remembered. Do not double dose. Continue weekly schedule from the new injection date.',
  },
  {
    label: 'Standard - 200 mg Biweekly',
    phase: 'standard',
    targetDose: '200 mg',
    sig: 'Inject 200 mg (1 mL / 100 units) intramuscularly every 10-14 days as directed. Rotate injection sites.',
    quantity: '10',
    refills: '1',
    daysSupply: 100,
    storage: STORAGE_PRESETS.TESTOSTERONE,
    administration: ADMINISTRATION_PRESETS.INTRAMUSCULAR,
    warnings: WARNINGS_PRESETS.TESTOSTERONE,
    missedDose: 'If a dose is missed, inject as soon as remembered and resume biweekly schedule from that date.',
  },
  {
    label: 'TRT - 50 mg Twice Weekly',
    phase: 'standard',
    targetDose: '50 mg x 2',
    sig: 'Inject 50 mg (0.25 mL / 25 units) subcutaneously twice weekly (e.g., Monday and Thursday) for stable testosterone levels. Use insulin syringe.',
    quantity: '10',
    refills: '2',
    daysSupply: 70,
    storage: STORAGE_PRESETS.TESTOSTERONE,
    administration: {
      ...ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
      route: 'Subcutaneous injection',
      timing: 'Twice weekly, 3-4 days apart (e.g., Monday/Thursday)',
    },
    warnings: WARNINGS_PRESETS.TESTOSTERONE,
    missedDose: 'If a dose is missed, inject as soon as remembered. Maintain 3-4 day spacing between doses.',
  },
  {
    label: 'Low Dose - 80 mg Weekly',
    phase: 'standard',
    targetDose: '80 mg',
    sig: 'Inject 80 mg (0.4 mL / 40 units) subcutaneously once weekly. Lower dose for patients with elevated hematocrit or sensitive to testosterone.',
    quantity: '10',
    refills: '2',
    daysSupply: 87,
    storage: STORAGE_PRESETS.TESTOSTERONE,
    administration: {
      ...ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1,
      route: 'Subcutaneous injection',
      timing: 'Once weekly, same day each week',
    },
    warnings: WARNINGS_PRESETS.TESTOSTERONE,
    missedDose: 'If a dose is missed, inject as soon as remembered. Do not double dose.',
  },
];

export const ENCLOMIPHENE_ENHANCED_TEMPLATES: EnhancedSigTemplate[] = [
  {
    label: 'Standard - 25 mg Daily',
    phase: 'standard',
    targetDose: '25 mg',
    sig: 'Take 1 capsule (25 mg) by mouth each morning with or without food. Used for testosterone optimization.',
    quantity: '30',
    refills: '2',
    daysSupply: 30,
    storage: STORAGE_PRESETS.ROOM_TEMPERATURE,
    administration: ADMINISTRATION_PRESETS.ORAL_DAILY,
    warnings: {
      commonSideEffects: [
        'Headache',
        'Hot flashes',
        'Mood changes',
        'Acne',
        'Visual disturbances (rare)',
      ],
      monitoring: [
        'Total testosterone - every 4-6 weeks initially',
        'LH and FSH levels',
        'Estradiol levels',
      ],
    },
    missedDose: 'If a dose is missed, take as soon as remembered unless close to next dose. Do not double dose.',
  },
  {
    label: 'Pulse - 5 days on / 2 days off',
    phase: 'standard',
    targetDose: '25 mg pulse',
    sig: 'Take 1 capsule (25 mg) by mouth daily Monday through Friday, then hold on the weekend. Resume Monday.',
    quantity: '20',
    refills: '2',
    daysSupply: 28,
    storage: STORAGE_PRESETS.ROOM_TEMPERATURE,
    administration: {
      ...ADMINISTRATION_PRESETS.ORAL_DAILY,
      timing: 'Monday through Friday, skip Saturday and Sunday',
    },
    warnings: {
      commonSideEffects: ['Headache', 'Hot flashes', 'Mood changes'],
      monitoring: ['Testosterone levels', 'LH/FSH', 'Estradiol'],
    },
    missedDose: 'If a weekday dose is missed, skip it and continue the next weekday. Keep weekend break.',
  },
  {
    label: 'Low Dose - 12.5 mg Daily',
    phase: 'standard',
    targetDose: '12.5 mg',
    sig: 'Take 1 capsule (12.5 mg) by mouth each morning. Lower dose for sensitive patients or maintenance.',
    quantity: '30',
    refills: '2',
    daysSupply: 30,
    storage: STORAGE_PRESETS.ROOM_TEMPERATURE,
    administration: ADMINISTRATION_PRESETS.ORAL_DAILY,
    warnings: {
      commonSideEffects: ['Headache', 'Hot flashes'],
      monitoring: ['Testosterone levels every 6-8 weeks'],
    },
    missedDose: 'If a dose is missed, take as soon as remembered. Do not double dose.',
  },
];

export const ANASTROZOLE_ENHANCED_TEMPLATES: EnhancedSigTemplate[] = [
  {
    label: '0.5 mg Twice Weekly',
    phase: 'standard',
    targetDose: '0.5 mg',
    sig: 'Take 1 capsule (0.5 mg) by mouth every Monday and Thursday to manage estradiol levels. Take with or without food.',
    quantity: '24',
    refills: '1',
    daysSupply: 84,
    storage: STORAGE_PRESETS.ROOM_TEMPERATURE,
    administration: {
      ...ADMINISTRATION_PRESETS.ORAL_DAILY,
      timing: 'Twice weekly (Monday and Thursday) at the same times',
    },
    warnings: WARNINGS_PRESETS.AROMATASE_INHIBITOR,
    missedDose: 'If a dose is missed, take as soon as remembered unless next dose is within 2 days. Do not double dose.',
  },
  {
    label: '0.25 mg Three Times Weekly',
    phase: 'standard',
    targetDose: '0.25 mg',
    sig: 'Take 1 capsule (0.25 mg) by mouth every Monday, Wednesday, and Friday. Lower dose for estradiol management.',
    quantity: '40',
    refills: '1',
    daysSupply: 90,
    storage: STORAGE_PRESETS.ROOM_TEMPERATURE,
    administration: {
      ...ADMINISTRATION_PRESETS.ORAL_DAILY,
      timing: 'Three times weekly (Monday, Wednesday, Friday)',
    },
    warnings: WARNINGS_PRESETS.AROMATASE_INHIBITOR,
    missedDose: 'If a dose is missed, skip and take next scheduled dose. Do not double dose.',
  },
];

export const SERMORELIN_ENHANCED_TEMPLATES: EnhancedSigTemplate[] = [
  {
    label: 'Nightly - 0.3 mg',
    phase: 'standard',
    targetDose: '0.3 mg',
    sig: 'Inject 0.3 mg (0.15 mL / 15 units) subcutaneously nightly before bed on an empty stomach (at least 2-3 hours after last meal).',
    quantity: '1',
    refills: '1',
    daysSupply: 30,
    storage: STORAGE_PRESETS.REFRIGERATED_PEPTIDE,
    administration: {
      ...ADMINISTRATION_PRESETS.SUBCUTANEOUS_PEPTIDE,
      timing: 'Nightly at bedtime, on an empty stomach for maximum GH release',
    },
    warnings: {
      ...WARNINGS_PRESETS.PEPTIDE,
      commonSideEffects: [
        'Injection site reactions',
        'Flushing',
        'Headache',
        'Vivid dreams',
        'Increased hunger initially',
      ],
    },
    missedDose: 'If a dose is missed, skip it and resume the next evening. Do not double dose.',
  },
  {
    label: '5 Nights Weekly',
    phase: 'standard',
    targetDose: '0.3 mg x 5',
    sig: 'Inject 0.3 mg (0.15 mL / 15 units) subcutaneously nightly Monday through Friday before bed on an empty stomach. Hold on weekends.',
    quantity: '1',
    refills: '1',
    daysSupply: 30,
    storage: STORAGE_PRESETS.REFRIGERATED_PEPTIDE,
    administration: {
      ...ADMINISTRATION_PRESETS.SUBCUTANEOUS_PEPTIDE,
      timing: 'Monday through Friday at bedtime. Take weekends off for receptor sensitivity.',
    },
    warnings: WARNINGS_PRESETS.PEPTIDE,
    missedDose: 'If a weeknight dose is missed, skip it. Do not make up missed doses.',
  },
  {
    label: 'Low Dose - 0.2 mg Nightly',
    phase: 'standard',
    targetDose: '0.2 mg',
    sig: 'Inject 0.2 mg (0.1 mL / 10 units) subcutaneously nightly before bed on an empty stomach. Lower starting dose.',
    quantity: '1',
    refills: '1',
    daysSupply: 45,
    storage: STORAGE_PRESETS.REFRIGERATED_PEPTIDE,
    administration: {
      ...ADMINISTRATION_PRESETS.SUBCUTANEOUS_PEPTIDE,
      timing: 'Nightly at bedtime, on an empty stomach',
    },
    warnings: WARNINGS_PRESETS.PEPTIDE,
    missedDose: 'If a dose is missed, skip it and resume the next evening. Do not double dose.',
  },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get enhanced templates for a medication by key
 */
export function getEnhancedTemplates(medicationKey: string): EnhancedSigTemplate[] | null {
  const med = MEDS[medicationKey];
  if (!med) return null;
  
  const name = med.name.toLowerCase();
  
  // Match by medication name
  if (name.includes('tirzepatide')) {
    return TIRZEPATIDE_ENHANCED_TEMPLATES;
  }
  if (name.includes('semaglutide')) {
    return SEMAGLUTIDE_ENHANCED_TEMPLATES;
  }
  if (name.includes('testosterone')) {
    return TESTOSTERONE_ENHANCED_TEMPLATES;
  }
  if (name.includes('enclomiphene')) {
    return ENCLOMIPHENE_ENHANCED_TEMPLATES;
  }
  if (name.includes('anastrozole')) {
    return ANASTROZOLE_ENHANCED_TEMPLATES;
  }
  if (name.includes('sermorelin')) {
    return SERMORELIN_ENHANCED_TEMPLATES;
  }
  
  return null;
}

/**
 * Get default storage info based on medication form
 */
export function getDefaultStorage(form: string): StorageInfo {
  switch (form) {
    case 'INJ':
      return STORAGE_PRESETS.REFRIGERATED_GLP1;
    case 'TAB':
    case 'CAP':
    case 'TROCHE':
      return STORAGE_PRESETS.ROOM_TEMPERATURE;
    case 'CREAM':
    case 'GEL':
      return {
        text: 'Store at room temperature 68-77°F (20-25°C). Keep container tightly closed.',
        temperature: 'room-temperature',
        temperatureRange: '68-77°F (20-25°C)',
      };
    default:
      return STORAGE_PRESETS.ROOM_TEMPERATURE;
  }
}

/**
 * Get default administration info based on medication form
 */
export function getDefaultAdministration(form: string): AdministrationInfo {
  switch (form) {
    case 'INJ':
      return ADMINISTRATION_PRESETS.SUBCUTANEOUS_GLP1;
    case 'TAB':
    case 'CAP':
      return ADMINISTRATION_PRESETS.ORAL_DAILY;
    case 'TROCHE':
      return {
        route: 'Sublingual (under tongue)',
        timing: 'Allow to dissolve completely under tongue. Do not chew or swallow.',
        specialTechnique: 'Place under tongue and let dissolve for 15-30 minutes. Do not eat or drink during this time.',
      };
    case 'CREAM':
    case 'GEL':
      return ADMINISTRATION_PRESETS.TOPICAL;
    default:
      return ADMINISTRATION_PRESETS.ORAL_DAILY;
  }
}

/**
 * Build a comprehensive sig string from enhanced template sections
 */
export function buildComprehensiveSig(
  template: EnhancedSigTemplate,
  options: {
    includeStorage?: boolean;
    includeAdministration?: boolean;
    includeWarnings?: boolean;
    includeMissedDose?: boolean;
  } = {}
): string {
  const {
    includeStorage = false,
    includeAdministration = false,
    includeWarnings = false,
    includeMissedDose = false,
  } = options;
  
  let sig = template.sig;
  
  if (includeStorage && template.storage) {
    sig += ` STORAGE: ${template.storage.text}`;
  }
  
  if (includeAdministration && template.administration) {
    const admin = template.administration;
    if (admin.timing) {
      sig += ` TIMING: ${admin.timing}`;
    }
    if (admin.sites && admin.sites.length > 0) {
      sig += ` INJECTION SITES: ${admin.sites.join(', ')}.`;
    }
  }
  
  if (includeWarnings && template.warnings) {
    const warnings = template.warnings;
    if (warnings.emergencySymptoms && warnings.emergencySymptoms.length > 0) {
      sig += ` SEEK MEDICAL ATTENTION FOR: ${warnings.emergencySymptoms.slice(0, 2).join('; ')}.`;
    }
  }
  
  if (includeMissedDose && template.missedDose) {
    sig += ` MISSED DOSE: ${template.missedDose}`;
  }
  
  return sig;
}

/**
 * Get medication category for display
 */
export function getMedicationCategory(medicationKey: string): string {
  const med = MEDS[medicationKey];
  if (!med) return 'Other';
  
  const name = med.name.toLowerCase();
  
  if (name.includes('tirzepatide') || name.includes('semaglutide')) return 'GLP-1';
  if (name.includes('testosterone')) return 'TRT';
  if (name.includes('enclomiphene') || name.includes('anastrozole')) return 'Hormone Support';
  if (name.includes('sermorelin') || name.includes('bpc') || name.includes('tb-500')) return 'Peptide';
  if (name.includes('sildenafil') || name.includes('tadalafil')) return 'ED';
  
  return 'Other';
}
