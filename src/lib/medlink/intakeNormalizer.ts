import { US_STATE_OPTIONS } from '@/lib/usStates';
import type { IntakeSection, NormalizedIntake, NormalizedPatient } from './types';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { smartParseAddress } from '@/lib/address';

// Re-export types for convenience
export type { IntakeSection, NormalizedIntake, NormalizedPatient } from './types';

const STATE_CODE_SET = new Set(US_STATE_OPTIONS.map((state: any) => state.value.toUpperCase()));
const STATE_NAME_TO_CODE = US_STATE_OPTIONS.reduce<Record<string, string>>((acc, state) => {
  acc[state.label.toUpperCase()] = state.value.toUpperCase();
  return acc;
}, {});

/**
 * Patient field matchers - comprehensive mapping for all intake sources
 *
 * Supports:
 * - WeightLossIntake platform (camelCase fields)
 * - Heyflow forms (id-xxxxx fields)
 * - MedLink platform
 * - Generic intake forms
 *
 * Priority: Label matching > ID matching (labels are more stable)
 */
const PATIENT_FIELD_MATCHERS: Record<keyof NormalizedPatient, FieldMatcher[]> = {
  firstName: [
    // Label-based (most reliable)
    { labelIncludes: 'first name' },
    { labelIncludes: 'firstname' },
    { labelIncludes: 'given name' },
    // WeightLossIntake / standard
    { id: 'firstName' },
    { id: 'first_name' },
    { id: 'fname' },
    // Heyflow
    { id: 'id-b1679347' },
    { id: 'idb1679347' },
  ],
  lastName: [
    { labelIncludes: 'last name' },
    { labelIncludes: 'lastname' },
    { labelIncludes: 'surname' },
    { labelIncludes: 'family name' },
    { id: 'lastName' },
    { id: 'last_name' },
    { id: 'lname' },
    { id: 'id-30d7dea8' },
    { id: 'id30d7dea8' },
  ],
  email: [
    { labelIncludes: 'email' },
    { labelIncludes: 'e-mail' },
    { id: 'email' },
    { id: 'email_address' },
    { id: 'emailAddress' },
    { id: 'id-62de7872' },
  ],
  phone: [
    { labelIncludes: 'phone' },
    { labelIncludes: 'mobile' },
    { labelIncludes: 'cell' },
    { labelIncludes: 'telephone' },
    { id: 'phone' },
    { id: 'phone_number' },
    { id: 'phoneNumber' },
    { id: 'mobile' },
    { id: 'cell' },
    { id: 'phone-input-id-cc54007b' },
    { id: 'id-cc54007b' },
  ],
  dob: [
    { labelIncludes: 'date of birth' },
    { labelIncludes: 'birth date' },
    { labelIncludes: 'birthdate' },
    { labelIncludes: 'dob' },
    { labelIncludes: 'birthday' },
    // WeightLossIntake uses dateOfBirth
    { id: 'dateOfBirth' },
    { id: 'date_of_birth' },
    { id: 'dob' },
    { id: 'birthDate' },
    { id: 'birth_date' },
    { id: 'birthday' },
    { id: 'id-01a47886' },
  ],
  gender: [
    { labelIncludes: 'gender' },
    { labelIncludes: 'sex' },
    { id: 'gender' },
    { id: 'sex' },
    { id: 'id-19e348ba' },
  ],
  address1: [
    { labelIncludes: 'street address' },
    { labelIncludes: 'address line 1' },
    { labelIncludes: 'address' },
    // WeightLossIntake uses streetAddress
    { id: 'streetAddress' },
    { id: 'street_address' },
    { id: 'address' },
    { id: 'address1' },
    { id: 'street' },
    { id: 'id-38a5bae0-street' },
    { id: 'id-38a5bae0' },
  ],
  address2: [
    { labelIncludes: 'apartment' },
    { labelIncludes: 'suite' },
    { labelIncludes: 'unit' },
    { labelIncludes: 'apt' },
    { labelIncludes: 'address line 2' },
    { id: 'apartment' },
    { id: 'address2' },
    { id: 'apt' },
    { id: 'unit' },
    { id: 'suite' },
    { id: 'id-0d142f9e' },
  ],
  city: [
    { labelIncludes: 'city' },
    { labelIncludes: 'town' },
    { id: 'city' },
    { id: 'id-38a5bae0-city' },
  ],
  state: [
    { labelIncludes: 'state' },
    { labelIncludes: 'province' },
    { labelIncludes: 'region' },
    { id: 'state' },
    { id: 'stateCode' },
    { id: 'state_code' },
    { id: 'province' },
    { id: 'id-38a5bae0-state_code' },
    { id: 'id-38a5bae0-state' },
  ],
  zip: [
    { labelIncludes: 'zip' },
    { labelIncludes: 'postal code' },
    { labelIncludes: 'postcode' },
    { labelIncludes: 'postal' },
    { labelIncludes: 'código postal' }, // Spanish
    // WeightLossIntake uses zipCode
    { id: 'zipCode' },
    { id: 'zip_code' },
    { id: 'zip' },
    { id: 'postalCode' },
    { id: 'postal_code' },
    { id: 'postal' },
    // Heyflow address component
    { id: 'id-38a5bae0-zip' },
    { id: 'id-38a5bae0-zip_code' },
    { id: 'id-38a5bae0-postal' },
    { id: 'id-38a5bae0-postalCode' },
    { id: 'id-38a5bae0-postal_code' },
    // Common variations
    { id: 'address-zip' },
    { id: 'address-zipCode' },
    { id: 'shippingZip' },
    { id: 'shipping_zip' },
  ],
};

const normalizeKey = (value?: string | null) =>
  value
    ? value
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    : '';

type FieldMatcher = {
  id?: string;
  labelIncludes?: string;
};

type RawSection = {
  title?: string;
  fields?: RawAnswer[];
  answers?: RawAnswer[];
};

type RawAnswer = {
  id?: string;
  label?: string;
  value?: any;
  answer?: any;
  question?: string;
  section?: string;
};

export function normalizeMedLinkPayload(payload: Record<string, unknown>): NormalizedIntake {
  // Log payload structure for debugging
  logger.debug('[Normalizer] Payload keys:', { keys: Object.keys(payload || {}) });
  logger.debug('[Normalizer] Payload type check', {
    hasSections: !!payload?.sections,
    hasAnswers: !!payload?.answers,
    hasResponseId: !!payload?.responseId,
  });

  const meta = payload?.meta as Record<string, unknown> | undefined;
  const submissionId =
    payload?.submissionId ||
    payload?.responseId ||
    payload?.id ||
    payload?.submission_id ||
    meta?.submissionId;
  const submittedAtValue =
    payload?.submittedAt || payload?.submitted_at || payload?.createdAt || Date.now();
  const submittedAt = new Date(submittedAtValue as string | number | Date);

  const sections = buildSections(payload);
  const flatEntries = sections.flatMap((section: any) =>
    section.entries.map((entry: any) => ({ ...entry, section: section.title }))
  );

  logger.debug('[Normalizer] Extracted entries count:', { value: flatEntries.length });

  const patient = buildPatient(flatEntries);

  return {
    submissionId: String(submissionId || `medlink-${Date.now()}`),
    submittedAt,
    patient,
    sections,
    answers: flatEntries,
  };
}

function buildSections(payload: Record<string, unknown>): IntakeSection[] {
  // Check for data object structure (WeightLossIntake webhook format)
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    const answers: RawAnswer[] = [];

    // Comprehensive field label mapping for WeightLossIntake
    // Keys are EXACT field names from the intake platform payload
    const commonFieldMappings: Record<string, string> = {
      // ═══════════════════════════════════════════════════════════════
      // PATIENT IDENTIFIERS
      // ═══════════════════════════════════════════════════════════════
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      phone: 'Phone Number',
      dateOfBirth: 'Date of Birth',
      gender: 'Gender',
      sex: 'Gender',

      // ═══════════════════════════════════════════════════════════════
      // ADDRESS
      // ═══════════════════════════════════════════════════════════════
      streetAddress: 'Street Address',
      apartment: 'Apartment/Suite',
      city: 'City',
      state: 'State',
      zipCode: 'ZIP Code',

      // ═══════════════════════════════════════════════════════════════
      // PHYSICAL MEASUREMENTS
      // ═══════════════════════════════════════════════════════════════
      weight: 'Starting Weight',
      idealWeight: 'Ideal Weight',
      height: 'Height',
      bmi: 'BMI',
      bloodPressure: 'Blood Pressure',

      // ═══════════════════════════════════════════════════════════════
      // MEDICAL HISTORY
      // ═══════════════════════════════════════════════════════════════
      currentMedications: 'Current Medications',
      medications: 'Current Medications',
      allergies: 'Allergies',
      medicalConditions: 'Medical Conditions',
      chronicConditions: 'Chronic Conditions',
      mentalHealthHistory: 'Mental Health History',
      familyHistory: 'Family Medical History',
      surgicalHistory: 'Surgical History',

      // ═══════════════════════════════════════════════════════════════
      // GLP-1 SPECIFIC
      // ═══════════════════════════════════════════════════════════════
      glp1History: 'GLP-1 Medication History',
      glp1Type: 'Current GLP-1 Medication',
      medicationPreference: 'Medication Preference',
      semaglutideDosage: 'Semaglutide Dose',
      tirzepatideDosage: 'Tirzepatide Dose',
      previousSideEffects: 'Previous Side Effects',
      currentGLP1Dose: 'Current GLP-1 Dose',

      // ═══════════════════════════════════════════════════════════════
      // LIFESTYLE
      // ═══════════════════════════════════════════════════════════════
      activityLevel: 'Daily Physical Activity',
      alcoholUse: 'Alcohol Intake',
      recreationalDrugs: 'Recreational Drug Use',
      weightLossHistory: 'Weight Loss History',

      // ═══════════════════════════════════════════════════════════════
      // VISIT INFO
      // ═══════════════════════════════════════════════════════════════
      reasonForVisit: 'Reason for Visit',
      chiefComplaint: 'Chief Complaint',
      healthGoals: 'Health Goals',

      // ═══════════════════════════════════════════════════════════════
      // PREGNANCY STATUS
      // ═══════════════════════════════════════════════════════════════
      pregnancyStatus: 'Pregnancy Status',

      // ═══════════════════════════════════════════════════════════════
      // PERSONAL MEDICAL FLAGS
      // ═══════════════════════════════════════════════════════════════
      hasDiabetes: 'Has Diabetes',
      hasGastroparesis: 'Has Gastroparesis',
      hasPancreatitis: 'Has Pancreatitis',
      hasThyroidCancer: 'Has Thyroid Cancer',

      // ═══════════════════════════════════════════════════════════════
      // REFERRAL INFO
      // ═══════════════════════════════════════════════════════════════
      referralSource: 'Referral Source',
      referredBy: 'Referred By',

      // ═══════════════════════════════════════════════════════════════
      // METADATA
      // ═══════════════════════════════════════════════════════════════
      qualified: 'Qualified Status',
      submissionType: 'Submission Type',
      intakeNotes: 'Intake Notes',
      language: 'Preferred Language',
      intakeSource: 'Intake Source',

      // ═══════════════════════════════════════════════════════════════
      // CONSENT & LEGAL (E-Signature Data)
      // ═══════════════════════════════════════════════════════════════
      // Privacy & Terms
      privacyPolicyConsent: 'Privacy Policy',
      'Privacy Policy Accepted': 'Privacy Policy',
      termsConsent: 'Terms of Service',
      'Terms of Use Accepted': 'Terms of Service',
      // Telehealth & Communication
      telehealthConsent: 'Telehealth Consent',
      'Telehealth Consent Accepted': 'Telehealth Consent',
      smsConsent: 'SMS Consent',
      'SMS Consent Accepted': 'SMS Consent',
      emailConsent: 'Email Consent',
      'Email Consent Accepted': 'Email Consent',
      // Policy & Medical
      cancellationPolicyConsent: 'Cancellation Policy',
      'Cancellation Policy Accepted': 'Cancellation Policy',
      medicalWeightConsent: 'Weight Loss Treatment',
      'Weight Loss Treatment Consent Accepted': 'Weight Loss Treatment',
      // HIPAA & Legal
      hipaaConsent: 'HIPAA Authorization',
      'HIPAA Authorization Accepted': 'HIPAA Authorization',
      floridaBillOfRights: 'Florida Bill of Rights',
      'Florida Bill of Rights Accepted': 'Florida Bill of Rights',
      // E-Signature Metadata
      consentTimestamp: 'Consent Date/Time',
      timestamp: 'Consent Date/Time',
      consentIpAddress: 'IP Address',
      'Consent IP': 'IP Address',
      consentUserAgent: 'Device/Browser',
      'Consent User Agent': 'Device/Browser',
      // Geolocation
      consentCity: 'City',
      'Consent City': 'City',
      consentRegion: 'State/Region',
      'Consent Region': 'State/Region',
      consentRegionCode: 'State Code',
      'Consent Region Code': 'State Code',
      consentCountry: 'Country',
      'Consent Country': 'Country',
      consentCountryCode: 'Country Code',
      'Consent Country Code': 'Country Code',
      consentTimezone: 'Timezone',
      'Consent Timezone': 'Timezone',
      consentISP: 'Internet Provider',
      'Consent ISP': 'Internet Provider',
      consentSignatures: 'Consent Signatures',
      'Consent Signatures': 'Consent Signatures',
      // Legacy fields
      informedConsent: 'Informed Consent',
      acceptedTerms: 'Accepted Terms',
      acceptedPrivacy: 'Accepted Privacy Policy',
      patientAcknowledgment: 'Patient Acknowledgment',
      electronicSignature: 'Electronic Signature',

      // ═══════════════════════════════════════════════════════════════
      // MENTAL HEALTH (various field names)
      // ═══════════════════════════════════════════════════════════════
      mentalHealth: 'Mental Health History',
      mentalHealthConditions: 'Mental Health Conditions',
      mentalHealthDiagnosis: 'Mental Health Diagnosis',
      psychiatricHistory: 'Psychiatric History',
      anxietyDepression: 'Anxiety/Depression',
      eatingDisorder: 'Eating Disorder History',
    };

    // Extract all fields from the data object
    Object.entries(payload.data).forEach(([key, value]) => {
      // Skip metadata fields that shouldn't be displayed
      if (['tags', 'timestamp', 'submissionId', 'airtableRecordId'].includes(key)) {
        return;
      }

      // Use mapped label if available, otherwise format the key nicely
      const label =
        commonFieldMappings[key] ||
        key
          .replace(/_/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/\b\w/g, (c) => c.toUpperCase());

      answers.push({
        id: key,
        label: label,
        value: value as any,
      });
    });

    logger.debug('[Normalizer] Extracted answers from data object:', { count: answers.length });
    if (answers.length > 0) {
      logger.debug('[Normalizer] Sample fields:', {
        samples: answers
          .slice(0, 5)
          .map((a: any) => `${a.id}=${a.label}: ${String(a.value).slice(0, 50)}`),
      });
    }

    if (answers.length > 0) {
      return [
        {
          title: 'Medical Intake Form',
          entries: normalizeAnswers(answers),
        },
      ];
    }
  }

  // Check for MedLink v2 format with responseId and fields at root level
  if (payload?.responseId && !payload?.sections && !payload?.answers) {
    const answers: RawAnswer[] = [];

    // Map of field IDs to human-readable labels - COMPREHENSIVE medical field mapping
    const fieldLabels: Record<string, string> = {
      'id-b1679347': 'First Name',
      'id-30d7dea8': 'Last Name',
      'id-01a47886': 'Date of Birth',
      'id-62de7872': 'Email',
      'phone-input-id-cc54007b': 'Phone Number',
      'id-38a5bae0': 'Address',
      'id-19e348ba': 'Gender',
      'id-703227a8': 'Starting Weight',
      'id-cf20e7c9': 'Ideal Weight',
      'id-3a7e6f11': 'Height (feet)',
      'id-4a4a1f48': 'Height (inches)',
      BMI: 'BMI',
      'id-3fa4d158': 'How would your life change by losing weight?',
      'id-74efb442': 'What is your usual level of daily physical activity?',
      'id-d560c374': 'Alcohol Intake',
      'id-d79f4058': 'Have you been diagnosed with any mental health condition?',
      'id-2835be1b': 'Mental Health Details',
      'id-2ce042cd': 'Do you have any medical conditions or chronic illnesses?',
      'id-481f7d3f': 'Chronic Illness Details',
      'id-c6194df4': 'Chronic Diseases History',
      'id-aa863a43': 'Current Conditions',
      'id-49e5286f': 'Family History',
      'id-88c19c78': 'Medullary Thyroid Cancer History',
      'id-4bacb2db': 'MEN Type-2 History',
      'id-eee84ce3': 'Gastroparesis History',
      'id-22f7904b': 'Type 2 Diabetes',
      'id-4dce53c7': 'Pregnant or Breastfeeding',
      'id-ddff6d53': 'Surgeries or Procedures',
      'mc-819b3225': 'Blood Pressure',
      'id-c4320836': 'Weight Loss Procedures',
      'id-3e6b8a5b': 'Allergies',
      'id-04e1c88e': 'List of Allergies',
      'id-d2f1eaa4': 'GLP-1 Medication History',
      'id-6a9fff95': 'Side Effects When Starting Medication',
      'id-4b98a487': 'Interested in Personalized Plan for Side Effects',
      'id-c5f1c21a': 'Current GLP-1 Medication',
      'id-5001f3ff': 'Semaglutide Dose',
      'id-9d592571': 'Semaglutide Side Effects',
      'id-5e696841': 'Semaglutide Success',
      'id-f38d521b': 'Satisfied with Current GLP-1 Dose',
      'id-d95d25bd': 'Current Medications/Supplements',
      'id-bc8ed703': 'Medication/Supplement Details',
      'id-57f65753': 'Tirzepatide Dose',
      'id-0fdd1b5a': 'Tirzepatide Success',
      'id-709d58cb': 'Tirzepatide Side Effects',
      'id-345ac6b2': 'How did you hear about us?',
    };

    // Extract all field-like properties from the root
    Object.entries(payload).forEach(([key, value]) => {
      // Skip metadata fields
      if (['responseId', 'submissionId', 'submittedAt', 'createdAt', 'updatedAt'].includes(key)) {
        return;
      }

      // Add as an answer with proper label
      answers.push({
        id: key,
        label:
          fieldLabels[key] ||
          key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim(),
        value: value as any,
      });
    });

    if (answers.length > 0) {
      return [
        {
          title: 'Responses',
          entries: normalizeAnswers(answers),
        },
      ];
    }
  }

  if (Array.isArray(payload?.sections) && payload.sections.length > 0) {
    return payload.sections.map((section: RawSection, index: number) => ({
      title: section.title ?? `Section ${index + 1}`,
      entries: normalizeAnswers(section.fields ?? section.answers ?? []),
    }));
  }

  if (Array.isArray(payload?.answers)) {
    return [
      {
        title: 'Responses',
        entries: normalizeAnswers(payload.answers),
      },
    ];
  }

  if (payload?.fields && typeof payload.fields === 'object') {
    const answers = Object.entries(payload.fields).map(([key, value]) => ({
      id: key,
      label: key,
      value,
    }));
    return [
      {
        title: 'Responses',
        entries: normalizeAnswers(answers),
      },
    ];
  }

  return [
    {
      title: 'Responses',
      entries: [],
    },
  ];
}

function normalizeAnswers(rawAnswers: RawAnswer[]): IntakeSection['entries'] {
  return rawAnswers
    .map((answer, index) => {
      const raw = answer.value ?? answer.answer ?? '';
      return {
        id: String(answer.id ?? index),
        label: String(answer.label ?? answer.question ?? answer.id ?? `Field ${index + 1}`),
        value: formatValue(raw),
        rawValue: raw,
      };
    })
    .filter((entry: any) => entry.value !== '');
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function buildPatient(
  entries: Array<{ id: string; label: string; value: string; rawValue?: any }>
): NormalizedPatient {
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

  const patientKeys = Object.keys(PATIENT_FIELD_MATCHERS) as Array<keyof NormalizedPatient>;
  for (const key of patientKeys) {
    const matchers = PATIENT_FIELD_MATCHERS[key];
    const value = findValue(entries, matchers);
    if (value) {
      if (key === 'dob') {
        const normalizedDob = normalizeDateInput(value);
        if (normalizedDob) {
          patient.dob = normalizedDob;
        }
      } else if (key === 'phone') {
        patient.phone = sanitizePhone(value);
      } else if (key === 'email') {
        patient.email = value.trim().toLowerCase();
      } else if (key === 'gender') {
        patient.gender = normalizeGenderInput(value);
      } else if (key === 'state') {
        patient.state = normalizeStateInput(value);
      } else if (key === 'firstName') {
        patient.firstName = capitalizeWords(value);
      } else if (key === 'lastName') {
        patient.lastName = capitalizeWords(value);
      } else if (key === 'address1') {
        patient.address1 = value;
      } else if (key === 'address2') {
        patient.address2 = value;
      } else if (key === 'city') {
        patient.city = value;
      } else if (key === 'zip') {
        patient.zip = value;
      }
    }
  }

  applyDerivedFields(entries, patient);

  return patient;
}

function findValue(
  entries: Array<{ id: string; label: string; value: string }>,
  matchers: FieldMatcher[]
) {
  for (const matcher of matchers) {
    if (matcher.id) {
      const matcherId = normalizeKey(matcher.id);
      const direct = entries.find((entry: any) => normalizeKey(entry.id) === matcherId);
      if (direct?.value) return direct.value;
    }
    if (matcher.labelIncludes) {
      const needle = matcher.labelIncludes.toLowerCase();
      const labelMatch = entries.find((entry: any) => entry.label?.toLowerCase().includes(needle));
      if (labelMatch?.value) return labelMatch.value;
    }
  }
  return undefined;
}

type EntryIndexRecord = { value: string; raw: any };

function buildEntryIndex(
  entries: Array<{ id: string; label: string; value: string; rawValue?: any }>
) {
  const map = new Map<string, EntryIndexRecord>();
  entries.forEach((entry: any) => {
    if (!entry.id) return;
    map.set(normalizeKey(entry.id), { value: entry.value, raw: entry.rawValue });
  });
  return map;
}

function getEntryValue(index: Map<string, EntryIndexRecord>, ...keys: string[]) {
  for (const key of keys) {
    const entry = index.get(normalizeKey(key));
    if (entry?.value) return entry.value;
  }
  return undefined;
}

function getEntryJson(index: Map<string, EntryIndexRecord>, ...keys: string[]) {
  for (const key of keys) {
    const entry = index.get(normalizeKey(key));
    if (!entry) continue;
    const parsed = parseMaybeJson(entry.raw ?? entry.value);
    if (parsed) return parsed;
  }
  return undefined;
}

function parseMaybeJson(value: unknown): unknown {
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const firstNonEmpty = (...values: Array<string | undefined | null>) =>
  values.find((value: any) => typeof value === 'string' && value.trim().length > 0)?.trim();

// Type for parsed address JSON (supports EONPRO/nested address with zipCode)
interface AddressJson {
  street?: string;
  address1?: string;
  street_1?: string;
  streetAddress?: string;
  address?: string;
  house?: string;
  apartment?: string;
  apt?: string;
  city?: string;
  state?: string;
  state_code?: string;
  zip?: string;
  zip_code?: string;
  zipCode?: string;
  postal_code?: string;
  zipcode?: string;
  postalCode?: string;
  postal?: string;
  formattedAddress?: string;
}

function applyDerivedFields(
  entries: Array<{ id: string; label: string; value: string; rawValue?: any }>,
  patient: NormalizedPatient
) {
  const index = buildEntryIndex(entries);

  // Heyflow address component id and EONPRO-style nested "address" object
  const addressJson =
    (getEntryJson(index, 'id-38a5bae0') as AddressJson | undefined) ??
    (getEntryJson(index, 'address') as AddressJson | undefined);
  const street = firstNonEmpty(
    getEntryValue(index, 'id-38a5bae0-street'),
    addressJson?.street,
    addressJson?.streetAddress,
    addressJson?.address1,
    addressJson?.street_1,
    addressJson?.address
  );
  const house = firstNonEmpty(getEntryValue(index, 'id-38a5bae0-house'), addressJson?.house);
  const apartment = firstNonEmpty(
    getEntryValue(index, 'id-0d142f9e'),
    addressJson?.apartment,
    addressJson?.apt
  );

  const composedStreet = [house, street].filter(Boolean).join(' ').trim();
  if (composedStreet) {
    patient.address1 = composedStreet;
  } else if (!patient.address1 && addressJson?.formattedAddress) {
    // Parse the formatted address to extract components
    const parsed = smartParseAddress(addressJson.formattedAddress);
    if (parsed.address1) {
      patient.address1 = parsed.address1;
      if (!patient.address2 && parsed.address2) patient.address2 = parsed.address2;
      if (!patient.city && parsed.city) patient.city = parsed.city;
      if (!patient.state && parsed.state) patient.state = parsed.state;
      if (!patient.zip && parsed.zip) patient.zip = parsed.zip;
      logger.info('[Medlink Normalizer] Parsed formattedAddress', {
        formattedAddress: addressJson.formattedAddress.substring(0, 50),
        parsed: {
          address1: parsed.address1,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
        },
      });
    } else {
      // Fallback: use formattedAddress as-is if parsing fails
      patient.address1 = addressJson.formattedAddress;
    }
  } else if (!patient.address1 && typeof addressJson === 'string') {
    patient.address1 = addressJson;
  }

  if (apartment) {
    patient.address2 = apartment;
  }

  const city = firstNonEmpty(getEntryValue(index, 'id-38a5bae0-city'), addressJson?.city);
  if (city && !patient.city) {
    patient.city = city;
  }

  // Extract zip code from multiple possible sources (including EONPRO zipCode)
  const zip = firstNonEmpty(
    // Heyflow address component sub-fields
    getEntryValue(index, 'id-38a5bae0-zip'),
    getEntryValue(index, 'id-38a5bae0-zip_code'),
    getEntryValue(index, 'id-38a5bae0-postal_code'),
    getEntryValue(index, 'id-38a5bae0-zipcode'),
    getEntryValue(index, 'id-38a5bae0-postal'),
    getEntryValue(index, 'id-38a5bae0-postalCode'),
    // JSON address object fields (EONPRO uses zipCode)
    addressJson?.zip,
    addressJson?.zip_code,
    addressJson?.zipCode,
    addressJson?.postal_code,
    addressJson?.zipcode,
    addressJson?.postalCode,
    addressJson?.postal,
    // Try to extract from formatted address (last 5 digits at end)
    (() => {
      if (addressJson?.formattedAddress) {
        const zipMatch = addressJson.formattedAddress.match(
          /\b(\d{5})(?:-\d{4})?\s*(?:,?\s*(?:USA?|United\s*States)?)?\s*$/i
        );
        if (zipMatch) return zipMatch[1];
      }
      return undefined;
    })()
  );
  if (zip) {
    // Clean up zip code - remove any non-numeric except dash
    const cleanZip = zip.replace(/[^\d-]/g, '').substring(0, 10);
    if (cleanZip.length >= 5) {
      patient.zip = cleanZip;
    }
  }

  const stateInput = firstNonEmpty(
    getEntryValue(index, 'id-38a5bae0-state_code'),
    getEntryValue(index, 'id-38a5bae0-state'),
    addressJson?.state_code,
    addressJson?.state
  );
  const normalizedState = normalizeStateInput(stateInput);
  if (normalizedState) {
    patient.state = normalizedState;
  }

  const dobValue = firstNonEmpty(getEntryValue(index, 'id-01a47886'));
  if (dobValue) {
    const normalizedDob = normalizeDateInput(dobValue);
    if (normalizedDob) {
      patient.dob = normalizedDob;
    }
  }

  const phone =
    firstNonEmpty(
      getEntryValue(index, 'phone-input-id-cc54007b'),
      getEntryValue(index, 'country-select-id-cc54007b')
    ) ?? patient.phone;
  if (phone) {
    patient.phone = sanitizePhone(phone);
  }

  const email = firstNonEmpty(getEntryValue(index, 'id-62de7872'));
  if (email) {
    patient.email = email.trim().toLowerCase();
  }

  const gender = firstNonEmpty(getEntryValue(index, 'id-19e348ba'));
  if (gender) {
    patient.gender = normalizeGenderInput(gender);
  }

  if (!patient.firstName || patient.firstName === 'Unknown') {
    const firstNameJson = getEntryJson(index, 'id-b1679347') as
      | { first?: string; firstname?: string }
      | undefined;
    const firstName =
      firstNonEmpty(getEntryValue(index, 'id-b1679347')) ??
      firstNameJson?.first ??
      firstNameJson?.firstname;
    if (firstName) {
      patient.firstName = firstName;
    }
  }

  if (!patient.lastName || patient.lastName === 'Unknown') {
    const lastNameJson = getEntryJson(index, 'id-30d7dea8') as
      | { last?: string; lastname?: string }
      | undefined;
    const lastName =
      firstNonEmpty(getEntryValue(index, 'id-30d7dea8')) ??
      lastNameJson?.last ??
      lastNameJson?.lastname;
    if (lastName) {
      patient.lastName = capitalizeWords(lastName);
    }
  }

  // Handle full name fields like "Whats your name" (common in OT Mens forms)
  if (patient.firstName === 'Unknown' || patient.lastName === 'Unknown') {
    const fullNameEntry = entries.find((entry) => {
      const label = (entry.label || '').toLowerCase();
      return (
        label.includes('your name') ||
        label.includes('full name') ||
        label === 'name' ||
        label.includes('whats your name')
      );
    });

    if (fullNameEntry?.value && fullNameEntry.value.trim()) {
      const fullName = fullNameEntry.value.trim();
      const parts = fullName.split(/\s+/);
      if (parts.length >= 1) {
        if (patient.firstName === 'Unknown' && parts[0]) {
          patient.firstName = capitalizeWords(parts[0]);
        }
        if (patient.lastName === 'Unknown' && parts.length > 1) {
          patient.lastName = capitalizeWords(parts.slice(1).join(' '));
        }
        logger.info('[Medlink Normalizer] Extracted name from full name field', {
          label: fullNameEntry.label,
          firstName: patient.firstName,
          lastName: patient.lastName,
        });
      }
    }
  }

  // Try to extract names from email if still Unknown
  if (
    patient.firstName === 'Unknown' &&
    patient.lastName === 'Unknown' &&
    patient.email &&
    patient.email !== 'unknown@example.com'
  ) {
    const emailLocal = patient.email.split('@')[0];
    if (emailLocal && emailLocal.includes('.')) {
      const [fn, ln] = emailLocal.split('.');
      if (fn && ln && fn.length > 1 && ln.length > 1 && !/^\d+$/.test(fn) && !/^\d+$/.test(ln)) {
        patient.firstName = capitalizeWords(fn.replace(/[^a-zA-Z]/g, ''));
        patient.lastName = capitalizeWords(ln.replace(/[^a-zA-Z]/g, ''));
        logger.info('[Medlink Normalizer] Extracted name from email', {
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
        });
      }
    }
  }

  if (patient.firstName) {
    patient.firstName = capitalizeWords(patient.firstName);
  }
  if (patient.lastName) {
    patient.lastName = capitalizeWords(patient.lastName);
  }
}

function normalizeStateInput(value?: string) {
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

function normalizeDateInput(value?: string) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, ' ').trim().split(/\s+/);
  if (digits.length === 3) {
    let [first, second, third] = digits;
    if (first.length === 4 && second.length === 2 && third.length === 2) {
      return `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
    }
    if (first.length === 4) {
      return `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
    }
    if (third.length === 4) {
      let month = first;
      let day = second;
      if (parseInt(first, 10) > 12 && parseInt(second, 10) <= 12) {
        month = second;
        day = first;
      }
      const year = third;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    if (third.length === 2) {
      const year = parseInt(third, 10) > 30 ? `19${third}` : `20${third}`;
      return `${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`;
    }
  }
  return trimmed;
}

function sanitizePhone(value?: string) {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  return digits;
}

function capitalizeWords(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word: any) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function normalizeGenderInput(value?: string) {
  if (!value) return '';
  const lower = value.trim().toLowerCase();
  // Check for female/woman variations
  if (lower === 'f' || lower === 'female' || lower === 'woman') return 'Female';
  // Check for male/man variations
  if (lower === 'm' || lower === 'male' || lower === 'man') return 'Male';
  // Fallback: if starts with 'f' or 'w' (woman), treat as female
  if (lower.startsWith('f') || lower.startsWith('w')) return 'Female';
  if (lower.startsWith('m')) return 'Male';
  return value;
}
