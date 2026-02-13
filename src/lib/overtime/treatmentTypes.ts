/**
 * Overtime Men's Clinic Treatment Types
 *
 * Defines the 6 treatment categories offered by Overtime Men's Clinic,
 * each corresponding to a separate Airtable table/Heyflow form.
 */

import type { OvertimeTreatmentType } from './types';

// Re-export the type for convenience
export type { OvertimeTreatmentType } from './types';

/**
 * Treatment type constants
 */
export const OVERTIME_TREATMENT_TYPES = {
  WEIGHT_LOSS: 'weight_loss',
  PEPTIDES: 'peptides',
  NAD_PLUS: 'nad_plus',
  BETTER_SEX: 'better_sex',
  TESTOSTERONE: 'testosterone',
  BASELINE_BLOODWORK: 'baseline_bloodwork',
} as const;

/**
 * Treatment type display labels
 */
export const TREATMENT_TYPE_LABELS: Record<OvertimeTreatmentType, string> = {
  weight_loss: 'Weight Loss',
  peptides: 'Peptides',
  nad_plus: 'NAD+',
  better_sex: 'Better Sex',
  testosterone: 'Testosterone Replacement',
  baseline_bloodwork: 'Baseline/Bloodwork',
};

/**
 * Treatment type descriptions
 */
export const TREATMENT_TYPE_DESCRIPTIONS: Record<OvertimeTreatmentType, string> = {
  weight_loss: 'GLP-1 weight loss program with medications like Semaglutide and Tirzepatide',
  peptides: 'Peptide therapy for performance, recovery, and wellness optimization',
  nad_plus: 'NAD+ therapy for energy, cognitive function, and cellular health',
  better_sex: 'Sexual health and ED treatment solutions',
  testosterone: 'Testosterone replacement therapy (TRT) for hormone optimization',
  baseline_bloodwork: 'Comprehensive lab work and baseline health assessment',
};

/**
 * Treatment type tags (for patient records)
 */
export const TREATMENT_TYPE_TAGS: Record<OvertimeTreatmentType, string[]> = {
  weight_loss: ['overtime', 'weight-loss', 'glp1'],
  peptides: ['overtime', 'peptides', 'performance'],
  nad_plus: ['overtime', 'nad-plus', 'wellness'],
  better_sex: ['overtime', 'sexual-health', 'mens-health'],
  testosterone: ['overtime', 'trt', 'hormone-therapy'],
  baseline_bloodwork: ['overtime', 'labs', 'baseline'],
};

/**
 * Map Airtable table names to treatment types
 * These should match the actual Airtable table names/identifiers
 */
export const AIRTABLE_TABLE_TO_TREATMENT: Record<string, OvertimeTreatmentType> = {
  // Direct matches
  weight_loss: 'weight_loss',
  'weight-loss': 'weight_loss',
  weightloss: 'weight_loss',
  'Weight Loss': 'weight_loss',

  peptides: 'peptides',
  Peptides: 'peptides',

  nad_plus: 'nad_plus',
  'nad-plus': 'nad_plus',
  'nad+': 'nad_plus',
  'NAD+': 'nad_plus',
  nadplus: 'nad_plus',
  nad: 'nad_plus',
  NAD: 'nad_plus',

  better_sex: 'better_sex',
  'better-sex': 'better_sex',
  bettersex: 'better_sex',
  'Better Sex': 'better_sex',
  sexual_health: 'better_sex',
  ed: 'better_sex',

  testosterone: 'testosterone',
  trt: 'testosterone',
  'Testosterone Replacement': 'testosterone',
  testosterone_replacement: 'testosterone',
  hormone: 'testosterone',

  baseline_bloodwork: 'baseline_bloodwork',
  'baseline-bloodwork': 'baseline_bloodwork',
  baseline: 'baseline_bloodwork',
  bloodwork: 'baseline_bloodwork',
  labs: 'baseline_bloodwork',
  'Baseline/Bloodwork': 'baseline_bloodwork',
};

/**
 * Detect treatment type from payload
 * Checks multiple fields where the treatment type might be specified
 */
export function detectTreatmentType(payload: Record<string, unknown>): OvertimeTreatmentType {
  // Check explicit treatment type fields
  const explicitType =
    payload['treatmentType'] ||
    payload['treatment-type'] ||
    payload['treatment_type'] ||
    payload['formType'] ||
    payload['form-type'] ||
    payload['form_type'] ||
    payload['source_table'] ||
    payload['sourceTable'] ||
    payload['table'];

  if (explicitType && typeof explicitType === 'string') {
    const normalized = explicitType.toLowerCase().trim();
    if (normalized in AIRTABLE_TABLE_TO_TREATMENT) {
      return AIRTABLE_TABLE_TO_TREATMENT[normalized];
    }
    // Direct match check
    if (Object.values(OVERTIME_TREATMENT_TYPES).includes(normalized as OvertimeTreatmentType)) {
      return normalized as OvertimeTreatmentType;
    }
  }

  // Heuristic detection based on field presence
  // Weight Loss indicators (including Airtable exact field names)
  if (
    payload['glp1-last-30'] ||
    payload['glp1-experience'] ||
    payload['goal-weight'] ||
    payload['weight-loss-motivation'] ||
    // Airtable exact field names for OT Mens - Weight Loss
    payload['GLP-1 History'] ||
    payload['Type of GLP-1'] ||
    payload['Semaglutide Dose'] ||
    payload['Semaglutide Side Effects'] ||
    payload['Semaglutide Success'] ||
    payload['Tirzepatide Dose'] ||
    payload['Tirzepatide Side Effects'] ||
    payload['Tirzepatide Success'] ||
    payload['Happy with GLP-1 Dose'] ||
    payload['ideal weight'] ||
    payload['starting weight'] ||
    payload['How would your life change by losing weight'] ||
    payload['Personalized Treatment'] ||
    payload['Neoplasia type 2 (MEN 2)'] ||
    payload['Thyroid Cancer'] ||
    payload['Pancreatitis'] ||
    payload['Gastroparesis']
  ) {
    return 'weight_loss';
  }

  // Peptides indicators
  if (payload['peptide-experience'] || payload['peptide-goals'] || payload['preferred-peptide']) {
    return 'peptides';
  }

  // NAD+ indicators
  if (payload['nad-experience'] || payload['cognitive-goals'] || payload['iv-experience']) {
    return 'nad_plus';
  }

  // Better Sex indicators (including Airtable exact field names)
  if (
    payload['ed-history'] ||
    payload['ed-severity'] ||
    payload['libido-level'] ||
    payload['performance-anxiety'] ||
    // Airtable exact field names for OT Mens - Better Sex
    payload['How often do these sexual issues occur?'] ||
    payload['How long have you notice'] ||
    payload['meds with nitrates or nitroglycerin'] ||
    payload['Chest Pains'] ||
    payload['Heart condition'] ||
    payload['Physical Active'] ||
    payload['Smoke/Nicotine']
  ) {
    return 'better_sex';
  }

  // Testosterone indicators
  if (
    payload['trt-symptoms'] ||
    payload['previous-trt'] ||
    payload['testosterone-level'] ||
    payload['free-testosterone']
  ) {
    return 'testosterone';
  }

  // Bloodwork indicators
  if (payload['lab-location'] || payload['fasting-available'] || payload['reason-for-labs']) {
    return 'baseline_bloodwork';
  }

  // Default to weight loss (most common)
  return 'weight_loss';
}

/**
 * Get tags for a treatment type
 */
export function getTagsForTreatment(treatmentType: OvertimeTreatmentType): string[] {
  return TREATMENT_TYPE_TAGS[treatmentType] || ['overtime'];
}

/**
 * Check if a value represents a completed checkout
 */
export function isCheckoutComplete(payload: Record<string, unknown>): boolean {
  const checkoutFields = [
    'Checkout Completed',
    'checkout-completed',
    'checkoutCompleted',
    'paid',
    'payment_status',
    'paymentStatus',
  ];

  for (const field of checkoutFields) {
    const value = payload[field];
    if (
      value === true ||
      value === 'true' ||
      value === 'Yes' ||
      value === 'yes' ||
      value === '1' ||
      value === 'paid' ||
      value === 'completed'
    ) {
      return true;
    }
  }

  return false;
}
