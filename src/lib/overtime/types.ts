/**
 * Overtime Men's Clinic Intake Types
 *
 * Types for the 6 treatment-specific intake forms from Heyflow via Airtable:
 * 1. Weight Loss
 * 2. Peptides
 * 3. NAD+
 * 4. Better Sex
 * 5. Testosterone Replacement (TRT)
 * 6. Baseline/Bloodwork
 *
 * This is EXCLUSIVELY for the Overtime Men's Clinic (subdomain: ot)
 */

// Re-export shared types
export type { IntakeEntry, IntakeSection, NormalizedIntake, NormalizedPatient } from '../wellmedr/types';

/**
 * Treatment types available at Overtime Men's Clinic
 */
export type OvertimeTreatmentType =
  | 'weight_loss'
  | 'peptides'
  | 'nad_plus'
  | 'better_sex'
  | 'testosterone'
  | 'baseline_bloodwork';

/**
 * Common fields across all Overtime intake forms
 */
export interface OvertimeCommonFields {
  // Submission Metadata
  'submission-id'?: string;
  'submissionId'?: string;
  'submission_id'?: string;
  'submission-date'?: string;
  'submittedAt'?: string;
  'createdAt'?: string;

  // Patient Identity
  'first-name'?: string;
  'firstName'?: string;
  'first_name'?: string;
  'last-name'?: string;
  'lastName'?: string;
  'last_name'?: string;
  'email'?: string;
  'phone'?: string;
  'state'?: string;
  'dob'?: string;
  'dateOfBirth'?: string;
  'date_of_birth'?: string;
  'sex'?: string;
  'gender'?: string;

  // Address Fields
  'shipping_address'?: string;
  'billing_address'?: string;
  'address'?: string;
  'address1'?: string;
  'street_address'?: string;
  'address2'?: string;
  'city'?: string;
  'zip'?: string;
  'zipCode'?: string;
  'zip_code'?: string;
  'country'?: string;

  // Body Metrics (common)
  'feet'?: string;
  'inches'?: string;
  'height'?: string;
  'weight'?: string;
  'current-weight'?: string;
  'bmi'?: string;

  // Promo/Affiliate Code - CRITICAL for affiliate tracking
  'promo-code'?: string;
  'promoCode'?: string;
  'promo_code'?: string;
  'influencer-code'?: string;
  'influencerCode'?: string;
  'influencer_code'?: string;
  'referral-code'?: string;
  'referralCode'?: string;
  'referral_code'?: string;
  'PROMO CODE'?: string;
  'INFLUENCER CODE'?: string;

  // Medical History (common)
  'health-conditions'?: string;
  'medical-conditions'?: string;
  'current-medications'?: string;
  'allergies'?: string;

  // Consent
  'hipaa-agreement'?: string;
  'terms-agreement'?: string;
  'consent'?: string;

  // Checkout Status
  'Checkout Completed'?: boolean | string;
  'checkout-completed'?: boolean | string;
  'paid'?: boolean | string;

  // Treatment Type Identifier (should be set by Airtable automation)
  'treatmentType'?: OvertimeTreatmentType;
  'treatment-type'?: OvertimeTreatmentType;
  'treatment_type'?: OvertimeTreatmentType;
  'form-type'?: string;
  'formType'?: string;
}

/**
 * Weight Loss specific payload fields
 *
 * Includes fields from OT Mens - Weight Loss Airtable table
 * Heyflow ID: uvvNo2JSHPctHpG87s0x
 * Flow path: weightloss-by-otmens
 */
export interface WeightLossFields extends OvertimeCommonFields {
  // Weight Goals (legacy)
  'goal-weight'?: string;
  'ideal-weight'?: string;
  'target-weight'?: string;

  // Weight Goals (Airtable exact names)
  'ideal weight'?: number;
  'starting weight'?: number;

  // GLP-1 History (legacy)
  'glp1-experience'?: string;
  'glp1-last-30'?: string;
  'glp1-medication-type'?: string;
  'glp1-dose'?: string;
  'previous-glp1'?: string;

  // GLP-1 History (Airtable exact names)
  'GLP-1 History'?: string;
  'Type of GLP-1'?: string;
  'Happy with GLP-1 Dose'?: string;
  'Side Effect History'?: string;

  // Semaglutide Specific (Airtable exact names)
  'Semaglutide Dose'?: string;
  'Semaglutide Side Effects'?: string;
  'Semaglutide Success'?: string;

  // Tirzepatide Specific (Airtable exact names)
  'Tirzepatide Dose'?: string;
  'Tirzepatide Side Effects'?: string;
  'Tirzepatide Success'?: string;

  // Medication Preferences (legacy)
  'preferred-meds'?: string;
  'medication-preference'?: string;
  'injections-tablets'?: string;

  // Treatment Preferences (Airtable exact names)
  'Personalized Treatment'?: string;
  'Qualifying Conditions'?: string;

  // Weight Loss Specific (legacy)
  'weight-loss-motivation'?: string;
  'weight-loss-history'?: string;
  'diet-history'?: string;
  'exercise-frequency'?: string;

  // Weight Loss Motivation (Airtable exact names)
  'How would your life change by losing weight'?: string;

  // Contraindications (legacy)
  'men2-history'?: string;
  'thyroid-cancer'?: string;
  'pancreatitis'?: string;
  'gastroparesis'?: string;
  'bariatric-surgery'?: string;

  // Contraindications (Airtable exact names)
  'Thyroid Cancer'?: string;
  'Neoplasia type 2 (MEN 2)'?: string;
  'Pancreatitis'?: string;
  'Gastroparesis'?: string;
  'Pregnant or Breastfeeding'?: string;
  'Type 2 Diabetes'?: string;

  // Chronic Conditions (Airtable exact names)
  'Chronic Illness'?: string;
  'Specific Chronic Illness'?: string;
  'Type of Chronic Illness'?: string;
  'Family History Diagnoses'?: string;
  'Past surgery'?: string;
  'Surgery Type'?: string;

  // Mental Health (Airtable exact names)
  'Mental Health'?: string;
  'Mental health Diagnosis'?: string;

  // Medications (Airtable exact names)
  'Medications / Supplements'?: string;
  'Which Medication /Supplement'?: string;

  // Lifestyle (Airtable exact names)
  'Alcohol Use'?: string;
  'Activity Level'?: string;

  // Allergies (Airtable exact names)
  'Allergy Type'?: string;
}

/**
 * Peptides specific payload fields
 */
export interface PeptidesFields extends OvertimeCommonFields {
  // Peptide Experience
  'peptide-experience'?: string;
  'previous-peptides'?: string;
  'current-peptides'?: string;

  // Goals
  'peptide-goals'?: string;
  'primary-goal'?: string;

  // Preferences
  'injection-comfort'?: string;
  'injection-experience'?: string;
  'preferred-peptide'?: string;

  // Lab Work
  'recent-labs'?: string;
  'lab-date'?: string;
}

/**
 * NAD+ specific payload fields
 */
export interface NadPlusFields extends OvertimeCommonFields {
  // NAD+ Experience
  'nad-experience'?: string;
  'previous-nad'?: string;
  'iv-experience'?: string;

  // Goals
  'energy-level'?: string;
  'cognitive-goals'?: string;
  'recovery-goals'?: string;
  'anti-aging-goals'?: string;

  // Preferences
  'preferred-protocol'?: string;
  'treatment-frequency'?: string;

  // Health Assessment
  'chronic-fatigue'?: string;
  'brain-fog'?: string;
  'sleep-quality'?: string;
}

/**
 * Better Sex (ED/Sexual Health) specific payload fields
 *
 * Includes fields from OT Mens - Better Sex Airtable table
 * Heyflow ID: 5ypJkFxQN4V4U4PB7R4u
 * Flow path: bettersex
 */
export interface BetterSexFields extends OvertimeCommonFields {
  // ED History (legacy)
  'ed-history'?: string;
  'ed-duration'?: string;
  'ed-severity'?: string;
  'ed-onset'?: string;

  // Symptoms & Duration (Airtable exact names)
  'Symptoms'?: string;
  'How long have you notice'?: string;
  'How often do these sexual issues occur?'?: string;

  // Treatment Goals (Airtable exact names)
  'goals'?: string;

  // Current Situation (legacy)
  'libido-level'?: string;
  'performance-anxiety'?: string;
  'relationship-status'?: string;

  // Physical Activity & Lifestyle (Airtable exact names)
  'Physical Active'?: string;
  'Smoke/Nicotine'?: string;

  // Previous Treatments (legacy)
  'previous-ed-meds'?: string;
  'viagra-experience'?: string;
  'cialis-experience'?: string;

  // Preferences (legacy)
  'preferred-medication'?: string;
  'frequency-needed'?: string;

  // Health Factors (legacy)
  'cardiovascular-health'?: string;
  'blood-pressure'?: string;
  'nitrate-use'?: string;
  'diabetes'?: string;

  // Cardiovascular - Critical for ED meds (Airtable exact names)
  'Heart condition'?: string;
  'Chest Pains'?: string;
  'meds with nitrates or nitroglycerin'?: string;

  // Chronic Conditions (Airtable exact names)
  'Chronic Disease'?: string;
  'Chronic Illnesses'?: string;
  'Specific Conditions'?: string;
  'Cancer'?: string;

  // Medications (Airtable exact names)
  'Medications'?: string;
  'List of Medications'?: string;

  // Lab Work (Airtable exact names)
  'Labwork'?: string;

  // Allergies (Airtable exact names)
  'Which allergies'?: string;
}

/**
 * Testosterone Replacement (TRT) specific payload fields
 */
export interface TestosteroneFields extends OvertimeCommonFields {
  // Symptom Assessment
  'trt-symptoms'?: string;
  'fatigue-level'?: string;
  'muscle-loss'?: string;
  'libido-changes'?: string;
  'mood-changes'?: string;
  'brain-fog'?: string;
  'sleep-issues'?: string;
  'weight-gain'?: string;

  // TRT History
  'previous-trt'?: string;
  'current-trt'?: string;
  'trt-duration'?: string;
  'trt-type'?: string;
  'injection-frequency'?: string;

  // Lab History
  'recent-testosterone-level'?: string;
  'recent-lab-date'?: string;
  'free-testosterone'?: string;
  'total-testosterone'?: string;
  'estradiol-level'?: string;
  'psa-level'?: string;
  'hematocrit'?: string;

  // Preferences
  'preferred-administration'?: string;
  'injection-comfort'?: string;

  // Contraindications
  'prostate-history'?: string;
  'heart-disease'?: string;
  'blood-clot-history'?: string;
  'sleep-apnea'?: string;
  'fertility-concerns'?: string;
}

/**
 * Baseline/Bloodwork specific payload fields
 */
export interface BaselineBloodworkFields extends OvertimeCommonFields {
  // Lab Preferences
  'lab-location'?: string;
  'preferred-lab'?: string;
  'fasting-available'?: string;
  'preferred-time'?: string;
  'mobile-phlebotomy'?: string;

  // Current Health
  'reason-for-labs'?: string;
  'symptoms'?: string;
  'treatment-interest'?: string;

  // Previous Labs
  'last-lab-date'?: string;
  'previous-lab-results'?: string;
  'has-recent-labs'?: string;

  // Insurance
  'insurance-coverage'?: string;
  'self-pay'?: string;
}

/**
 * Union type for all Overtime payload types
 * Uses intersection with Record<string, unknown> for compatibility with generic functions
 */
export type OvertimePayload = (
  | WeightLossFields
  | PeptidesFields
  | NadPlusFields
  | BetterSexFields
  | TestosteroneFields
  | BaselineBloodworkFields
) & Record<string, unknown>;

/**
 * Webhook payload wrapper that includes treatment type
 */
export interface OvertimeWebhookPayload {
  treatmentType: OvertimeTreatmentType;
  data: OvertimePayload;
  source?: 'airtable' | 'heyflow' | 'manual';
  timestamp?: string;
}
