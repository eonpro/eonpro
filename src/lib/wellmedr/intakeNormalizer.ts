/**
 * Wellmedr Intake Normalizer
 * 
 * Normalizes intake form data from https://intake.wellmedr.com
 * The Wellmedr form uses kebab-case field names (e.g., "first-name", "goal-weight")
 * 
 * This normalizer is EXCLUSIVELY for the Wellmedr clinic.
 */

import { US_STATE_OPTIONS } from "@/lib/usStates";
import type { IntakeSection, NormalizedIntake, NormalizedPatient, WellmedrPayload } from "./types";
import { logger } from '@/lib/logger';

// Re-export types for convenience
export type { IntakeSection, NormalizedIntake, NormalizedPatient } from "./types";

const STATE_CODE_SET = new Set(US_STATE_OPTIONS.map((state: any) => state.value.toUpperCase()));
const STATE_NAME_TO_CODE = US_STATE_OPTIONS.reduce<Record<string, string>>((acc, state) => {
  acc[state.label.toUpperCase()] = state.value.toUpperCase();
  return acc;
}, {});

/**
 * Wellmedr Field Mapping
 * Maps kebab-case field IDs to human-readable labels for display
 */
const WELLMEDR_FIELD_LABELS: Record<string, string> = {
  // Submission Metadata
  'submission-id': 'Submission ID',
  'submission-date': 'Submission Date',
  
  // Patient Identity
  'first-name': 'First Name',
  'last-name': 'Last Name',
  'email': 'Email',
  'phone': 'Phone Number',
  'state': 'State',
  'dob': 'Date of Birth',
  'sex': 'Biological Sex',
  
  // Body Metrics
  'feet': 'Height (feet)',
  'inches': 'Height (inches)',
  'weight': 'Current Weight (lbs)',
  'goal-weight': 'Goal Weight (lbs)',
  'bmi': 'BMI',
  
  // Vitals & Health
  'avg-blood-pressure-range': 'Average Blood Pressure Range',
  'avg-resting-heart-rate': 'Average Resting Heart Rate',
  'weight-related-symptoms': 'Weight-Related Symptoms',
  
  // Medical History
  'health-conditions': 'Primary Health Conditions',
  'health-conditions-2': 'Secondary Health Conditions',
  'type-2-diabetes': 'Type 2 Diabetes',
  'men2-history': 'MEN2 History (GLP-1 Contraindication)',
  'bariatric': 'Prior Bariatric Surgery',
  'bariatric-details': 'Bariatric Surgery Details',
  
  // Lifestyle & Goals
  'reproductive-status': 'Reproductive Status',
  'sleep-quality': 'Sleep Quality',
  'primary-fitness-goal': 'Primary Fitness Goal',
  'weight-loss-motivation': 'Weight Loss Motivation',
  'motivation-level': 'Motivation Level',
  'pace': 'Preferred Weight Loss Pace',
  'affordability-potency': 'Budget vs Potency Preference',
  
  // Medication Preferences & History
  'preferred-meds': 'Preferred Medication',
  'injections-tablets': 'Injection vs Tablet Preference',
  'glp1-last-30': 'Used GLP-1 in Last 30 Days',
  'glp1-last-30-medication-type': 'Recent GLP-1 Medication Type',
  'glp1-last-30-medication-dose-mg': 'Recent GLP-1 Dose (mg)',
  'glp1-last-30-medication-dose-other': 'Other GLP-1 Dosing',
  'glp1-last-30-other-medication-name': 'Other GLP-1 Medication Name',
  
  // Current Medications
  'current-meds': 'Currently Taking Medications',
  'current-meds-details': 'Current Medication List',
  
  // Risk Screening
  'opioids': 'Opioid Use',
  'opioids-details': 'Opioid Use Details',
  'allergies': 'Allergies',
  
  // Additional Info & Compliance
  'additional-info': 'Additional Information to Disclose',
  'additional-info-details': 'Additional Details',
  'hipaa-agreement': 'HIPAA Agreement',
  
  // Checkout / Conversion
  'Checkout Completed': 'Checkout Completed',
  'Checkout Completed 2': 'Checkout Confirmation',
};

/**
 * Normalize Wellmedr intake payload
 * 
 * @param payload - Raw payload from Wellmedr Airtable webhook
 * @returns Normalized intake data
 */
export function normalizeWellmedrPayload(payload: Record<string, unknown>): NormalizedIntake {
  logger.debug("[Wellmedr Normalizer] Processing payload", { 
    keys: Object.keys(payload || {}).slice(0, 10),
    hasSubmissionId: !!(payload?.['submission-id'] || payload?.submissionId),
  });

  // Extract submission metadata
  const submissionId = String(
    payload['submission-id'] || 
    payload.submissionId || 
    payload.submission_id || 
    `wellmedr-${Date.now()}`
  );
  
  const submittedAtValue = payload['submission-date'] || payload.submittedAt || payload.createdAt || Date.now();
  const submittedAt = new Date(submittedAtValue as string | number | Date);

  // Build sections from payload
  const sections = buildWellmedrSections(payload);
  
  // Flatten entries for answers array
  const flatEntries = sections.flatMap((section) =>
    section.entries.map((entry) => ({ ...entry, section: section.title }))
  );

  // Build patient from payload
  const patient = buildWellmedrPatient(payload as WellmedrPayload);

  logger.info("[Wellmedr Normalizer] Normalized patient", { 
    name: `${patient.firstName} ${patient.lastName}`,
    email: patient.email,
    state: patient.state,
    fieldsExtracted: flatEntries.length,
  });

  return {
    submissionId,
    submittedAt,
    patient,
    sections,
    answers: flatEntries,
  };
}

/**
 * Build intake sections from Wellmedr payload
 */
function buildWellmedrSections(payload: Record<string, unknown>): IntakeSection[] {
  const sections: IntakeSection[] = [];
  
  // Group fields by category
  const patientIdentityFields = ['first-name', 'last-name', 'email', 'phone', 'state', 'dob', 'sex'];
  const bodyMetricsFields = ['feet', 'inches', 'weight', 'goal-weight', 'bmi'];
  const vitalsFields = ['avg-blood-pressure-range', 'avg-resting-heart-rate', 'weight-related-symptoms'];
  const medicalHistoryFields = ['health-conditions', 'health-conditions-2', 'type-2-diabetes', 'men2-history', 'bariatric', 'bariatric-details'];
  const lifestyleFields = ['reproductive-status', 'sleep-quality', 'primary-fitness-goal', 'weight-loss-motivation', 'motivation-level', 'pace', 'affordability-potency'];
  const medicationFields = ['preferred-meds', 'injections-tablets', 'glp1-last-30', 'glp1-last-30-medication-type', 'glp1-last-30-medication-dose-mg', 'glp1-last-30-medication-dose-other', 'glp1-last-30-other-medication-name', 'current-meds', 'current-meds-details'];
  const riskFields = ['opioids', 'opioids-details', 'allergies'];
  const complianceFields = ['additional-info', 'additional-info-details', 'hipaa-agreement', 'Checkout Completed', 'Checkout Completed 2'];

  // Helper to create section entries
  const createEntries = (fields: string[]): IntakeSection['entries'] => {
    return fields
      .filter(field => payload[field] !== undefined && payload[field] !== null && payload[field] !== '')
      .map(field => ({
        id: field,
        label: WELLMEDR_FIELD_LABELS[field] || formatFieldLabel(field),
        value: formatValue(payload[field]),
        rawValue: payload[field],
      }));
  };

  // Add sections with entries
  const patientEntries = createEntries(patientIdentityFields);
  if (patientEntries.length > 0) {
    sections.push({ title: 'Patient Information', entries: patientEntries });
  }

  const bodyEntries = createEntries(bodyMetricsFields);
  if (bodyEntries.length > 0) {
    sections.push({ title: 'Body Metrics', entries: bodyEntries });
  }

  const vitalsEntries = createEntries(vitalsFields);
  if (vitalsEntries.length > 0) {
    sections.push({ title: 'Vitals & Health', entries: vitalsEntries });
  }

  const medicalEntries = createEntries(medicalHistoryFields);
  if (medicalEntries.length > 0) {
    sections.push({ title: 'Medical History', entries: medicalEntries });
  }

  const lifestyleEntries = createEntries(lifestyleFields);
  if (lifestyleEntries.length > 0) {
    sections.push({ title: 'Lifestyle & Goals', entries: lifestyleEntries });
  }

  const medicationEntries = createEntries(medicationFields);
  if (medicationEntries.length > 0) {
    sections.push({ title: 'Medication Preferences & History', entries: medicationEntries });
  }

  const riskEntries = createEntries(riskFields);
  if (riskEntries.length > 0) {
    sections.push({ title: 'Risk Screening', entries: riskEntries });
  }

  const complianceEntries = createEntries(complianceFields);
  if (complianceEntries.length > 0) {
    sections.push({ title: 'Compliance & Checkout', entries: complianceEntries });
  }

  // Add any remaining fields not in predefined categories
  const allKnownFields = new Set([
    ...patientIdentityFields, ...bodyMetricsFields, ...vitalsFields,
    ...medicalHistoryFields, ...lifestyleFields, ...medicationFields,
    ...riskFields, ...complianceFields,
    'submission-id', 'submission-date', 'submissionId', 'submittedAt', 'createdAt',
  ]);

  const otherFields = Object.keys(payload).filter(key => !allKnownFields.has(key));
  const otherEntries = createEntries(otherFields);
  if (otherEntries.length > 0) {
    sections.push({ title: 'Additional Information', entries: otherEntries });
  }

  return sections;
}

/**
 * Build patient data from Wellmedr payload
 */
function buildWellmedrPatient(payload: WellmedrPayload): NormalizedPatient {
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

  // First Name
  if (payload['first-name']) {
    patient.firstName = capitalizeWords(String(payload['first-name']));
  }

  // Last Name
  if (payload['last-name']) {
    patient.lastName = capitalizeWords(String(payload['last-name']));
  }

  // Email
  if (payload['email']) {
    patient.email = String(payload['email']).trim().toLowerCase();
  }

  // Phone
  if (payload['phone']) {
    patient.phone = sanitizePhone(String(payload['phone']));
  }

  // State
  if (payload['state']) {
    patient.state = normalizeStateInput(String(payload['state']));
  }

  // Date of Birth
  if (payload['dob']) {
    patient.dob = normalizeDateInput(String(payload['dob']));
  }

  // Gender/Sex
  if (payload['sex']) {
    patient.gender = normalizeGenderInput(String(payload['sex']));
  }

  return patient;
}

/**
 * Format field label from kebab-case to Title Case
 */
function formatFieldLabel(field: string): string {
  return field
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format value for display
 */
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

/**
 * Normalize state input to 2-letter code
 */
function normalizeStateInput(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  
  const normalizedUpper = trimmed.toUpperCase();
  
  // Check if already a valid state code
  if (STATE_CODE_SET.has(normalizedUpper)) return normalizedUpper;
  
  // Check if it's a full state name
  const alphaOnly = trimmed.replace(/[^a-zA-Z]/g, " ").trim().toUpperCase();
  if (STATE_CODE_SET.has(alphaOnly)) return alphaOnly;
  if (STATE_NAME_TO_CODE[normalizedUpper]) return STATE_NAME_TO_CODE[normalizedUpper];
  if (STATE_NAME_TO_CODE[alphaOnly]) return STATE_NAME_TO_CODE[alphaOnly];
  
  // Fuzzy match
  const fuzzy = US_STATE_OPTIONS.find((state: any) =>
    alphaOnly.includes(state.label.toUpperCase())
  );
  if (fuzzy) return fuzzy.value.toUpperCase();
  
  return normalizedUpper.length === 2 ? normalizedUpper : trimmed;
}

/**
 * Normalize date input to YYYY-MM-DD format
 */
function normalizeDateInput(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  
  // Already in correct format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  
  // Try MM/DD/YYYY format
  const slashParts = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashParts) {
    const [, mm, dd, yyyy] = slashParts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  
  // Try MM-DD-YYYY format
  const dashParts = trimmed.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashParts) {
    const [, mm, dd, yyyy] = dashParts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  
  // Try to parse other formats
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

/**
 * Sanitize phone number to digits only
 */
function sanitizePhone(value?: string): string {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  // Remove leading 1 for US numbers
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Capitalize words in a string
 */
function capitalizeWords(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

/**
 * Normalize gender input
 */
function normalizeGenderInput(value?: string): string {
  if (!value) return "";
  const lower = value.trim().toLowerCase();
  
  // Check for female/woman variations
  if (lower === 'f' || lower === 'female' || lower === 'woman') return "Female";
  // Check for male/man variations
  if (lower === 'm' || lower === 'male' || lower === 'man') return "Male";
  // Fallback: if starts with 'f' or 'w' (woman), treat as female
  if (lower.startsWith("f") || lower.startsWith("w")) return "Female";
  if (lower.startsWith("m")) return "Male";
  
  return value;
}

/**
 * Check if checkout is complete
 */
export function isCheckoutComplete(payload: WellmedrPayload): boolean {
  const checkoutCompleted = payload['Checkout Completed'];
  const checkoutCompleted2 = payload['Checkout Completed 2'];
  
  // Check both fields - true if either indicates completion
  const isComplete1 = checkoutCompleted === true || 
                      checkoutCompleted === 'true' || 
                      checkoutCompleted === 'Yes' ||
                      checkoutCompleted === 'yes' ||
                      checkoutCompleted === '1';
                      
  const isComplete2 = checkoutCompleted2 === true || 
                      checkoutCompleted2 === 'true' || 
                      checkoutCompleted2 === 'Yes' ||
                      checkoutCompleted2 === 'yes' ||
                      checkoutCompleted2 === '1';
  
  return isComplete1 || isComplete2;
}
