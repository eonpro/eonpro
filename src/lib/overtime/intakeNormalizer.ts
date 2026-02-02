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
 */
const COMMON_FIELD_LABELS: Record<string, string> = {
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
  'gender': 'Gender',
  
  // Body Metrics
  'feet': 'Height (feet)',
  'inches': 'Height (inches)',
  'height': 'Height',
  'weight': 'Current Weight (lbs)',
  'current-weight': 'Current Weight (lbs)',
  'bmi': 'BMI',
  
  // Medical History
  'health-conditions': 'Health Conditions',
  'medical-conditions': 'Medical Conditions',
  'current-medications': 'Current Medications',
  'allergies': 'Allergies',
  
  // Promo Codes
  'promo-code': 'Promo Code',
  'influencer-code': 'Influencer Code',
  'referral-code': 'Referral Code',
  'PROMO CODE': 'Promo Code',
  'INFLUENCER CODE': 'Influencer Code',
  
  // Consent
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
    'pancreatitis': 'Pancreatitis History',
    'gastroparesis': 'Gastroparesis',
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
  
  // Common fields for all treatment types
  const patientIdentityFields = ['first-name', 'firstName', 'last-name', 'lastName', 'email', 'phone', 'state', 'dob', 'dateOfBirth', 'sex', 'gender'];
  const bodyMetricsFields = ['feet', 'inches', 'height', 'weight', 'current-weight', 'bmi'];
  const medicalHistoryFields = ['health-conditions', 'medical-conditions', 'current-medications', 'allergies'];
  const promoFields = ['promo-code', 'promoCode', 'influencer-code', 'influencerCode', 'referral-code', 'PROMO CODE', 'INFLUENCER CODE'];
  const consentFields = ['hipaa-agreement', 'terms-agreement', 'consent', 'Checkout Completed', 'checkout-completed', 'paid'];

  // Treatment-specific field groups
  const treatmentFieldGroups: Record<OvertimeTreatmentType, string[][]> = {
    weight_loss: [
      ['goal-weight', 'ideal-weight', 'target-weight'],
      ['glp1-experience', 'glp1-last-30', 'glp1-medication-type', 'glp1-dose', 'previous-glp1'],
      ['preferred-meds', 'medication-preference', 'injections-tablets'],
      ['weight-loss-motivation', 'weight-loss-history', 'diet-history', 'exercise-frequency'],
      ['men2-history', 'thyroid-cancer', 'pancreatitis', 'gastroparesis', 'bariatric-surgery'],
    ],
    peptides: [
      ['peptide-experience', 'previous-peptides', 'current-peptides'],
      ['peptide-goals', 'primary-goal'],
      ['injection-comfort', 'injection-experience', 'preferred-peptide'],
      ['recent-labs', 'lab-date'],
    ],
    nad_plus: [
      ['nad-experience', 'previous-nad', 'iv-experience'],
      ['energy-level', 'cognitive-goals', 'recovery-goals', 'anti-aging-goals'],
      ['preferred-protocol', 'treatment-frequency'],
      ['chronic-fatigue', 'brain-fog', 'sleep-quality'],
    ],
    better_sex: [
      ['ed-history', 'ed-duration', 'ed-severity', 'ed-onset'],
      ['libido-level', 'performance-anxiety', 'relationship-status'],
      ['previous-ed-meds', 'viagra-experience', 'cialis-experience'],
      ['preferred-medication', 'frequency-needed'],
      ['cardiovascular-health', 'blood-pressure', 'nitrate-use', 'diabetes'],
    ],
    testosterone: [
      ['trt-symptoms', 'fatigue-level', 'muscle-loss', 'libido-changes', 'mood-changes', 'brain-fog', 'sleep-issues', 'weight-gain'],
      ['previous-trt', 'current-trt', 'trt-duration', 'trt-type', 'injection-frequency'],
      ['recent-testosterone-level', 'free-testosterone', 'total-testosterone', 'estradiol-level', 'psa-level', 'hematocrit'],
      ['preferred-administration', 'injection-comfort'],
      ['prostate-history', 'heart-disease', 'blood-clot-history', 'sleep-apnea', 'fertility-concerns'],
    ],
    baseline_bloodwork: [
      ['lab-location', 'preferred-lab', 'fasting-available', 'preferred-time', 'mobile-phlebotomy'],
      ['reason-for-labs', 'symptoms', 'treatment-interest'],
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

  // Add common sections
  const patientEntries = createEntries(patientIdentityFields);
  if (patientEntries.length > 0) {
    sections.push({ title: 'Patient Information', entries: patientEntries });
  }

  const bodyEntries = createEntries(bodyMetricsFields);
  if (bodyEntries.length > 0) {
    sections.push({ title: 'Body Metrics', entries: bodyEntries });
  }

  const medicalEntries = createEntries(medicalHistoryFields);
  if (medicalEntries.length > 0) {
    sections.push({ title: 'Medical History', entries: medicalEntries });
  }

  // Add treatment-specific sections
  const treatmentLabel = TREATMENT_TYPE_LABELS[treatmentType];
  const treatmentGroups = treatmentFieldGroups[treatmentType] || [];
  
  const sectionNames: Record<OvertimeTreatmentType, string[]> = {
    weight_loss: ['Weight Goals', 'GLP-1 History', 'Medication Preferences', 'Lifestyle', 'Contraindications'],
    peptides: ['Peptide Experience', 'Treatment Goals', 'Preferences', 'Lab Work'],
    nad_plus: ['NAD+ Experience', 'Goals', 'Treatment Preferences', 'Health Assessment'],
    better_sex: ['ED History', 'Current Status', 'Previous Treatments', 'Preferences', 'Health Factors'],
    testosterone: ['Symptoms', 'TRT History', 'Lab Results', 'Preferences', 'Contraindications'],
    baseline_bloodwork: ['Lab Preferences', 'Health Assessment', 'Previous Labs', 'Payment'],
  };

  treatmentGroups.forEach((fields, index) => {
    const entries = createEntries(fields);
    if (entries.length > 0) {
      const sectionName = sectionNames[treatmentType]?.[index] || `${treatmentLabel} Information ${index + 1}`;
      sections.push({ title: sectionName, entries });
    }
  });

  // Add promo code section
  const promoEntries = createEntries(promoFields);
  if (promoEntries.length > 0) {
    sections.push({ title: 'Referral & Promo Code', entries: promoEntries });
  }

  // Add consent section
  const consentEntries = createEntries(consentFields);
  if (consentEntries.length > 0) {
    sections.push({ title: 'Consent & Checkout', entries: consentEntries });
  }

  // Add any remaining fields not in predefined categories
  const allKnownFields = new Set([
    ...patientIdentityFields, ...bodyMetricsFields, ...medicalHistoryFields,
    ...promoFields, ...consentFields,
    ...treatmentGroups.flat(),
    'submission-id', 'submissionId', 'submission_id',
    'submission-date', 'submittedAt', 'createdAt',
    'treatmentType', 'treatment-type', 'treatment_type',
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

  // First Name (check multiple field variations)
  const firstName = payload['first-name'] || payload['firstName'] || payload['first_name'] ||
                    payload['fname'] || payload['fName'] || payload['First Name'] ||
                    payload['First name'] || payload['FIRST NAME'];
  if (firstName) {
    patient.firstName = capitalizeWords(String(firstName));
  }

  // Last Name (check multiple field variations)
  const lastName = payload['last-name'] || payload['lastName'] || payload['last_name'] ||
                   payload['lname'] || payload['lName'] || payload['Last Name'] ||
                   payload['Last name'] || payload['LAST NAME'];
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

  // Phone (check multiple field variations)
  const phoneField = payload['phone'] || payload['Phone'] || payload['PHONE'] ||
                     payload['phone-number'] || payload['phoneNumber'] || payload['phone_number'] ||
                     payload['mobile'] || payload['cell'] || payload['telephone'] ||
                     payload['Phone Number'] || payload['Mobile Number'];
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
  if (!addressParsed) {
    if (payload['address1'] || payload['street_address']) {
      patient.address1 = String(payload['address1'] || payload['street_address']).trim();
    }
    if (payload['address2']) {
      patient.address2 = String(payload['address2']).trim();
    }
    if (payload['city']) {
      patient.city = String(payload['city']).trim();
    }
    if (payload['zip'] || payload['zipCode'] || payload['zip_code']) {
      patient.zip = normalizeZip(String(payload['zip'] || payload['zipCode'] || payload['zip_code']));
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
    'promo-code',
    'promoCode',
    'promo_code',
    'influencer-code',
    'influencerCode',
    'influencer_code',
    'referral-code',
    'referralCode',
    'referral_code',
    'PROMO CODE',
    'INFLUENCER CODE',
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
