/**
 * Wellmedr Intake Types
 * 
 * Types specific to the Wellmedr intake form at https://intake.wellmedr.com
 * This form collects GLP-1 weight loss patient data.
 */

export type IntakeEntry = {
  id: string;
  label: string;
  value: string;
  rawValue?: any;
  section?: string;
};

export type IntakeSection = {
  title: string;
  entries: IntakeEntry[];
};

export type NormalizedPatient = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type NormalizedIntake = {
  submissionId: string;
  submittedAt: Date;
  patient: NormalizedPatient;
  sections: IntakeSection[];
  answers: IntakeEntry[];
};

/**
 * Wellmedr-specific payload structure
 * Fields use kebab-case (e.g., "first-name", "goal-weight")
 */
export interface WellmedrPayload {
  // Submission Metadata
  'submission-id'?: string;
  'submission-date'?: string;
  
  // Patient Identity
  'first-name'?: string;
  'last-name'?: string;
  'email'?: string;
  'phone'?: string;
  'state'?: string;
  'dob'?: string;
  'sex'?: string;
  
  // Address Fields (from Airtable)
  // These may come as combined strings or individual fields
  'shipping_address'?: string;  // Combined: "123 Main St, City, State, 12345"
  'billing_address'?: string;   // Combined: "123 Main St, City, State, 12345"
  'address'?: string;           // Combined address string
  'address1'?: string;          // Street address line 1
  'address2'?: string;          // Street address line 2 (apt, suite)
  'street_address'?: string;    // Alternative field name
  'city'?: string;              // City name
  'zip'?: string;               // ZIP code
  'zipCode'?: string;           // Alternative ZIP field name
  'zip_code'?: string;          // Alternative ZIP field name
  'country'?: string;           // Country (default: US)

  // Body Metrics
  'feet'?: string;
  'inches'?: string;
  'weight'?: string;
  'goal-weight'?: string;
  'bmi'?: string;
  
  // Vitals & Health
  'avg-blood-pressure-range'?: string;
  'avg-resting-heart-rate'?: string;
  'weight-related-symptoms'?: string;
  
  // Medical History
  'health-conditions'?: string;
  'health-conditions-2'?: string;
  'type-2-diabetes'?: string;
  'men2-history'?: string;
  'bariatric'?: string;
  'bariatric-details'?: string;
  
  // Lifestyle & Goals
  'reproductive-status'?: string;
  'sleep-quality'?: string;
  'primary-fitness-goal'?: string;
  'weight-loss-motivation'?: string;
  'motivation-level'?: string;
  'pace'?: string;
  'affordability-potency'?: string;
  
  // Medication Preferences & History
  'preferred-meds'?: string;
  'injections-tablets'?: string;
  'glp1-last-30'?: string;
  'glp1-last-30-medication-type'?: string;
  'glp1-last-30-medication-dose-mg'?: string;
  'glp1-last-30-medication-dose-other'?: string;
  'glp1-last-30-other-medication-name'?: string;
  
  // Current Medications
  'current-meds'?: string;
  'current-meds-details'?: string;
  
  // Risk Screening
  'opioids'?: string;
  'opioids-details'?: string;
  'allergies'?: string;
  
  // Additional Info & Compliance
  'additional-info'?: string;
  'additional-info-details'?: string;
  'hipaa-agreement'?: string;
  
  // Checkout / Conversion
  'Checkout Completed'?: boolean | string;
  'Checkout Completed 2'?: boolean | string;
  
  // Allow additional fields
  [key: string]: unknown;
}
