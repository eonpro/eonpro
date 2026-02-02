/**
 * Overtime Men's Clinic Intake Normalizer
 *
 * Normalizes intake form data from 6 different treatment-specific Heyflow forms
 * received via Airtable automation.
 *
 * This normalizer is EXCLUSIVELY for the Overtime Men's Clinic (subdomain: ot).
 */

import { US_STATE_OPTIONS } from "@/lib/usStates";
import type { IntakeSection, NormalizedIntake, NormalizedPatient, OvertimePayload, OvertimeTreatmentType } from "./types";
import { detectTreatmentType, TREATMENT_TYPE_LABELS, getTagsForTreatment, isCheckoutComplete } from "./treatmentTypes";
import { logger } from '@/lib/logger';
import {
  smartParseAddress,
  normalizeState as normalizeStateFromLib,
  normalizeZip,
} from '@/lib/address';

// Re-export types and utilities for convenience
export type { IntakeSection, NormalizedIntake, NormalizedPatient } from "./types";
export { detectTreatmentType, isCheckoutComplete } from "./treatmentTypes";

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
  'URL': 'Source URL',
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
  'email': 'Email',
  'Email': 'Email',
  'phone number': 'Phone Number',
  'Phone number': 'Phone Number',
  'phone': 'Phone Number',
  'DOB': 'Date of Birth',
  'dob': 'Date of Birth',
  'Gender': 'Gender',
  'gender': 'Gender',
  'sex': 'Biological Sex',
  'State': 'State',
  'state': 'State',

  // ═══════════════════════════════════════════════════════════════════
  // WEIGHT LOSS - Airtable exact field names (OT Mens - Weight Loss)
  // ═══════════════════════════════════════════════════════════════════
  'ideal weight': 'Ideal Weight (lbs)',
  'starting weight': 'Starting Weight (lbs)',
  'GLP-1 History': 'GLP-1 History',
  'Type of GLP-1': 'Type of GLP-1',
  'Semaglutide Dose': 'Semaglutide Dose',
  'Semaglutide Side Effects': 'Semaglutide Side Effects',
  'Semaglutide Success': 'Semaglutide Success',
  'Tirzepatide Dose': 'Tirzepatide Dose',
  'Tirzepatide Side Effects': 'Tirzepatide Side Effects',
  'Tirzepatide Success': 'Tirzepatide Success',
  'Happy with GLP-1 Dose': 'Happy with GLP-1 Dose',
  'Side Effect History': 'Side Effect History',
  'Thyroid Cancer': 'Thyroid Cancer History',
  'Neoplasia type 2 (MEN 2)': 'MEN2 History (GLP-1 Contraindication)',
  'Pancreatitis': 'Pancreatitis History',
  'Gastroparesis': 'Gastroparesis',
  'Pregnant or Breastfeeding': 'Pregnant or Breastfeeding',
  'Qualifying Conditions': 'Qualifying Conditions',
  'Personalized Treatment': 'Personalized Treatment',
  'How would your life change by losing weight': 'Weight Loss Motivation',
  'Family History Diagnoses': 'Family History Diagnoses',
  'Type 2 Diabetes': 'Type 2 Diabetes',
  'Mental Health': 'Mental Health History',
  'Mental health Diagnosis': 'Mental Health Diagnosis',
  'Chronic Illness': 'Chronic Illness',
  'Specific Chronic Illness': 'Specific Chronic Illness',
  'Type of Chronic Illness': 'Type of Chronic Illness',
  'Past surgery': 'Past Surgery',
  'Surgery Type': 'Surgery Type',
  'Medications / Supplements': 'Medications / Supplements',
  'Which Medication /Supplement': 'Which Medication / Supplement',
  'Alcohol Use': 'Alcohol Use',
  'Allergy Type': 'Allergy Type',

  // ═══════════════════════════════════════════════════════════════════
  // ADDRESS (Airtable bracket notation)
  // ═══════════════════════════════════════════════════════════════════
  'Address': 'Full Address',
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
  'Height [feet]': 'Height (feet)',
  'Height [inches]': 'Height (inches)',
  'feet': 'Height (feet)',
  'inches': 'Height (inches)',
  'height': 'Height',
  'Starting weight': 'Starting Weight (lbs)',
  'weight': 'Current Weight (lbs)',
  'current-weight': 'Current Weight (lbs)',
  'bmi': 'BMI',
  'BMI': 'BMI',

  // ═══════════════════════════════════════════════════════════════════
  // MEDICAL HISTORY (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'Allergies': 'Allergies',
  'allergies': 'Allergies',
  'Which allergies': 'Allergy Details',
  'Conditions': 'Medical Conditions',
  'conditions': 'Medical Conditions',
  'Cancer': 'Cancer History',
  'Chronic Kidney Disease': 'Chronic Kidney Disease',
  'B12 Deficiency': 'B12 Deficiency',
  'Bloodowrk': 'Bloodwork Status',  // Note: typo in Airtable
  'Bloodwork': 'Bloodwork Status',
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
  'Drinking': 'Alcohol Consumption',
  'Activity Level': 'Activity Level',

  // ═══════════════════════════════════════════════════════════════════
  // TREATMENT GOALS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'goals': 'Treatment Goals',
  'Goals': 'Treatment Goals',
  'Peptide choice': 'Preferred Peptide',
  'What are you looking to Optimize?': 'Optimization Goals',
  'Symptoms': 'Current Symptoms',
  'symptoms': 'Current Symptoms',

  // ═══════════════════════════════════════════════════════════════════
  // TRT-SPECIFIC FIELDS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'Allergic to': 'Allergic To (Details)',
  'List of Allergies': 'List of Allergies',
  'Blood Pressure': 'Blood Pressure',
  'bloodwork': 'Bloodwork Status',
  'Chronic Conditions': 'Chronic Conditions',
  'Lab Results': 'Lab Results (Attachment)',
  'List of medications, vitamins, supplements': 'Medications, Vitamins & Supplements',
  'Medications, vitamins, Supplements': 'Current Medications & Supplements',
  'Specific Medications': 'Specific Medications',
  'Main Results to acchive': 'Main Results to Achieve',  // Note: typo in Airtable
  'Main Results to achieve': 'Main Results to Achieve',
  'Previous Therapies (Hormone, Pept, GLP1)': 'Previous Hormone/Peptide Therapies',
  'Self Administration': 'Self Administration Preference',

  // ═══════════════════════════════════════════════════════════════════
  // BASELINE/BLOODWORK-SPECIFIC FIELDS (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'Chronic Disease': 'Chronic Disease',
  'List of disease': 'List of Diseases',
  'Specific Supplements': 'Specific Supplements',
  'changes in body': 'Changes in Body',
  'Health areas insights': 'Health Areas of Interest',
  'Importance of tracking results': 'Importance of Tracking Results',
  'Why Labs': 'Why Labs / Reason for Testing',

  // ═══════════════════════════════════════════════════════════════════
  // REFERRAL & MARKETING (Airtable exact names)
  // ═══════════════════════════════════════════════════════════════════
  'How did you hear about us?': 'How Did You Hear About Us?',
  'Who reccomended OT Mens Health to you?': 'Who Recommended Us?',  // Note: typo in Peptide Airtable
  'Who recommended OT Mens Health to you?': 'Who Recommended Us?',  // Correct spelling in TRT
  'Referrer': 'Referrer',
  'promo-code': 'Promo Code',
  'influencer-code': 'Influencer Code',
  'referral-code': 'Referral Code',
  'affiliate-code': 'Affiliate Code',
  'partner-code': 'Partner Code',
  'PROMO CODE': 'Promo Code',
  'INFLUENCER CODE': 'Influencer Code',
  'AFFILIATE CODE': 'Affiliate Code',
  'PARTNER CODE': 'Partner Code',
  'Affiliate Code': 'Affiliate Code',
  'Partner Code': 'Partner Code',

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
    // Legacy kebab-case fields
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
    'pancreatitis': 'Pancreatitis History',
    'gastroparesis': 'Gastroparesis',
    'bariatric-surgery': 'Previous Bariatric Surgery',

    // ═══════════════════════════════════════════════════════════════════
    // OT Mens - Weight Loss Airtable exact field names (Heyflow ID: uvvNo2JSHPctHpG87s0x)
    // ═══════════════════════════════════════════════════════════════════
    'ideal weight': 'Ideal Weight (lbs)',
    'starting weight': 'Starting Weight (lbs)',
    'GLP-1 History': 'GLP-1 History',
    'Type of GLP-1': 'Type of GLP-1 Medication',
    'Semaglutide Dose': 'Semaglutide Dose',
    'Semaglutide Side Effects': 'Semaglutide Side Effects',
    'Semaglutide Success': 'Semaglutide Success/Effectiveness',
    'Tirzepatide Dose': 'Tirzepatide Dose',
    'Tirzepatide Side Effects': 'Tirzepatide Side Effects',
    'Tirzepatide Success': 'Tirzepatide Success/Effectiveness',
    'Happy with GLP-1 Dose': 'Satisfaction with Current GLP-1 Dose',
    'Side Effect History': 'Side Effect History',
    'Thyroid Cancer': 'Thyroid Cancer History (Contraindication)',
    'Neoplasia type 2 (MEN 2)': 'MEN2 History (GLP-1 Contraindication)',
    'Pancreatitis': 'Pancreatitis History (Contraindication)',
    'Gastroparesis': 'Gastroparesis (Contraindication)',
    'Pregnant or Breastfeeding': 'Pregnant or Breastfeeding (Contraindication)',
    'Qualifying Conditions': 'Qualifying Conditions for Treatment',
    'Personalized Treatment': 'Personalized Treatment Preference',
    'How would your life change by losing weight': 'Weight Loss Motivation & Goals',
    'Family History Diagnoses': 'Family History Diagnoses',
    'Type 2 Diabetes': 'Type 2 Diabetes',
    'Mental Health': 'Mental Health History',
    'Mental health Diagnosis': 'Mental Health Diagnosis',
    'Chronic Illness': 'Chronic Illness',
    'Specific Chronic Illness': 'Specific Chronic Illness',
    'Type of Chronic Illness': 'Type of Chronic Illness',
    'Past surgery': 'Past Surgery History',
    'Surgery Type': 'Surgery Type',
    'Medications / Supplements': 'Current Medications / Supplements',
    'Which Medication /Supplement': 'Which Medication / Supplement',
    'Alcohol Use': 'Alcohol Consumption',
    'Allergy Type': 'Allergy Type',
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
    // Legacy kebab-case fields
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

    // ═══════════════════════════════════════════════════════════════════
    // OT Mens - Better Sex Airtable exact field names (Heyflow ID: 5ypJkFxQN4V4U4PB7R4u)
    // ═══════════════════════════════════════════════════════════════════

    // Symptoms & Duration
    'Symptoms': 'Current Symptoms',
    'How long have you notice': 'Symptom Duration',
    'How often do these sexual issues occur?': 'Symptom Frequency',

    // Treatment Goals
    'goals': 'Treatment Goals',

    // Physical Activity & Lifestyle
    'Physical Active': 'Physical Activity Level',
    'Smoke/Nicotine': 'Smoking/Nicotine Use',

    // Cardiovascular - Critical for ED meds
    'Heart condition': 'Heart Condition (Contraindication)',
    'Chest Pains': 'Chest Pain History',
    'meds with nitrates or nitroglycerin': 'Nitrate Medications (Contraindication)',

    // Chronic Conditions
    'Chronic Disease': 'Chronic Disease',
    'Chronic Illnesses': 'Chronic Illnesses',
    'Specific Conditions': 'Specific Medical Conditions',
    'Cancer': 'Cancer History',

    // Medications
    'Medications': 'Current Medications',
    'List of Medications': 'Medication List',

    // Lab Work
    'Labwork': 'Recent Lab Work',

    // Allergies
    'Which allergies': 'Allergy Details',
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
    'hematocrit': 'Hematocrit',
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
    'symptoms': 'Current Symptoms',
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
export function normalizeOvertimePayload(payload: Record<string, unknown>): NormalizedIntake & { treatmentType: OvertimeTreatmentType } {
  logger.debug("[Overtime Normalizer] Processing payload", {
    keys: Object.keys(payload || {}).slice(0, 15),
    hasSubmissionId: !!(payload?.['submission-id'] || payload?.submissionId),
  });

  // Detect treatment type from payload
  const treatmentType = detectTreatmentType(payload);
  logger.info("[Overtime Normalizer] Detected treatment type", { treatmentType });

  // Extract submission metadata
  const submissionId = String(
    payload['submission-id'] ||
    payload.submissionId ||
    payload.submission_id ||
    `overtime-${treatmentType}-${Date.now()}`
  );

  const submittedAtValue = payload['submission-date'] || payload.submittedAt || payload.createdAt || Date.now();
  const submittedAt = new Date(submittedAtValue as string | number | Date);

  // Build sections from payload
  const sections = buildOvertimeSections(payload as OvertimePayload, treatmentType);

  // Flatten entries for answers array
  const flatEntries = sections.flatMap((section) =>
    section.entries.map((entry) => ({ ...entry, section: section.title }))
  );

  // Build patient from payload
  const patient = buildOvertimePatient(payload as OvertimePayload);

  logger.info("[Overtime Normalizer] Normalized patient", {
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
function buildOvertimeSections(payload: OvertimePayload, treatmentType: OvertimeTreatmentType): IntakeSection[] {
  const sections: IntakeSection[] = [];

  // ═══════════════════════════════════════════════════════════════════
  // AIRTABLE FIELD DEFINITIONS - Exact field names from OT Mens Airtable
  // ═══════════════════════════════════════════════════════════════════

  // Patient Identity (both Airtable exact + legacy formats)
  const patientIdentityFields = [
    // Airtable exact names
    'First name', 'Last name', 'email', 'phone number', 'DOB', 'Gender', 'State',
    // Legacy/alternative formats
    'first-name', 'firstName', 'last-name', 'lastName', 'Email', 'phone', 'Phone',
    'dob', 'dateOfBirth', 'sex', 'gender', 'state',
  ];

  // Address Fields (Airtable bracket notation)
  const addressFields = [
    'Address', 'Address [Street]', 'Address [house]', 'Address [City]',
    'Address [State]', 'Address [Country]', 'Address [Zip]', 'apartment#',
    // Legacy formats
    'address', 'address1', 'address2', 'city', 'zip', 'zipCode',
  ];

  // Body Metrics (Airtable exact + legacy)
  const bodyMetricsFields = [
    // Airtable exact names
    'Height [feet]', 'Height [inches]', 'starting weight', 'BMI',
    // Legacy formats
    'feet', 'inches', 'height', 'weight', 'current-weight', 'bmi',
  ];

  // Medical History (Airtable exact names - All treatments)
  const medicalHistoryFields = [
    // Airtable exact names (shared)
    'Allergies', 'Which allergies', 'Conditions', 'Cancer',
    'Chronic Kidney Disease', 'B12 Deficiency', 'Bloodowrk', 'Bloodwork',
    // TRT-specific
    'Allergic to', 'List of Allergies', 'Chronic Conditions',
    'Blood Pressure', 'bloodwork',
    // Baseline-specific
    'Chronic Disease', 'List of disease',
    // Legacy formats
    'allergies', 'health-conditions', 'medical-conditions', 'conditions',
  ];

  // Medications (Airtable exact names - All treatments)
  const medicationsFields = [
    // Airtable exact names (shared)
    'List of medications', 'Medications [current]', 'Prescription Medications',
    // TRT-specific
    'List of medications, vitamins, supplements', 'Medications, vitamins, Supplements',
    'Specific Medications',
    // Baseline-specific
    'Specific Supplements',
    // Legacy formats
    'current-medications', 'medications',
  ];

  // Lifestyle (Airtable exact names)
  const lifestyleFields = [
    'Drinking', 'Activity Level',
    // Legacy formats
    'drinking', 'activity-level', 'exercise-frequency',
  ];

  // Referral & Marketing (Airtable exact names)
  const referralFields = [
    // Airtable exact names (both spelling variants)
    'How did you hear about us?',
    'Who reccomended OT Mens Health to you?',  // Peptide table (typo)
    'Who recommended OT Mens Health to you?',  // TRT table (correct)
    'Referrer',
    // Promo codes
    'promo-code', 'promoCode', 'promo_code', 'PROMO CODE', 'Promo Code',
    // Influencer codes
    'influencer-code', 'influencerCode', 'influencer_code', 'INFLUENCER CODE', 'Influencer Code',
    // Referral codes
    'referral-code', 'referralCode', 'referral_code', 'REFERRAL CODE', 'Referral Code',
    // Affiliate codes (OT clinic Heyflow forms)
    'affiliate-code', 'affiliateCode', 'affiliate_code', 'AFFILIATE CODE', 'Affiliate Code',
    // Partner codes
    'partner-code', 'partnerCode', 'partner_code', 'PARTNER CODE', 'Partner Code',
  ];

  // Consent Fields (Airtable exact names)
  const consentFields = [
    // Airtable exact names
    '18+ Consent', 'Consent Forms', 'marketing consent',
    // Legacy formats
    'hipaa-agreement', 'terms-agreement', 'consent',
    'Checkout Completed', 'checkout-completed', 'paid',
  ];

  // Metadata Fields (to exclude from "Additional Information")
  const metadataFields = [
    'Response ID', 'Heyflow ID', 'A/B Test ID', 'A/B Test Version',
    'URL', 'URL with parameters', 'IntakeQ Client ID', 'IntakeQ Status',
    'submission-id', 'submissionId', 'submission_id',
    'submission-date', 'submittedAt', 'createdAt',
    'treatmentType', 'treatment-type', 'treatment_type',
  ];

  // ═══════════════════════════════════════════════════════════════════
  // TREATMENT-SPECIFIC FIELD GROUPS
  // ═══════════════════════════════════════════════════════════════════
  const treatmentFieldGroups: Record<OvertimeTreatmentType, string[][]> = {
    weight_loss: [
      // Weight Goals
      ['goal-weight', 'ideal-weight', 'target-weight', 'Goal weight', 'Ideal weight', 'ideal weight', 'starting weight', 'Starting weight'],
      // GLP-1 History & Experience (Airtable exact names)
      ['glp1-experience', 'glp1-last-30', 'glp1-medication-type', 'glp1-dose', 'previous-glp1', 'GLP-1 Experience',
       'GLP-1 History', 'Type of GLP-1', 'Happy with GLP-1 Dose', 'Side Effect History'],
      // Semaglutide Specific (Airtable exact names)
      ['Semaglutide Dose', 'Semaglutide Side Effects', 'Semaglutide Success'],
      // Tirzepatide Specific (Airtable exact names)
      ['Tirzepatide Dose', 'Tirzepatide Side Effects', 'Tirzepatide Success'],
      // Medication Preferences
      ['preferred-meds', 'medication-preference', 'injections-tablets', 'Medication Preference',
       'Personalized Treatment', 'Qualifying Conditions'],
      // Weight Loss Motivation & Goals
      ['weight-loss-motivation', 'weight-loss-history', 'diet-history', 'exercise-frequency',
       'How would your life change by losing weight'],
      // Contraindications (Airtable exact names)
      ['men2-history', 'thyroid-cancer', 'pancreatitis', 'gastroparesis', 'bariatric-surgery',
       'Thyroid Cancer', 'Neoplasia type 2 (MEN 2)', 'Pancreatitis', 'Gastroparesis',
       'Pregnant or Breastfeeding', 'Type 2 Diabetes'],
      // Chronic Conditions (Airtable exact names)
      ['Chronic Illness', 'Specific Chronic Illness', 'Type of Chronic Illness',
       'Family History Diagnoses', 'Past surgery', 'Surgery Type'],
      // Mental Health (Airtable exact names)
      ['Mental Health', 'Mental health Diagnosis'],
    ],
    peptides: [
      // Treatment Goals & Preferences (Airtable exact)
      ['goals', 'Goals', 'Peptide choice', 'What are you looking to Optimize?'],
      // Symptoms
      ['Symptoms', 'symptoms'],
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
      // Symptoms & Duration (Airtable exact names)
      ['ed-history', 'ed-duration', 'ed-severity', 'ed-onset', 'ED History',
       'Symptoms', 'How long have you notice', 'How often do these sexual issues occur?'],
      // Treatment Goals
      ['goals', 'libido-level', 'performance-anxiety', 'relationship-status'],
      // Physical Activity & Lifestyle
      ['Physical Active', 'Smoke/Nicotine'],
      // Cardiovascular - Critical for ED meds (Airtable exact names)
      ['Heart condition', 'Chest Pains', 'meds with nitrates or nitroglycerin',
       'cardiovascular-health', 'blood-pressure', 'nitrate-use'],
      // Chronic Conditions (Airtable exact names)
      ['Chronic Disease', 'Chronic Illnesses', 'Specific Conditions', 'Cancer', 'diabetes'],
      // Medications (Airtable exact names)
      ['Medications', 'List of Medications', 'previous-ed-meds', 'viagra-experience', 'cialis-experience'],
      // Lab Work
      ['Labwork', 'preferred-medication', 'frequency-needed'],
    ],
    testosterone: [
      // Treatment Goals (Airtable exact)
      ['Main Results to acchive', 'Main Results to achieve', 'goals', 'Goals'],
      // Previous Therapies
      ['Previous Therapies (Hormone, Pept, GLP1)', 'previous-trt', 'current-trt', 'trt-duration'],
      // Lab Results
      ['Lab Results', 'recent-testosterone-level', 'free-testosterone', 'total-testosterone', 'estradiol-level', 'psa-level', 'hematocrit'],
      // Administration Preferences
      ['Self Administration', 'preferred-administration', 'injection-comfort', 'trt-type', 'injection-frequency'],
      // Legacy symptom fields
      ['trt-symptoms', 'fatigue-level', 'muscle-loss', 'libido-changes', 'mood-changes', 'brain-fog', 'sleep-issues', 'weight-gain'],
      // Legacy contraindications
      ['prostate-history', 'heart-disease', 'blood-clot-history', 'sleep-apnea', 'fertility-concerns'],
    ],
    baseline_bloodwork: [
      // Reason for Labs (Airtable exact)
      ['Why Labs', 'reason-for-labs', 'treatment-interest'],
      // Health Assessment (Airtable exact)
      ['Health areas insights', 'changes in body', 'Importance of tracking results'],
      // Legacy fields
      ['lab-location', 'preferred-lab', 'fasting-available', 'preferred-time', 'mobile-phlebotomy'],
      ['last-lab-date', 'previous-lab-results', 'has-recent-labs'],
      ['insurance-coverage', 'self-pay'],
    ],
  };

  // Helper to create section entries
  const createEntries = (fields: string[]): IntakeSection['entries'] => {
    return fields
      .filter(field => {
        const value = payload[field as keyof OvertimePayload];
        return value !== undefined && value !== null && value !== '';
      })
      .map(field => {
        const treatmentLabels = TREATMENT_FIELD_LABELS[treatmentType] || {};
        const label = COMMON_FIELD_LABELS[field] || treatmentLabels[field] || formatFieldLabel(field);
        return {
          id: field,
          label,
          value: formatValue(payload[field as keyof OvertimePayload]),
          rawValue: payload[field as keyof OvertimePayload],
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
    weight_loss: ['Weight Goals', 'GLP-1 History', 'Semaglutide Experience', 'Tirzepatide Experience',
                  'Treatment Preferences', 'Weight Loss Motivation', 'Contraindications',
                  'Chronic Conditions', 'Mental Health'],
    peptides: ['Treatment Goals', 'Current Symptoms', 'Peptide Experience', 'Injection Preferences', 'Lab Work'],
    nad_plus: ['NAD+ Experience', 'Treatment Goals', 'Preferences', 'Health Assessment'],
    better_sex: ['Symptoms & Duration', 'Treatment Goals', 'Physical Activity', 'Cardiovascular Health',
                  'Chronic Conditions', 'Medications', 'Lab Work & Preferences'],
    testosterone: ['Treatment Goals', 'Previous Therapies', 'Lab Results', 'Administration Preferences', 'Symptoms', 'Contraindications'],
    baseline_bloodwork: ['Reason for Labs', 'Health Assessment', 'Lab Preferences', 'Previous Labs', 'Payment'],
  };

  treatmentGroups.forEach((fields, index) => {
    const entries = createEntries(fields);
    if (entries.length > 0) {
      const sectionName = sectionNames[treatmentType]?.[index] || `${treatmentLabel} Information ${index + 1}`;
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
    ...patientIdentityFields, ...addressFields, ...bodyMetricsFields,
    ...medicalHistoryFields, ...medicationsFields, ...lifestyleFields,
    ...referralFields, ...consentFields, ...metadataFields,
    ...treatmentGroups.flat(),
  ]);

  const otherFields = Object.keys(payload).filter(key => !allKnownFields.has(key));
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
    hasName: payloadKeys.some(k => k.toLowerCase().includes('name')),
    hasEmail: payloadKeys.some(k => k.toLowerCase().includes('email')),
    hasPhone: payloadKeys.some(k => k.toLowerCase().includes('phone')),
    hasDob: payloadKeys.some(k => k.toLowerCase().includes('dob') || k.toLowerCase().includes('birth')),
    hasState: payloadKeys.some(k => k.toLowerCase().includes('state')),
    hasAddress: payloadKeys.some(k => k.toLowerCase().includes('address')),
  });

  const patient: NormalizedPatient = {
    firstName: "Unknown",
    lastName: "Unknown",
    email: "unknown@example.com",
    phone: "",
    dob: "",
    gender: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
  };

  // First Name (check Airtable exact names + variations)
  // Airtable uses: "First name" (with space, lowercase 'n')
  const firstName = payload['First name'] || payload['first name'] || payload['First Name'] ||
                    payload['first-name'] || payload['firstName'] || payload['first_name'] ||
                    payload['fname'] || payload['fName'] || payload['FIRST NAME'];
  if (firstName) {
    patient.firstName = capitalizeWords(String(firstName));
  }

  // Last Name (check Airtable exact names + variations)
  // Airtable uses: "Last name" (with space, lowercase 'n')
  const lastName = payload['Last name'] || payload['last name'] || payload['Last Name'] ||
                   payload['last-name'] || payload['lastName'] || payload['last_name'] ||
                   payload['lname'] || payload['lName'] || payload['LAST NAME'];
  if (lastName) {
    patient.lastName = capitalizeWords(String(lastName));
  }

  // If first/last names are still Unknown, try full name fields
  if (patient.firstName === 'Unknown' || patient.lastName === 'Unknown') {
    // Check for Heyflow-style "Whats your name" field first (common in OT forms)
    const fullName = payload['whats-your-name'] || payload['whats_your_name'] ||
                     payload['Whats your name'] || payload['whatsYourName'] ||
                     payload['your-name'] || payload['your_name'] || payload['Your Name'] ||
                     payload['name'] || payload['Name'] || payload['full-name'] ||
                     payload['fullName'] || payload['full_name'] || payload['Full Name'] ||
                     payload['customer-name'] || payload['customerName'] || payload['customer_name'] ||
                     payload['patient-name'] || payload['patientName'] || payload['patient_name'] ||
                     payload['contact-name'] || payload['contactName'] || payload['contact_name'] ||
                     payload['Name (from Contacts)'] || payload['Contact Name'] ||
                     payload['Customer Name'] || payload['Patient Name'];

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
  const emailField = payload['email'] || payload['Email'] || payload['EMAIL'] ||
                     payload['email-address'] || payload['emailAddress'] || payload['email_address'] ||
                     payload['e-mail'] || payload['Email Address'];
  if (emailField) {
    patient.email = String(emailField).trim().toLowerCase();
  }

  // Phone (check Airtable exact names + variations)
  // Airtable uses: "phone number" (lowercase, with space)
  const phoneField = payload['phone number'] || payload['Phone number'] || payload['Phone Number'] ||
                     payload['phone'] || payload['Phone'] || payload['PHONE'] ||
                     payload['phone-number'] || payload['phoneNumber'] || payload['phone_number'] ||
                     payload['mobile'] || payload['cell'] || payload['telephone'] ||
                     payload['Mobile Number'];
  if (phoneField) {
    patient.phone = sanitizePhone(String(phoneField));
  }

  // Date of Birth (check Heyflow naming: "Date of birth" -> date-of-birth)
  const dob = payload['dob'] || payload['DOB'] || payload['dateOfBirth'] || payload['date_of_birth'] ||
              payload['date-of-birth'] || payload['Date of birth'] || payload['Date of Birth'] ||
              payload['birthday'] || payload['birthdate'] || payload['birth-date'] || payload['birth_date'];
  if (dob) {
    patient.dob = normalizeDateInput(String(dob));
  }

  // Gender/Sex (check Heyflow naming)
  const gender = payload['sex'] || payload['Sex'] || payload['gender'] || payload['Gender'] ||
                 payload['GENDER'] || payload['SEX'];
  if (gender) {
    patient.gender = normalizeGenderInput(String(gender));
  }

  // Address parsing
  const combinedAddressFields = ['shipping_address', 'billing_address', 'address'] as const;
  let addressParsed = false;

  for (const field of combinedAddressFields) {
    const rawAddress = payload[field];
    if (rawAddress && typeof rawAddress === 'string' && rawAddress.trim()) {
      logger.debug('[Overtime Normalizer] Parsing combined address', {
        field,
        rawAddressLength: rawAddress.length,
      });

      const parsed = smartParseAddress(rawAddress);

      if (parsed.address1 || parsed.city || parsed.state || parsed.zip) {
        patient.address1 = parsed.address1 || '';
        patient.address2 = parsed.address2 || '';
        patient.city = parsed.city || '';
        patient.state = parsed.state || '';
        patient.zip = parsed.zip || '';
        addressParsed = true;
        break;
      }
    }
  }

  // If no combined address, try individual fields
  // Airtable uses bracket notation: "Address [City]", "Address [Street]", etc.
  if (!addressParsed) {
    // Street address
    const street = payload['Address [Street]'] || payload['Address [street]'] ||
                   payload['address1'] || payload['street_address'] || payload['street'];
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
    const apt = payload['apartment#'] || payload['apartment'] || payload['address2'] || payload['apt'];
    if (apt) {
      patient.address2 = String(apt).trim();
    }

    // City
    const city = payload['Address [City]'] || payload['Address [city]'] || payload['city'] || payload['City'];
    if (city) {
      patient.city = String(city).trim();
    }

    // Zip
    const zip = payload['Address [Zip]'] || payload['Address [zip]'] ||
                payload['zip'] || payload['zipCode'] || payload['zip_code'] || payload['Zip'];
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
  const stateField = payload['state'] || payload['State'] || payload['STATE'] ||
                     payload['select-the-state-you-live-in'] || payload['select_the_state_you_live_in'] ||
                     payload['Select the state you live in'] || payload['state-you-live-in'] ||
                     payload['your-state'] || payload['yourState'] || payload['your_state'] ||
                     payload['residence-state'] || payload['residenceState'];
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
  const heightFeet = payload['Height [feet]'] || payload['height [feet]'] || payload['feet'];
  const heightInches = payload['Height [inches]'] || payload['height [inches]'] || payload['inches'];
  const weight = payload['starting weight'] || payload['Starting weight'] || payload['weight'] || payload['Weight'];

  // Log height/weight for debugging (these could be added to patient metadata later)
  if (heightFeet || heightInches || weight) {
    logger.debug('[Overtime Normalizer] Height/Weight data found', {
      heightFeet,
      heightInches,
      weight,
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
 * Extract promo/influencer code from payload
 */
export function extractPromoCode(payload: Record<string, unknown>): string | null {
  const promoFields = [
    // Promo code variations
    'promo-code',
    'promoCode',
    'promo_code',
    'PROMO CODE',
    'Promo Code',
    // Influencer code variations
    'influencer-code',
    'influencerCode',
    'influencer_code',
    'INFLUENCER CODE',
    'Influencer Code',
    // Referral code variations
    'referral-code',
    'referralCode',
    'referral_code',
    'REFERRAL CODE',
    'Referral Code',
    // Affiliate code variations (OT clinic Heyflow forms)
    'affiliate-code',
    'affiliateCode',
    'affiliate_code',
    'AFFILIATE CODE',
    'Affiliate Code',
    // Partner code variations
    'partner-code',
    'partnerCode',
    'partner_code',
    'PARTNER CODE',
    'Partner Code',
  ];

  for (const field of promoFields) {
    const value = payload[field];
    if (value && typeof value === 'string' && value.trim()) {
      return value.trim().toUpperCase();
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
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function normalizeStateInput(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedUpper = trimmed.toUpperCase();

  if (STATE_CODE_SET.has(normalizedUpper)) return normalizedUpper;

  const alphaOnly = trimmed.replace(/[^a-zA-Z]/g, " ").trim().toUpperCase();
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
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashParts = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashParts) {
    const [, mm, dd, yyyy] = slashParts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const dashParts = trimmed.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashParts) {
    const [, mm, dd, yyyy] = dashParts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const digits = trimmed.replace(/[^\d]/g, " ").trim().split(/\s+/);
  if (digits.length === 3) {
    let [first, second, third] = digits;
    if (first.length === 4 && second.length <= 2 && third.length <= 2) {
      return `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
    }
    if (third.length === 4) {
      let month = first;
      let day = second;
      if (parseInt(first, 10) > 12 && parseInt(second, 10) <= 12) {
        month = second;
        day = first;
      }
      return `${third}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  return trimmed;
}

function sanitizePhone(value?: string): string {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits;
}

function capitalizeWords(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

function normalizeGenderInput(value?: string): string {
  if (!value) return "";
  const lower = value.trim().toLowerCase();

  if (lower === 'f' || lower === 'female' || lower === 'woman') return "Female";
  if (lower === 'm' || lower === 'male' || lower === 'man') return "Male";
  if (lower.startsWith("f") || lower.startsWith("w")) return "Female";
  if (lower.startsWith("m")) return "Male";

  return value;
}
