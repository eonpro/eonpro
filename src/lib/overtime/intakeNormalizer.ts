/**
 * Overtime Men's Clinic Intake Normalizer
 *
 * Normalizes intake form data from 6 different treatment-specific Heyflow forms
 * received via Airtable automation.
 *
 * This normalizer is EXCLUSIVELY for the Overtime Men's Clinic (subdomain: ot).
 */

import { US_STATE_OPTIONS } from '@/lib/usStates';
import type {
  IntakeSection,
  NormalizedIntake,
  NormalizedPatient,
  OvertimePayload,
  OvertimeTreatmentType,
} from './types';
import {
  detectTreatmentType,
  TREATMENT_TYPE_LABELS,
  getTagsForTreatment,
  isCheckoutComplete,
} from './treatmentTypes';
import { logger } from '@/lib/logger';
import {
  smartParseAddress,
  normalizeState as normalizeStateFromLib,
  normalizeZip,
} from '@/lib/address';

// Re-export types and utilities for convenience
export type { IntakeSection, NormalizedIntake, NormalizedPatient } from './types';
export { detectTreatmentType, isCheckoutComplete } from './treatmentTypes';

const STATE_CODE_SET = new Set(US_STATE_OPTIONS.map((state: any) => state.value.toUpperCase()));
const STATE_NAME_TO_CODE = US_STATE_OPTIONS.reduce<Record<string, string>>((acc, state) => {
  acc[state.label.toUpperCase()] = state.value.toUpperCase();
  return acc;
}, {});

/**
 * Field labels for common intake fields
 * Includes EXACT Airtable field names for OT Mens clinic
 */
const COMMON_FIELD_LABELS: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════
  // SUBMISSION METADATA
  // ═══════════════════════════════════════════════════════════════════
  'submission-id': 'Submission ID',
  'submission-date': 'Submission Date',
  'Response ID': 'Response ID',
  'Heyflow ID': 'Heyflow ID',
  'A/B Test ID': 'A/B Test ID',
  'A/B Test Version': 'A/B Test Version',
  URL: 'Source URL',
  'URL with parameters': 'Full URL with Parameters',
  'IntakeQ Client ID': 'IntakeQ Client ID',
  'IntakeQ Status': 'IntakeQ Status',

  // ═══════════════════════════════════════════════════════════════════
  // PATIENT IDENTITY (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'First name': 'First Name',
  'first name': 'First Name',
  'first-name': 'First Name',
  'Last name': 'Last Name',
  'last name': 'Last Name',
  'last-name': 'Last Name',
  email: 'Email',
  Email: 'Email',
  'phone number': 'Phone Number',
  'Phone number': 'Phone Number',
  phone: 'Phone Number',
  DOB: 'Date of Birth',
  dob: 'Date of Birth',
  Gender: 'Gender',
  gender: 'Gender',
  sex: 'Biological Sex',
  State: 'State',
  state: 'State',

  // ═══════════════════════════════════════════════════════════════════
  // ADDRESS (Airtable bracket notation)
  // ═══════════════════════════════════════════════════════════════════
  Address: 'Full Address',
  'Address [Street]': 'Street Address',
  'Address [house]': 'House Number',
  'Address [City]': 'City',
  'Address [State]': 'State',
  'Address [Country]': 'Country',
  'Address [Zip]': 'ZIP Code',
  'apartment#': 'Apartment/Unit #',

  // ═══════════════════════════════════════════════════════════════════
  // BODY METRICS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  // Height fields - all variations
  'Height [feet]': 'Height (feet)',
  'Height [feet] ': 'Height (feet)',
  'height [feet]': 'Height (feet)',
  'Height [Feet]': 'Height (feet)',
  'Height (feet)': 'Height (feet)',
  'Height (Feet)': 'Height (feet)',
  Feet: 'Height (feet)',
  feet: 'Height (feet)',
  'feet ': 'Height (feet)',

  'Height [inches]': 'Height (inches)',
  'Height [inches] ': 'Height (inches)',
  'height [inches]': 'Height (inches)',
  'Height [Inches]': 'Height (inches)',
  'Height (inches)': 'Height (inches)',
  'Height (Inches)': 'Height (inches)',
  Inches: 'Height (inches)',
  inches: 'Height (inches)',
  'inches ': 'Height (inches)',

  Height: 'Height',
  height: 'Height',
  'height ': 'Height',

  // Weight fields - all variations
  'starting weight': 'Starting Weight (lbs)',
  'starting weight ': 'Starting Weight (lbs)',
  'Starting weight': 'Starting Weight (lbs)',
  'Starting Weight': 'Starting Weight (lbs)',
  'Starting Weight ': 'Starting Weight (lbs)',
  'start weight': 'Starting Weight (lbs)',

  'current weight': 'Current Weight (lbs)',
  'Current weight': 'Current Weight (lbs)',
  'Current Weight': 'Current Weight (lbs)',
  'Current Weight ': 'Current Weight (lbs)',
  weight: 'Current Weight (lbs)',
  Weight: 'Current Weight (lbs)',
  'Weight ': 'Current Weight (lbs)',
  'current-weight': 'Current Weight (lbs)',

  'ideal weight': 'Ideal/Goal Weight (lbs)',
  'ideal weight ': 'Ideal/Goal Weight (lbs)',
  'Ideal weight': 'Ideal/Goal Weight (lbs)',
  'Ideal Weight': 'Ideal/Goal Weight (lbs)',
  'Ideal Weight ': 'Ideal/Goal Weight (lbs)',
  'goal weight': 'Goal Weight (lbs)',
  'Goal weight': 'Goal Weight (lbs)',
  'Goal Weight': 'Goal Weight (lbs)',
  'Goal Weight ': 'Goal Weight (lbs)',
  'target weight': 'Target Weight (lbs)',
  'Target Weight': 'Target Weight (lbs)',
  bmi: 'BMI',
  BMI: 'BMI',
  'BMI ': 'BMI',
  Bmi: 'BMI',

  // ═══════════════════════════════════════════════════════════════════
  // MEDICAL HISTORY (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  Allergies: 'Allergies',
  allergies: 'Allergies',
  'Which allergies': 'Allergy Details',
  Conditions: 'Medical Conditions',
  conditions: 'Medical Conditions',
  Cancer: 'Cancer History',
  'Chronic Kidney Disease': 'Chronic Kidney Disease',
  'B12 Deficiency': 'B12 Deficiency',
  Bloodowrk: 'Bloodwork Status', // Note: typo in Airtable
  Bloodwork: 'Bloodwork Status',
  'health-conditions': 'Health Conditions',
  'medical-conditions': 'Medical Conditions',

  // ═══════════════════════════════════════════════════════════════════
  // MEDICATIONS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'List of medications': 'List of Medications',
  'Medications [current]': 'Current Medications',
  'Prescription Medications': 'Prescription Medications',
  'current-medications': 'Current Medications',

  // ═══════════════════════════════════════════════════════════════════
  // LIFESTYLE (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  Drinking: 'Alcohol Consumption',
  'Activity Level': 'Activity Level',

  // ═══════════════════════════════════════════════════════════════════
  // TREATMENT GOALS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  goals: 'Treatment Goals',
  Goals: 'Treatment Goals',
  'Peptide choice': 'Preferred Peptide',
  'What are you looking to Optimize?': 'Optimization Goals',
  Symptoms: 'Current Symptoms',
  symptoms: 'Current Symptoms',

  // ═══════════════════════════════════════════════════════════════════
  // TRT-SPECIFIC FIELDS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'Allergic to': 'Allergic To (Details)',
  'List of Allergies': 'List of Allergies',
  'Blood Pressure': 'Blood Pressure',
  bloodwork: 'Bloodwork Status',
  'Chronic Conditions': 'Chronic Conditions',
  'Lab Results': 'Lab Results (Attachment)',
  'List of medications, vitamins, supplements': 'Medications, Vitamins & Supplements',
  'Medications, vitamins, Supplements': 'Current Medications & Supplements',
  'Specific Medications': 'Specific Medications',
  'Main Results to acchive': 'Main Results to Achieve', // Note: typo in Airtable
  'Main Results to achieve': 'Main Results to Achieve',
  'Previous Therapies (Hormone, Pept, GLP1)': 'Previous Hormone/Peptide Therapies',
  'Self Administration': 'Self Administration Preference',

  // ═══════════════════════════════════════════════════════════════════
  // WEIGHT LOSS SPECIFIC FIELDS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  // Note: 'ideal weight' and 'BMI' already defined above in Body Metrics section

  // Medical History - Weight Loss
  'Allergy Type': 'Allergy Type',
  'Chronic Illness': 'Chronic Illness',
  'Specific Chronic Illness': 'Specific Chronic Illness',
  'Type of Chronic Illness': 'Type of Chronic Illness',
  'Family History Diagnoses': 'Family History Diagnoses',
  Gastroparesis: 'Gastroparesis',
  'Thyroid Cancer': 'Thyroid Cancer History',
  'Neoplasia type 2 (MEN 2)': 'MEN2 Syndrome (Contraindication)',
  Pancreatitis: 'Pancreatitis History',
  'Type 2 Diabetes': 'Type 2 Diabetes',
  'Mental Health': 'Mental Health Status',
  'Mental health Diagnosis': 'Mental Health Diagnosis',

  // Medications - Weight Loss
  'Medications / Supplements': 'Current Medications/Supplements',
  'Which Medication /Supplement': 'Medication/Supplement Details',

  // Lifestyle - Weight Loss
  'Alcohol Use': 'Alcohol Use',

  // GLP-1 History
  'GLP-1 History': 'GLP-1 Experience',
  'Happy with GLP-1 Dose': 'Satisfied with Current GLP-1 Dose',
  'Type of GLP-1': 'Type of GLP-1 Used',

  // Semaglutide Specific
  'Semaglutide Dose': 'Semaglutide Dose',
  'Semaglutide Side Effects': 'Semaglutide Side Effects',
  'Semaglutide Success': 'Semaglutide Success/Results',

  // Tirzepatide Specific
  'Tirzepatide Dose': 'Tirzepatide Dose',
  'Tirzepatide Side Effects': 'Tirzepatide Side Effects',
  'Tirzepatide Success': 'Tirzepatide Success/Results',

  // Side Effects & History
  'Side Effect History': 'Side Effect History',

  // Weight Loss Goals
  'How would your life change by losing weight': 'Weight Loss Motivation',
  'Personalized Treatment': 'Personalized Treatment Preference',
  'Qualifying Conditions': 'Qualifying Conditions',

  // Surgery
  'Past surgery': 'Past Surgery',
  'Surgery Type': 'Surgery Type',

  // Pregnancy (Contraindication)
  'Pregnant or Breastfeeding': 'Pregnant or Breastfeeding',

  // ═══════════════════════════════════════════════════════════════════
  // REFERRAL & MARKETING (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'How did you hear about us?': 'How Did You Hear About Us?',
  'Who reccomended OT Mens Health to you?': 'Affiliate Code', // Note: typo in Peptide Airtable - this contains the affiliate code
  'Who recommended OT Mens Health to you?': 'Affiliate Code', // Correct spelling in TRT - this contains the affiliate code
  'Who Recommended Us?': 'Affiliate Code',
  Referrer: 'Referrer',
  // Promo codes
  'promo-code': 'Promo Code',
  promoCode: 'Promo Code',
  'Promo Code': 'Promo Code',
  'PROMO CODE': 'Promo Code',
  // Influencer codes
  'influencer-code': 'Influencer Code',
  influencerCode: 'Influencer Code',
  'Influencer Code': 'Influencer Code',
  'INFLUENCER CODE': 'Influencer Code',
  // Affiliate codes
  'affiliate-code': 'Affiliate Code',
  affiliateCode: 'Affiliate Code',
  'Affiliate Code': 'Affiliate Code',
  'AFFILIATE CODE': 'Affiliate Code',
  // Partner codes
  'partner-code': 'Affiliate Code',
  partnerCode: 'Affiliate Code',
  'Partner Code': 'Affiliate Code',
  'PARTNER CODE': 'Affiliate Code',
  // Referral codes
  'referral-code': 'Referral Code',
  referralCode: 'Referral Code',
  'REFERRAL CODE': 'Referral Code',

  // ═══════════════════════════════════════════════════════════════════
  // CONSENT (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  '18+ Consent': 'Age Verification (18+)',
  'Consent Forms': 'Consent Forms Signed',
  'marketing consent': 'Marketing Consent',
  'hipaa-agreement': 'HIPAA Agreement',
  'Checkout Completed': 'Checkout Completed',
};

/**
 * Treatment-specific field labels
 */
const TREATMENT_FIELD_LABELS: Record<OvertimeTreatmentType, Record<string, string>> = {
  weight_loss: {
    'goal-weight': 'Goal Weight (lbs)',
    'glp1-experience': 'GLP-1 Experience',
    'glp1-last-30': 'Used GLP-1 in Last 30 Days',
    'glp1-medication-type': 'GLP-1 Medication Type',
    'glp1-dose': 'Current GLP-1 Dose',
    'preferred-meds': 'Preferred Medication',
    'medication-preference': 'Medication Preference',
    'injections-tablets': 'Injection vs Tablet Preference',
    'weight-loss-motivation': 'Weight Loss Motivation',
    'weight-loss-history': 'Weight Loss History',
    'diet-history': 'Diet History',
    'men2-history': 'MEN2 History (Contraindication)',
    'thyroid-cancer': 'Thyroid Cancer History',
    pancreatitis: 'Pancreatitis History',
    gastroparesis: 'Gastroparesis',
    'bariatric-surgery': 'Previous Bariatric Surgery',
  },
  peptides: {
    'peptide-experience': 'Peptide Experience',
    'previous-peptides': 'Previous Peptides Used',
    'current-peptides': 'Current Peptides',
    'peptide-goals': 'Treatment Goals',
    'primary-goal': 'Primary Goal',
    'injection-comfort': 'Injection Comfort Level',
    'injection-experience': 'Injection Experience',
    'preferred-peptide': 'Preferred Peptide',
    'recent-labs': 'Recent Lab Work',
  },
  nad_plus: {
    'nad-experience': 'NAD+ Experience',
    'previous-nad': 'Previous NAD+ Treatment',
    'iv-experience': 'IV Therapy Experience',
    'energy-level': 'Current Energy Level',
    'cognitive-goals': 'Cognitive Enhancement Goals',
    'recovery-goals': 'Recovery Goals',
    'anti-aging-goals': 'Anti-Aging Goals',
    'preferred-protocol': 'Preferred Treatment Protocol',
    'treatment-frequency': 'Desired Treatment Frequency',
    'chronic-fatigue': 'Chronic Fatigue',
    'brain-fog': 'Brain Fog',
    'sleep-quality': 'Sleep Quality',
  },
  better_sex: {
    'ed-history': 'ED History',
    'ed-duration': 'Duration of ED',
    'ed-severity': 'ED Severity',
    'ed-onset': 'ED Onset',
    'libido-level': 'Libido Level',
    'performance-anxiety': 'Performance Anxiety',
    'relationship-status': 'Relationship Status',
    'previous-ed-meds': 'Previous ED Medications',
    'viagra-experience': 'Viagra Experience',
    'cialis-experience': 'Cialis Experience',
    'preferred-medication': 'Preferred Medication',
    'frequency-needed': 'Frequency Needed',
    'cardiovascular-health': 'Cardiovascular Health',
    'blood-pressure': 'Blood Pressure',
    'nitrate-use': 'Nitrate Use (Contraindication)',
  },
  testosterone: {
    'trt-symptoms': 'TRT Symptoms Checklist',
    'fatigue-level': 'Fatigue Level',
    'muscle-loss': 'Muscle Loss',
    'libido-changes': 'Libido Changes',
    'mood-changes': 'Mood Changes',
    'brain-fog': 'Brain Fog',
    'sleep-issues': 'Sleep Issues',
    'weight-gain': 'Weight Gain',
    'previous-trt': 'Previous TRT Experience',
    'current-trt': 'Currently on TRT',
    'trt-duration': 'Duration on TRT',
    'trt-type': 'TRT Type',
    'injection-frequency': 'Injection Frequency',
    'recent-testosterone-level': 'Recent Testosterone Level',
    'free-testosterone': 'Free Testosterone',
    'total-testosterone': 'Total Testosterone',
    'estradiol-level': 'Estradiol Level',
    'psa-level': 'PSA Level',
    hematocrit: 'Hematocrit',
    'preferred-administration': 'Preferred Administration Method',
    'prostate-history': 'Prostate History',
    'heart-disease': 'Heart Disease',
    'blood-clot-history': 'Blood Clot History',
    'sleep-apnea': 'Sleep Apnea',
    'fertility-concerns': 'Fertility Concerns',
  },
  baseline_bloodwork: {
    'lab-location': 'Preferred Lab Location',
    'preferred-lab': 'Preferred Lab Company',
    'fasting-available': 'Fasting Available',
    'preferred-time': 'Preferred Appointment Time',
    'mobile-phlebotomy': 'Mobile Phlebotomy Interest',
    'reason-for-labs': 'Reason for Labs',
    symptoms: 'Current Symptoms',
    'treatment-interest': 'Treatment Interest',
    'last-lab-date': 'Last Lab Date',
    'previous-lab-results': 'Previous Lab Results',
    'has-recent-labs': 'Has Recent Labs',
    'insurance-coverage': 'Insurance Coverage',
    'self-pay': 'Self Pay',
  },
};

/**
 * Normalize Overtime intake payload
 *
 * @param payload - Raw payload from Airtable webhook
 * @returns Normalized intake data with treatment type
 */
export function normalizeOvertimePayload(
  payload: Record<string, unknown>
): NormalizedIntake & { treatmentType: OvertimeTreatmentType } {
  logger.debug('[Overtime Normalizer] Processing payload', {
    keys: Object.keys(payload || {}).slice(0, 15),
    hasSubmissionId: !!(payload?.['submission-id'] || payload?.submissionId),
  });

  // Detect treatment type from payload
  const treatmentType = detectTreatmentType(payload);
  logger.info('[Overtime Normalizer] Detected treatment type', { treatmentType });

  // Extract submission metadata
  const submissionId = String(
    payload['submission-id'] ||
      payload.submissionId ||
      payload.submission_id ||
      `overtime-${treatmentType}-${Date.now()}`
  );

  const submittedAtValue =
    payload['submission-date'] || payload.submittedAt || payload.createdAt || Date.now();
  const submittedAt = new Date(submittedAtValue as string | number | Date);

  // Build sections from payload
  const sections = buildOvertimeSections(payload as OvertimePayload, treatmentType);

  // Flatten entries for answers array
  const flatEntries = sections.flatMap((section) =>
    section.entries.map((entry) => ({ ...entry, section: section.title }))
  );

  // Build patient from payload
  const patient = buildOvertimePatient(payload as OvertimePayload);

  logger.info('[Overtime Normalizer] Normalized patient', {
    name: `${patient.firstName} ${patient.lastName}`,
    email: patient.email,
    state: patient.state,
    treatmentType,
    fieldsExtracted: flatEntries.length,
  });

  return {
    submissionId,
    submittedAt,
    patient,
    sections,
    answers: flatEntries,
    treatmentType,
  };
}

/**
 * Build intake sections from Overtime payload based on treatment type
 */
function buildOvertimeSections(
  payload: OvertimePayload,
  treatmentType: OvertimeTreatmentType
): IntakeSection[] {
  const sections: IntakeSection[] = [];

  // ═══════════════════════════════════════════════════════════════════
  // AIRTABLE FIELD DEFINITIONS - Exact field names from OT Mens Airtable
  // ═══════════════════════════════════════════════════════════════════

  // Patient Identity (both Airtable exact + legacy formats)
  const patientIdentityFields = [
    // Airtable exact names
    'First name',
    'Last name',
    'email',
    'phone number',
    'DOB',
    'Gender',
    'State',
    // Legacy/alternative formats
    'first-name',
    'firstName',
    'last-name',
    'lastName',
    'Email',
    'phone',
    'Phone',
    'dob',
    'dateOfBirth',
    'sex',
    'gender',
    'state',
  ];

  // Address Fields (Airtable bracket notation)
  const addressFields = [
    'Address',
    'Address [Street]',
    'Address [house]',
    'Address [City]',
    'Address [State]',
    'Address [Country]',
    'Address [Zip]',
    'apartment#',
    // Legacy formats
    'address',
    'address1',
    'address2',
    'city',
    'zip',
    'zipCode',
  ];

  // Body Metrics (Airtable exact + legacy - All treatments)
  const bodyMetricsFields = [
    // Airtable exact names
    // Height - all variations
    'Height [feet]',
    'Height [feet] ',
    'height [feet]',
    'Height [Feet]',
    'Height (feet)',
    'Height (Feet)',
    'Feet',
    'feet',
    'feet ',
    'Height [inches]',
    'Height [inches] ',
    'height [inches]',
    'Height [Inches]',
    'Height (inches)',
    'Height (Inches)',
    'Inches',
    'inches',
    'inches ',
    'Height',
    'height',
    'height ',
    // Weight - all variations
    'starting weight',
    'starting weight ',
    'Starting weight',
    'Starting Weight',
    'Starting Weight ',
    'current weight',
    'Current weight',
    'Current Weight',
    'Current Weight ',
    'weight',
    'Weight',
    'Weight ',
    'ideal weight',
    'ideal weight ',
    'Ideal weight',
    'Ideal Weight',
    'Ideal Weight ',
    'goal weight',
    'Goal weight',
    'Goal Weight',
    'Goal Weight ',
    'target weight',
    'Target Weight',
    // BMI - all variations
    'BMI',
    'BMI ',
    'bmi',
    'Bmi',
  ];

  // Medical History (Airtable exact names - All treatments)
  // Note: Some Airtable fields have trailing spaces
  const medicalHistoryFields = [
    // Airtable exact names (shared) - with and without trailing spaces
    'Allergies',
    'Allergies ',
    'Which allergies',
    'Conditions',
    'Cancer',
    'Cancer ',
    'Chronic Kidney Disease',
    'Chronic Kidney Disease ',
    'B12 Deficiency',
    'Bloodowrk',
    'Bloodwork',
    // TRT-specific
    'Allergic to',
    'List of Allergies',
    'Chronic Conditions',
    'Blood Pressure',
    'bloodwork',
    // Weight Loss specific
    'Allergy Type',
    'Chronic Illness',
    'Specific Chronic Illness',
    'Type of Chronic Illness',
    'Family History Diagnoses',
    'Gastroparesis',
    'Thyroid Cancer',
    'Neoplasia type 2 (MEN 2)',
    'Pancreatitis',
    'Type 2 Diabetes',
    'Mental Health',
    'Mental health Diagnosis',
    // Legacy formats
    'allergies',
    'health-conditions',
    'medical-conditions',
    'conditions',
  ];

  // Medications (Airtable exact names - All treatments)
  const medicationsFields = [
    // Airtable exact names (shared)
    'List of medications',
    'Medications [current]',
    'Prescription Medications',
    // TRT-specific
    'List of medications, vitamins, supplements',
    'Medications, vitamins, Supplements',
    'Specific Medications',
    // Weight Loss specific
    'Medications / Supplements',
    'Which Medication /Supplement',
    // Legacy formats
    'current-medications',
    'medications',
  ];

  // Lifestyle (Airtable exact names - All treatments)
  const lifestyleFields = [
    'Drinking',
    'Activity Level',
    // Weight Loss specific
    'Alcohol Use',
    // Legacy formats
    'drinking',
    'activity-level',
    'exercise-frequency',
  ];

  // Referral & Marketing (Airtable exact names)
  const referralFields = [
    // Airtable exact names (both spelling variants)
    'How did you hear about us?',
    'Who reccomended OT Mens Health to you?', // Peptide table (typo)
    'Who recommended OT Mens Health to you?', // TRT table (correct)
    'Who Recommended Us?',
    'Referrer',
    // Promo codes & Affiliate codes
    'promo-code',
    'promoCode',
    'Promo Code',
    'PROMO CODE',
    'influencer-code',
    'influencerCode',
    'Influencer Code',
    'INFLUENCER CODE',
    'affiliate-code',
    'affiliateCode',
    'Affiliate Code',
    'AFFILIATE CODE',
    'partner-code',
    'partnerCode',
    'Partner Code',
    'PARTNER CODE',
    'referral-code',
    'referralCode',
    'Referral Code',
    'REFERRAL CODE',
  ];

  // Consent Fields (Airtable exact names)
  // Note: Some Airtable fields have trailing spaces
  const consentFields = [
    // Airtable exact names - with and without trailing spaces
    '18+ Consent',
    'Consent Forms',
    'Consent Forms ',
    'marketing consent',
    // Legacy formats
    'hipaa-agreement',
    'terms-agreement',
    'consent',
    'Checkout Completed',
    'checkout-completed',
    'paid',
  ];

  // Metadata Fields (to exclude from "Additional Information")
  const metadataFields = [
    'Response ID',
    'Heyflow ID',
    'A/B Test ID',
    'A/B Test Version',
    'URL',
    'URL with parameters',
    'IntakeQ Client ID',
    'IntakeQ Status',
    'submission-id',
    'submissionId',
    'submission_id',
    'submission-date',
    'submittedAt',
    'createdAt',
    'treatmentType',
    'treatment-type',
    'treatment_type',
  ];

  // ═══════════════════════════════════════════════════════════════════
  // TREATMENT-SPECIFIC FIELD GROUPS
  // ═══════════════════════════════════════════════════════════════════
  const treatmentFieldGroups: Record<OvertimeTreatmentType, string[][]> = {
    weight_loss: [
      // Weight Goals (Airtable exact)
      ['ideal weight', 'goal-weight', 'ideal-weight', 'target-weight'],
      // GLP-1 History & Experience (Airtable exact)
      ['GLP-1 History', 'Happy with GLP-1 Dose', 'Type of GLP-1'],
      // Semaglutide Experience (Airtable exact)
      ['Semaglutide Dose', 'Semaglutide Side Effects', 'Semaglutide Success'],
      // Tirzepatide Experience (Airtable exact)
      ['Tirzepatide Dose', 'Tirzepatide Side Effects', 'Tirzepatide Success'],
      // Side Effects
      ['Side Effect History'],
      // Weight Loss Goals & Motivation (Airtable exact)
      [
        'How would your life change by losing weight',
        'Personalized Treatment',
        'Qualifying Conditions',
      ],
      // Surgery History (Airtable exact)
      ['Past surgery', 'Surgery Type'],
      // Contraindications (Airtable exact)
      [
        'Pregnant or Breastfeeding',
        'Neoplasia type 2 (MEN 2)',
        'Thyroid Cancer',
        'Pancreatitis',
        'Gastroparesis',
      ],
      // Legacy formats
      ['glp1-experience', 'glp1-last-30', 'glp1-medication-type', 'glp1-dose', 'previous-glp1'],
      ['preferred-meds', 'medication-preference', 'injections-tablets'],
      ['weight-loss-motivation', 'weight-loss-history', 'diet-history', 'exercise-frequency'],
    ],
    peptides: [
      // Treatment Goals & Preferences (Airtable exact)
      ['goals', 'Goals', 'Peptide choice', 'What are you looking to Optimize?'],
      // Symptoms (with and without trailing space)
      ['Symptoms', 'Symptoms ', 'symptoms'],
      // Legacy formats
      ['peptide-experience', 'previous-peptides', 'current-peptides'],
      ['injection-comfort', 'injection-experience', 'preferred-peptide'],
      ['recent-labs', 'lab-date'],
    ],
    nad_plus: [
      ['nad-experience', 'previous-nad', 'iv-experience', 'NAD+ Experience'],
      ['energy-level', 'cognitive-goals', 'recovery-goals', 'anti-aging-goals'],
      ['preferred-protocol', 'treatment-frequency'],
      ['chronic-fatigue', 'brain-fog', 'sleep-quality'],
    ],
    better_sex: [
      ['ed-history', 'ed-duration', 'ed-severity', 'ed-onset', 'ED History'],
      ['libido-level', 'performance-anxiety', 'relationship-status'],
      ['previous-ed-meds', 'viagra-experience', 'cialis-experience'],
      ['preferred-medication', 'frequency-needed'],
      ['cardiovascular-health', 'blood-pressure', 'nitrate-use', 'diabetes'],
    ],
    testosterone: [
      // Treatment Goals (Airtable exact)
      ['Main Results to acchive', 'Main Results to achieve', 'goals', 'Goals'],
      // Previous Therapies
      ['Previous Therapies (Hormone, Pept, GLP1)', 'previous-trt', 'current-trt', 'trt-duration'],
      // Lab Results
      [
        'Lab Results',
        'recent-testosterone-level',
        'free-testosterone',
        'total-testosterone',
        'estradiol-level',
        'psa-level',
        'hematocrit',
      ],
      // Administration Preferences
      [
        'Self Administration',
        'preferred-administration',
        'injection-comfort',
        'trt-type',
        'injection-frequency',
      ],
      // Legacy symptom fields
      [
        'trt-symptoms',
        'fatigue-level',
        'muscle-loss',
        'libido-changes',
        'mood-changes',
        'brain-fog',
        'sleep-issues',
        'weight-gain',
      ],
      // Legacy contraindications
      [
        'prostate-history',
        'heart-disease',
        'blood-clot-history',
        'sleep-apnea',
        'fertility-concerns',
      ],
    ],
    baseline_bloodwork: [
      ['lab-location', 'preferred-lab', 'fasting-available', 'preferred-time', 'mobile-phlebotomy'],
      ['reason-for-labs', 'symptoms', 'treatment-interest'],
      ['last-lab-date', 'previous-lab-results', 'has-recent-labs'],
      ['insurance-coverage', 'self-pay'],
    ],
  };

  // Helper to get field value - handles fields with trailing spaces
  const getFieldValue = (fieldName: string): unknown => {
    // Try exact match first
    if (payload[fieldName as keyof OvertimePayload] !== undefined) {
      return payload[fieldName as keyof OvertimePayload];
    }
    // Try with trailing space (common Airtable issue)
    if (payload[(fieldName + ' ') as keyof OvertimePayload] !== undefined) {
      return payload[(fieldName + ' ') as keyof OvertimePayload];
    }
    // Try without trailing space
    const trimmed = fieldName.trim();
    if (payload[trimmed as keyof OvertimePayload] !== undefined) {
      return payload[trimmed as keyof OvertimePayload];
    }
    return undefined;
  };

  // Helper to create section entries
  const createEntries = (fields: string[]): IntakeSection['entries'] => {
    return fields
      .filter((field) => {
        const value = getFieldValue(field);
        return value !== undefined && value !== null && value !== '';
      })
      .map((field) => {
        const treatmentLabels = TREATMENT_FIELD_LABELS[treatmentType] || {};
        const label =
          COMMON_FIELD_LABELS[field] || treatmentLabels[field] || formatFieldLabel(field);
        return {
          id: field,
          label,
          value: formatValue(getFieldValue(field)),
          rawValue: getFieldValue(field),
        };
      });
  };

  // ═══════════════════════════════════════════════════════════════════
  // BUILD SECTIONS IN ORDER
  // ═══════════════════════════════════════════════════════════════════

  // 1. Patient Information
  const patientEntries = createEntries(patientIdentityFields);
  if (patientEntries.length > 0) {
    sections.push({ title: 'Patient Information', entries: patientEntries });
  }

  // 2. Address
  const addressEntries = createEntries(addressFields);
  if (addressEntries.length > 0) {
    sections.push({ title: 'Address', entries: addressEntries });
  }

  // 3. Body Metrics
  const bodyEntries = createEntries(bodyMetricsFields);
  if (bodyEntries.length > 0) {
    sections.push({ title: 'Body Metrics', entries: bodyEntries });
  }

  // 4. Medical History
  const medicalEntries = createEntries(medicalHistoryFields);
  if (medicalEntries.length > 0) {
    sections.push({ title: 'Medical History', entries: medicalEntries });
  }

  // 5. Current Medications
  const medicationsEntries = createEntries(medicationsFields);
  if (medicationsEntries.length > 0) {
    sections.push({ title: 'Current Medications', entries: medicationsEntries });
  }

  // 6. Lifestyle
  const lifestyleEntries = createEntries(lifestyleFields);
  if (lifestyleEntries.length > 0) {
    sections.push({ title: 'Lifestyle', entries: lifestyleEntries });
  }

  // 7. Treatment-specific sections
  const treatmentLabel = TREATMENT_TYPE_LABELS[treatmentType];
  const treatmentGroups = treatmentFieldGroups[treatmentType] || [];

  const sectionNames: Record<OvertimeTreatmentType, string[]> = {
    weight_loss: [
      'Weight Goals',
      'GLP-1 History',
      'Semaglutide Experience',
      'Tirzepatide Experience',
      'Side Effects',
      'Motivation & Goals',
      'Surgery History',
      'Contraindications',
      'GLP-1 Legacy',
      'Medication Preferences',
      'Diet & Exercise',
    ],
    peptides: [
      'Treatment Goals',
      'Current Symptoms',
      'Peptide Experience',
      'Injection Preferences',
      'Lab Work',
    ],
    nad_plus: ['NAD+ Experience', 'Treatment Goals', 'Preferences', 'Health Assessment'],
    better_sex: [
      'ED History',
      'Current Status',
      'Previous Treatments',
      'Preferences',
      'Health Factors',
    ],
    testosterone: [
      'Treatment Goals',
      'Previous Therapies',
      'Lab Results',
      'Administration Preferences',
      'Symptoms',
      'Contraindications',
    ],
    baseline_bloodwork: ['Lab Preferences', 'Health Assessment', 'Previous Labs', 'Payment'],
  };

  treatmentGroups.forEach((fields, index) => {
    const entries = createEntries(fields);
    if (entries.length > 0) {
      const sectionName =
        sectionNames[treatmentType]?.[index] || `${treatmentLabel} Information ${index + 1}`;
      sections.push({ title: sectionName, entries });
    }
  });

  // 8. Referral & Marketing
  const referralEntries = createEntries(referralFields);
  if (referralEntries.length > 0) {
    sections.push({ title: 'Referral & Marketing', entries: referralEntries });
  }

  // 9. Consent & Checkout
  const consentEntries = createEntries(consentFields);
  if (consentEntries.length > 0) {
    sections.push({ title: 'Consent & Checkout', entries: consentEntries });
  }

  // 10. Any remaining fields (Additional Information)
  const allKnownFields = new Set([
    ...patientIdentityFields,
    ...addressFields,
    ...bodyMetricsFields,
    ...medicalHistoryFields,
    ...medicationsFields,
    ...lifestyleFields,
    ...referralFields,
    ...consentFields,
    ...metadataFields,
    ...treatmentGroups.flat(),
  ]);

  const otherFields = Object.keys(payload).filter((key) => !allKnownFields.has(key));
  const otherEntries = createEntries(otherFields);
  if (otherEntries.length > 0) {
    sections.push({ title: 'Additional Information', entries: otherEntries });
  }

  return sections;
}

/**
 * Split a full name into first and last name
 */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // Handle common patterns: "First Last", "First Middle Last", "First M. Last"
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}

/**
 * Build patient data from Overtime payload
 */
function buildOvertimePatient(payload: OvertimePayload): NormalizedPatient {
  // Log all incoming keys for debugging field mapping issues
  const payloadKeys = Object.keys(payload || {});
  logger.info('[Overtime Normalizer] Building patient from payload', {
    totalKeys: payloadKeys.length,
    keys: payloadKeys.slice(0, 30), // First 30 keys for debugging
    // Log specific field presence for patient data
    hasName: payloadKeys.some((k) => k.toLowerCase().includes('name')),
    hasEmail: payloadKeys.some((k) => k.toLowerCase().includes('email')),
    hasPhone: payloadKeys.some((k) => k.toLowerCase().includes('phone')),
    hasDob: payloadKeys.some(
      (k) => k.toLowerCase().includes('dob') || k.toLowerCase().includes('birth')
    ),
    hasState: payloadKeys.some((k) => k.toLowerCase().includes('state')),
    hasAddress: payloadKeys.some((k) => k.toLowerCase().includes('address')),
  });

  const patient: NormalizedPatient = {
    firstName: 'Unknown',
    lastName: 'Unknown',
    email: 'unknown@example.com',
    phone: '',
    dob: '',
    gender: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
  };

  // First Name (check Airtable exact names + variations)
  // Airtable uses: "First name" (with space, lowercase 'n')
  const firstName =
    payload['First name'] ||
    payload['first name'] ||
    payload['First Name'] ||
    payload['first-name'] ||
    payload['firstName'] ||
    payload['first_name'] ||
    payload['fname'] ||
    payload['fName'] ||
    payload['FIRST NAME'];
  if (firstName) {
    patient.firstName = capitalizeWords(String(firstName));
  }

  // Last Name (check Airtable exact names + variations)
  // Airtable uses: "Last name" (with space, lowercase 'n')
  const lastName =
    payload['Last name'] ||
    payload['last name'] ||
    payload['Last Name'] ||
    payload['last-name'] ||
    payload['lastName'] ||
    payload['last_name'] ||
    payload['lname'] ||
    payload['lName'] ||
    payload['LAST NAME'];
  if (lastName) {
    patient.lastName = capitalizeWords(String(lastName));
  }

  // If first/last names are still Unknown, try full name fields
  if (patient.firstName === 'Unknown' || patient.lastName === 'Unknown') {
    // Check for Heyflow-style "Whats your name" field first (common in OT forms)
    const fullName =
      payload['whats-your-name'] ||
      payload['whats_your_name'] ||
      payload['Whats your name'] ||
      payload['whatsYourName'] ||
      payload['your-name'] ||
      payload['your_name'] ||
      payload['Your Name'] ||
      payload['name'] ||
      payload['Name'] ||
      payload['full-name'] ||
      payload['fullName'] ||
      payload['full_name'] ||
      payload['Full Name'] ||
      payload['customer-name'] ||
      payload['customerName'] ||
      payload['customer_name'] ||
      payload['patient-name'] ||
      payload['patientName'] ||
      payload['patient_name'] ||
      payload['contact-name'] ||
      payload['contactName'] ||
      payload['contact_name'] ||
      payload['Name (from Contacts)'] ||
      payload['Contact Name'] ||
      payload['Customer Name'] ||
      payload['Patient Name'];

    if (fullName && typeof fullName === 'string' && fullName.trim()) {
      const { firstName: fn, lastName: ln } = splitFullName(fullName);
      if (fn && patient.firstName === 'Unknown') {
        patient.firstName = capitalizeWords(fn);
      }
      if (ln && patient.lastName === 'Unknown') {
        patient.lastName = capitalizeWords(ln);
      }
    }
  }

  // Try to extract names from email if still Unknown (e.g., john.doe@email.com)
  if (patient.firstName === 'Unknown' && patient.lastName === 'Unknown') {
    const emailField = payload['email'] || payload['Email'] || payload['EMAIL'];
    if (emailField && typeof emailField === 'string') {
      const emailParts = emailField.split('@')[0];
      if (emailParts && emailParts.includes('.')) {
        const [fn, ln] = emailParts.split('.');
        if (fn && ln && fn.length > 1 && ln.length > 1) {
          // Only use if both parts look like names (not just numbers/initials)
          if (!/^\d+$/.test(fn) && !/^\d+$/.test(ln)) {
            patient.firstName = capitalizeWords(fn.replace(/[^a-zA-Z]/g, ''));
            patient.lastName = capitalizeWords(ln.replace(/[^a-zA-Z]/g, ''));
            logger.info('[Overtime Normalizer] Extracted name from email', {
              email: emailField,
              firstName: patient.firstName,
              lastName: patient.lastName,
            });
          }
        }
      }
    }
  }

  // Email (check multiple field variations including Heyflow combined fields)
  const emailField =
    payload['email'] ||
    payload['Email'] ||
    payload['EMAIL'] ||
    payload['email-address'] ||
    payload['emailAddress'] ||
    payload['email_address'] ||
    payload['e-mail'] ||
    payload['Email Address'];
  if (emailField) {
    patient.email = String(emailField).trim().toLowerCase();
  }

  // Phone (check Airtable exact names + variations)
  // Airtable uses: "phone number" (lowercase, with space)
  const phoneField =
    payload['phone number'] ||
    payload['Phone number'] ||
    payload['Phone Number'] ||
    payload['phone'] ||
    payload['Phone'] ||
    payload['PHONE'] ||
    payload['phone-number'] ||
    payload['phoneNumber'] ||
    payload['phone_number'] ||
    payload['mobile'] ||
    payload['cell'] ||
    payload['telephone'] ||
    payload['Mobile Number'];
  if (phoneField) {
    patient.phone = sanitizePhone(String(phoneField));
  }

  // Date of Birth (check Heyflow naming: "Date of birth" -> date-of-birth)
  const dob =
    payload['dob'] ||
    payload['DOB'] ||
    payload['dateOfBirth'] ||
    payload['date_of_birth'] ||
    payload['date-of-birth'] ||
    payload['Date of birth'] ||
    payload['Date of Birth'] ||
    payload['birthday'] ||
    payload['birthdate'] ||
    payload['birth-date'] ||
    payload['birth_date'];
  if (dob) {
    patient.dob = normalizeDateInput(String(dob));
  }

  // Gender/Sex (check Heyflow naming)
  const gender =
    payload['sex'] ||
    payload['Sex'] ||
    payload['gender'] ||
    payload['Gender'] ||
    payload['GENDER'] ||
    payload['SEX'];
  if (gender) {
    patient.gender = normalizeGenderInput(String(gender));
  }

  // Address parsing
  // ========================================
  // Priority 1: Try Heyflow address component (id-38a5bae0) which can be JSON
  // ========================================
  let addressParsed = false;

  // Heyflow address component field names
  const heyflowAddressFields = ['id-38a5bae0', 'Address', 'address'] as const;

  for (const field of heyflowAddressFields) {
    const rawAddress = payload[field];
    if (!rawAddress) continue;

    // Check if it's a JSON object with address components
    let addressJson: Record<string, string> | null = null;

    if (typeof rawAddress === 'object' && rawAddress !== null) {
      addressJson = rawAddress as Record<string, string>;
    } else if (typeof rawAddress === 'string') {
      // Try to parse as JSON
      const trimmed = rawAddress.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          addressJson = JSON.parse(trimmed);
        } catch {
          // Not valid JSON, will be handled as combined string below
        }
      }
    }

    if (addressJson) {
      logger.info('[Overtime Normalizer] Found Heyflow address JSON component', {
        field,
        keys: Object.keys(addressJson),
      });

      // Extract street address from JSON
      const street =
        addressJson.street ||
        addressJson.address1 ||
        addressJson.street_1 ||
        addressJson.address ||
        addressJson.Street ||
        addressJson.line1;
      const house = addressJson.house || addressJson.house_number || addressJson.House;
      const apt =
        addressJson.apartment ||
        addressJson.apt ||
        addressJson.unit ||
        addressJson.suite ||
        addressJson.Apartment ||
        addressJson.address2;
      const city = addressJson.city || addressJson.City;
      const state = addressJson.state_code || addressJson.state || addressJson.State;
      const zip =
        addressJson.zip ||
        addressJson.zip_code ||
        addressJson.postal_code ||
        addressJson.zipcode ||
        addressJson.postalCode ||
        addressJson.Zip;
      const formattedAddress =
        addressJson.formattedAddress ||
        addressJson.formatted_address ||
        addressJson.full_address ||
        addressJson.fullAddress;

      // Compose street address
      const composedStreet = [house, street].filter(Boolean).join(' ').trim();
      if (composedStreet) {
        patient.address1 = composedStreet;
      } else if (formattedAddress) {
        // Parse the formatted address
        const parsed = smartParseAddress(formattedAddress);
        patient.address1 = parsed.address1 || '';
        patient.address2 = parsed.address2 || apt || '';
        patient.city = parsed.city || city || '';
        patient.state = parsed.state || (state ? normalizeStateInput(String(state)) : '');
        patient.zip = parsed.zip || (zip ? normalizeZip(String(zip)) : '');
        addressParsed = true;
        break;
      }

      if (apt) patient.address2 = String(apt).trim();
      if (city) patient.city = String(city).trim();
      if (state) patient.state = normalizeStateInput(String(state));
      if (zip) patient.zip = normalizeZip(String(zip));

      if (patient.address1 || patient.city || patient.state || patient.zip) {
        addressParsed = true;
        logger.info('[Overtime Normalizer] Address extracted from Heyflow JSON', {
          address1: patient.address1,
          city: patient.city,
          state: patient.state,
          zip: patient.zip,
        });
        break;
      }
    }
  }

  // ========================================
  // Priority 2: Try combined address strings
  // ========================================
  if (!addressParsed) {
    const combinedAddressFields = [
      'shipping_address',
      'billing_address',
      'address',
      'Address',
    ] as const;

    for (const field of combinedAddressFields) {
      const rawAddress = payload[field];
      if (rawAddress && typeof rawAddress === 'string' && rawAddress.trim()) {
        // Skip if it looks like just a state code
        if (rawAddress.trim().length <= 2) continue;

        logger.debug('[Overtime Normalizer] Parsing combined address string', {
          field,
          rawAddressLength: rawAddress.length,
          preview: rawAddress.substring(0, 50),
        });

        const parsed = smartParseAddress(rawAddress);

        if (parsed.address1 || parsed.city || parsed.state || parsed.zip) {
          patient.address1 = parsed.address1 || '';
          patient.address2 = parsed.address2 || '';
          patient.city = parsed.city || '';
          patient.state = parsed.state || '';
          patient.zip = parsed.zip || '';
          addressParsed = true;
          logger.info('[Overtime Normalizer] Address parsed from combined string', {
            address1: patient.address1,
            city: patient.city,
            state: patient.state,
            zip: patient.zip,
          });
          break;
        }
      }
    }
  }

  // ========================================
  // Priority 3: Try Heyflow address sub-fields (id-38a5bae0-*)
  // ========================================
  if (!addressParsed) {
    const heyflowStreet = payload['id-38a5bae0-street'] || payload['id-38a5bae0-Street'];
    const heyflowHouse = payload['id-38a5bae0-house'] || payload['id-38a5bae0-House'];
    const heyflowCity = payload['id-38a5bae0-city'] || payload['id-38a5bae0-City'];
    const heyflowState =
      payload['id-38a5bae0-state_code'] ||
      payload['id-38a5bae0-state'] ||
      payload['id-38a5bae0-State'];
    const heyflowZip =
      payload['id-38a5bae0-zip'] ||
      payload['id-38a5bae0-zip_code'] ||
      payload['id-38a5bae0-postal_code'] ||
      payload['id-38a5bae0-Zip'];
    const heyflowApt = payload['id-0d142f9e'] || payload['apartment#'];

    if (heyflowStreet || heyflowCity || heyflowState || heyflowZip) {
      const composedStreet = [heyflowHouse, heyflowStreet].filter(Boolean).join(' ').trim();
      if (composedStreet) patient.address1 = String(composedStreet);
      if (heyflowApt) patient.address2 = String(heyflowApt).trim();
      if (heyflowCity) patient.city = String(heyflowCity).trim();
      if (heyflowState) patient.state = normalizeStateInput(String(heyflowState));
      if (heyflowZip) patient.zip = normalizeZip(String(heyflowZip));

      addressParsed = !!(patient.address1 || patient.city || patient.zip);
      if (addressParsed) {
        logger.info('[Overtime Normalizer] Address extracted from Heyflow sub-fields', {
          address1: patient.address1,
          city: patient.city,
          state: patient.state,
          zip: patient.zip,
        });
      }
    }
  }

  // ========================================
  // Priority 4: Try Airtable bracket notation and legacy individual fields
  // ========================================
  if (!addressParsed) {
    // Street address
    const street =
      payload['Address [Street]'] ||
      payload['Address [street]'] ||
      payload['address1'] ||
      payload['street_address'] ||
      payload['street'];
    if (street) {
      patient.address1 = String(street).trim();
    }

    // House number (Airtable specific)
    const house = payload['Address [house]'] || payload['Address [House]'];
    if (house && patient.address1) {
      patient.address1 = `${house} ${patient.address1}`;
    } else if (house) {
      patient.address1 = String(house).trim();
    }

    // Apartment
    const apt =
      payload['apartment#'] || payload['apartment'] || payload['address2'] || payload['apt'];
    if (apt) {
      patient.address2 = String(apt).trim();
    }

    // City
    const city =
      payload['Address [City]'] || payload['Address [city]'] || payload['city'] || payload['City'];
    if (city) {
      patient.city = String(city).trim();
    }

    // Zip
    const zip =
      payload['Address [Zip]'] ||
      payload['Address [zip]'] ||
      payload['zip'] ||
      payload['zipCode'] ||
      payload['zip_code'] ||
      payload['Zip'];
    if (zip) {
      patient.zip = normalizeZip(String(zip));
    }

    // State from address (Airtable specific)
    const addressState = payload['Address [State]'] || payload['Address [state]'];
    if (addressState && !patient.state) {
      patient.state = normalizeStateInput(String(addressState));
    }
  }

  // State - handle separately with Heyflow variations
  // Heyflow field: "Select the state you live in" -> select-the-state-you-live-in
  const stateField =
    payload['state'] ||
    payload['State'] ||
    payload['STATE'] ||
    payload['select-the-state-you-live-in'] ||
    payload['select_the_state_you_live_in'] ||
    payload['Select the state you live in'] ||
    payload['state-you-live-in'] ||
    payload['your-state'] ||
    payload['yourState'] ||
    payload['your_state'] ||
    payload['residence-state'] ||
    payload['residenceState'];
  if (stateField) {
    const stateValue = String(stateField).trim();
    if (!patient.state || patient.state === '') {
      patient.state = normalizeStateInput(stateValue);
    }
  }

  // Final state normalization
  if (patient.state) {
    patient.state = normalizeStateFromLib(patient.state);
  }

  // Height/Weight - store in notes or additional fields if available
  // Airtable uses: "Height [feet]", "Height [inches]", "starting weight"
  const heightFeet =
    payload['Height [feet]'] ||
    payload['Height [feet] '] ||
    payload['height [feet]'] ||
    payload['Height [Feet]'] ||
    payload['Height (feet)'] ||
    payload['Height (Feet)'] ||
    payload['Feet'] ||
    payload['feet'] ||
    payload['feet '];

  const heightInches =
    payload['Height [inches]'] ||
    payload['Height [inches] '] ||
    payload['height [inches]'] ||
    payload['Height [Inches]'] ||
    payload['Height (inches)'] ||
    payload['Height (Inches)'] ||
    payload['Inches'] ||
    payload['inches'] ||
    payload['inches '];

  const weight =
    payload['starting weight'] ||
    payload['starting weight '] ||
    payload['Starting weight'] ||
    payload['Starting Weight'] ||
    payload['Starting Weight '] ||
    payload['current weight'] ||
    payload['Current weight'] ||
    payload['Current Weight'] ||
    payload['Current Weight '] ||
    payload['weight'] ||
    payload['Weight'] ||
    payload['Weight '];

  const bmi = payload['BMI'] || payload['BMI '] || payload['bmi'] || payload['Bmi'];

  // Log height/weight/BMI for debugging (these could be added to patient metadata later)
  if (heightFeet || heightInches || weight || bmi) {
    logger.debug('[Overtime Normalizer] Height/Weight/BMI data found', {
      heightFeet,
      heightInches,
      weight,
      bmi,
    });
  }

  // Log extracted patient data for debugging
  logger.info('[Overtime Normalizer] Patient data extracted', {
    firstName: patient.firstName,
    lastName: patient.lastName,
    email: patient.email !== 'unknown@example.com' ? '(provided)' : '(missing)',
    phone: patient.phone ? '(provided)' : '(missing)',
    dob: patient.dob ? '(provided)' : '(missing)',
    gender: patient.gender || '(missing)',
    state: patient.state || '(missing)',
    hasAddress: !!(patient.address1 || patient.city || patient.zip),
  });

  return patient;
}

/**
 * Try to extract an affiliate ref code from a URL.
 * Handles:
 *  - Path-based:  https://ot.eonpro.io/affiliate/TEAMSAV  -> TEAMSAV
 *  - Query-based: https://trt.otmens.com/?ref=TEAMSAV      -> TEAMSAV
 *  - Hash-based:  https://example.com/#ref=TEAMSAV          -> TEAMSAV
 * Returns null if the URL doesn't contain an affiliate code.
 */
function extractRefCodeFromUrl(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);

    // Check path: /affiliate/CODE
    const pathMatch = parsed.pathname.match(/\/affiliate\/([A-Za-z0-9_-]+)/);
    if (pathMatch?.[1]) {
      return pathMatch[1].toUpperCase();
    }

    // Check query param: ?ref=CODE
    const refParam = parsed.searchParams.get('ref');
    if (refParam && refParam.trim().length > 0) {
      return refParam.trim().toUpperCase();
    }

    // Check hash: #ref=CODE  (some forms pass via hash fragment)
    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const hashRef = hashParams.get('ref');
      if (hashRef && hashRef.trim().length > 0) {
        return hashRef.trim().toUpperCase();
      }
    }
  } catch {
    // Not a valid URL — that's fine, will be handled as regular text
  }
  return null;
}

/**
 * Extract promo/influencer/affiliate code from payload.
 * Checks multiple field names used by different intake forms.
 *
 * IMPORTANT: If a field value is a URL (e.g. referrer URL from the intake page),
 * we try to parse the affiliate ref code from the URL path or query params.
 * This captures visitors who clicked through /affiliate/CODE landing pages.
 */
export function extractPromoCode(payload: Record<string, unknown>): string | null {
  // -----------------------------------------------------------------------
  // PHASE 1 (HIGHEST PRIORITY): URL-based detection.
  //
  // URLs are machine-generated and CANNOT contain typos. When a visitor
  // clicks through an affiliate landing page (/affiliate/CODE), the intake
  // form URL carries ?ref=CODE automatically. This is the most reliable
  // source of truth for attribution and ALWAYS takes priority over
  // human-typed promo codes.
  //
  // Checks: "URL with parameters", "URL", "Referrer" and their variants.
  // Also checks with trailing spaces (common in Airtable exports).
  // -----------------------------------------------------------------------
  const urlFieldBases = [
    // Heyflow / Airtable URL fields (highest signal for affiliate attribution)
    'URL with parameters',
    'url with parameters',
    'URL With Parameters',
    'urlWithParameters',
    'url_with_parameters',
    'Url With Parameters',
    // The base URL field (may also carry ?ref=)
    'URL',
    'url',
    'sourceUrl',
    'source_url',
    'page_url',
    'pageUrl',
    // Referrer (usually just domain, but sometimes has /affiliate/CODE path)
    'Referrer',
    'referrer',
    'referrer_url',
    'referrerUrl',
  ];

  // Also try each field with trailing space (common in Airtable)
  const urlFields: string[] = [];
  for (const base of urlFieldBases) {
    urlFields.push(base);
    urlFields.push(`${base} `);     // trailing space
    urlFields.push(` ${base}`);     // leading space
    urlFields.push(`${base}  `);    // double trailing space
  }

  for (const field of urlFields) {
    const value = payload[field];
    if (value && typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const refCodeFromUrl = extractRefCodeFromUrl(trimmed);
        if (refCodeFromUrl) {
          return refCodeFromUrl;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // PHASE 1.5: DEEP SCAN — Check nested objects (Heyflow native webhooks
  // wrap data in `data`, `tracking`, `metadata` etc.)
  // -----------------------------------------------------------------------
  const nestedContainers = ['data', 'tracking', 'metadata', 'fields', 'record', 'properties'];
  for (const containerKey of nestedContainers) {
    const container = payload[containerKey];
    if (container && typeof container === 'object' && !Array.isArray(container)) {
      const nested = container as Record<string, unknown>;
      for (const field of urlFields) {
        const value = nested[field];
        if (value && typeof value === 'string' && value.trim()) {
          const trimmed = value.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            const refCodeFromUrl = extractRefCodeFromUrl(trimmed);
            if (refCodeFromUrl) {
              return refCodeFromUrl;
            }
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // PHASE 2 (FALLBACK): Scan ALL payload fields — including nested objects
  // — for any string value containing /affiliate/ or ref= to catch
  // non-standard or unexpected field names.
  // Still URL-based, so still reliable — just from an unknown field name.
  // -----------------------------------------------------------------------
  function scanObjectForRefUrls(obj: Record<string, unknown>, depth = 0): string | null {
    if (depth > 3) return null; // Prevent infinite recursion
    for (const [, value] of Object.entries(obj)) {
      if (typeof value === 'string' && (value.includes('/affiliate/') || value.includes('ref='))) {
        const refCode = extractRefCodeFromUrl(value.trim());
        if (refCode) {
          return refCode;
        }
      }
      // Also scan nested objects
      if (value && typeof value === 'object' && !Array.isArray(value) && depth < 3) {
        const nested = scanObjectForRefUrls(value as Record<string, unknown>, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  }

  const phase2Result = scanObjectForRefUrls(payload);
  if (phase2Result) {
    return phase2Result;
  }

  // -----------------------------------------------------------------------
  // PHASE 3 (LAST RESORT): Check human-typed promo / affiliate code fields.
  //
  // These are typed by the patient and may contain typos, but still useful
  // when no URL-based attribution is available (e.g. patient heard about
  // the clinic from an affiliate in person and typed the code manually).
  // -----------------------------------------------------------------------
  const directCodeFields = [
    // Direct promo code fields
    'promo-code',
    'promoCode',
    'promo_code',
    'PROMO CODE',
    'Promo Code',
    // Influencer code fields
    'influencer-code',
    'influencerCode',
    'influencer_code',
    'INFLUENCER CODE',
    'Influencer Code',
    // Affiliate code fields (OT clinic Heyflow forms)
    'affiliate-code',
    'affiliateCode',
    'affiliate_code',
    'AFFILIATE CODE',
    'Affiliate Code',
    // Partner code fields
    'partner-code',
    'partnerCode',
    'partner_code',
    'PARTNER CODE',
    'Partner Code',
    // Referral code fields
    'referral-code',
    'referralCode',
    'referral_code',
    'REFERRAL CODE',
    'Referral Code',
    // Airtable "Who recommended" fields (often contains affiliate code text)
    'Who reccomended OT Mens Health to you?', // Typo in Airtable
    'Who recommended OT Mens Health to you?',
    'Who Recommended Us?',
    'referrer-name',
    'who_recommended',
    'whoRecommended',
  ];

  // Skip generic answers like "Instagram", "Facebook", "Google", etc.
  const genericSources = [
    'instagram',
    'facebook',
    'google',
    'tiktok',
    'youtube',
    'twitter',
    'friend',
    'family',
    'other',
    'n/a',
    'none',
    '-',
  ];

  for (const field of directCodeFields) {
    const value = payload[field];
    if (value && typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();

      // If the value looks like a URL, try to extract an affiliate ref code from it
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const refCodeFromUrl = extractRefCodeFromUrl(trimmed);
        if (refCodeFromUrl) {
          return refCodeFromUrl;
        }
        // URL without affiliate code — skip it (e.g. "https://ot.eonpro.io/")
        continue;
      }

      if (!genericSources.includes(trimmed.toLowerCase())) {
        return trimmed.toUpperCase();
      }
    }
  }

  return null;
}

// ============================================
// Helper Functions
// ============================================

function formatFieldLabel(field: string): string {
  return field
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if a value looks like an Airtable record ID (e.g., "recN2wx0VEVQzs32Y")
 * These are 17-character strings starting with "rec"
 */
function isAirtableRecordId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Airtable record IDs start with "rec" followed by 14 alphanumeric characters
  return /^rec[a-zA-Z0-9]{14}$/.test(value);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    // Filter out Airtable record IDs from arrays
    const filtered = value.filter((v) => !isAirtableRecordId(v));
    return filtered.map(formatValue).join(', ');
  }
  if (value === null || value === undefined) {
    return '';
  }
  // Skip Airtable record IDs - they're not useful display values
  if (isAirtableRecordId(value)) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function normalizeStateInput(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const normalizedUpper = trimmed.toUpperCase();

  if (STATE_CODE_SET.has(normalizedUpper)) return normalizedUpper;

  const alphaOnly = trimmed
    .replace(/[^a-zA-Z]/g, ' ')
    .trim()
    .toUpperCase();
  if (STATE_CODE_SET.has(alphaOnly)) return alphaOnly;
  if (STATE_NAME_TO_CODE[normalizedUpper]) return STATE_NAME_TO_CODE[normalizedUpper];
  if (STATE_NAME_TO_CODE[alphaOnly]) return STATE_NAME_TO_CODE[alphaOnly];

  const fuzzy = US_STATE_OPTIONS.find((state: any) =>
    alphaOnly.includes(state.label.toUpperCase())
  );
  if (fuzzy) return fuzzy.value.toUpperCase();

  return normalizedUpper.length === 2 ? normalizedUpper : trimmed;
}

function normalizeDateInput(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashParts = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashParts) {
    const [, mm, dd, yyyy] = slashParts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const dashParts = trimmed.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashParts) {
    const [, mm, dd, yyyy] = dashParts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const digits = trimmed.replace(/[^\d]/g, ' ').trim().split(/\s+/);
  if (digits.length === 3) {
    let [first, second, third] = digits;
    if (first.length === 4 && second.length <= 2 && third.length <= 2) {
      return `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
    }
    if (third.length === 4) {
      let month = first;
      let day = second;
      if (parseInt(first, 10) > 12 && parseInt(second, 10) <= 12) {
        month = second;
        day = first;
      }
      return `${third}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return trimmed;
}

function sanitizePhone(value?: string): string {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  return digits;
}

function capitalizeWords(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function normalizeGenderInput(value?: string): string {
  if (!value) return '';
  const lower = value.trim().toLowerCase();

  if (lower === 'f' || lower === 'female' || lower === 'woman') return 'Female';
  if (lower === 'm' || lower === 'male' || lower === 'man') return 'Male';
  if (lower.startsWith('f') || lower.startsWith('w')) return 'Female';
  if (lower.startsWith('m')) return 'Male';

  return value;
}
