/**
 * Wellmedr Intake Normalizer
 *
 * Normalizes intake form data from https://intake.wellmedr.com
 * The Wellmedr form uses kebab-case field names (e.g., "first-name", "goal-weight")
 *
 * This normalizer is EXCLUSIVELY for the Wellmedr clinic.
 */

import { US_STATE_OPTIONS } from '@/lib/usStates';
import type { IntakeSection, NormalizedIntake, NormalizedPatient, WellmedrPayload } from './types';
import { logger } from '@/lib/logger';
import {
  smartParseAddress,
  normalizeState as normalizeStateFromLib,
  normalizeZip,
  isApartmentString,
  isStateName,
  isZipCode,
} from '@/lib/address';

// Re-export types for convenience
export type { IntakeSection, NormalizedIntake, NormalizedPatient } from './types';

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
  email: 'Email',
  phone: 'Phone Number',
  state: 'State',
  dob: 'Date of Birth',
  sex: 'Biological Sex',

  // Body Metrics
  feet: 'Height (feet)',
  inches: 'Height (inches)',
  weight: 'Current Weight (lbs)',
  'goal-weight': 'Goal Weight (lbs)',
  bmi: 'BMI',

  // Vitals & Health
  'avg-blood-pressure-range': 'Average Blood Pressure Range',
  'avg-resting-heart-rate': 'Average Resting Heart Rate',
  'weight-related-symptoms': 'Weight-Related Symptoms',

  // Medical History
  'health-conditions': 'Primary Health Conditions',
  'health-conditions-2': 'Secondary Health Conditions',
  'type-2-diabetes': 'Type 2 Diabetes',
  'men2-history': 'MEN2 History (GLP-1 Contraindication)',
  bariatric: 'Prior Bariatric Surgery',
  'bariatric-details': 'Bariatric Surgery Details',

  // Lifestyle & Goals
  'reproductive-status': 'Reproductive Status',
  'sleep-quality': 'Sleep Quality',
  'primary-fitness-goal': 'Primary Fitness Goal',
  'weight-loss-motivation': 'Weight Loss Motivation',
  'motivation-level': 'Motivation Level',
  pace: 'Preferred Weight Loss Pace',
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
  opioids: 'Opioid Use',
  'opioids-details': 'Opioid Use Details',
  allergies: 'Allergies',

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
  logger.debug('[Wellmedr Normalizer] Processing payload', {
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

  const submittedAtValue =
    payload['submission-date'] || payload.submittedAt || payload.createdAt || Date.now();
  const submittedAt = new Date(submittedAtValue as string | number | Date);

  // Build sections from payload
  const sections = buildWellmedrSections(payload);

  // Flatten entries for answers array
  const flatEntries = sections.flatMap((section) =>
    section.entries.map((entry) => ({ ...entry, section: section.title }))
  );

  // Build patient from payload
  const patient = buildWellmedrPatient(payload as WellmedrPayload);

  logger.info('[Wellmedr Normalizer] Normalized patient', {
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
  const patientIdentityFields = [
    'first-name',
    'last-name',
    'email',
    'phone',
    'state',
    'dob',
    'sex',
  ];
  const bodyMetricsFields = ['feet', 'inches', 'weight', 'goal-weight', 'bmi'];
  const vitalsFields = [
    'avg-blood-pressure-range',
    'avg-resting-heart-rate',
    'weight-related-symptoms',
  ];
  const medicalHistoryFields = [
    'health-conditions',
    'health-conditions-2',
    'type-2-diabetes',
    'men2-history',
    'bariatric',
    'bariatric-details',
  ];
  const lifestyleFields = [
    'reproductive-status',
    'sleep-quality',
    'primary-fitness-goal',
    'weight-loss-motivation',
    'motivation-level',
    'pace',
    'affordability-potency',
  ];
  const medicationFields = [
    'preferred-meds',
    'injections-tablets',
    'glp1-last-30',
    'glp1-last-30-medication-type',
    'glp1-last-30-medication-dose-mg',
    'glp1-last-30-medication-dose-other',
    'glp1-last-30-other-medication-name',
    'current-meds',
    'current-meds-details',
  ];
  const riskFields = ['opioids', 'opioids-details', 'allergies'];
  const complianceFields = [
    'additional-info',
    'additional-info-details',
    'hipaa-agreement',
    'Checkout Completed',
    'Checkout Completed 2',
  ];

  // Helper to create section entries
  const createEntries = (fields: string[]): IntakeSection['entries'] => {
    return fields
      .filter(
        (field) => payload[field] !== undefined && payload[field] !== null && payload[field] !== ''
      )
      .map((field) => ({
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

  // Add combined height when both feet and inches present (for Intake tab display)
  const feetVal = payload['feet'];
  const inchesVal = payload['inches'];
  if (feetVal != null && feetVal !== '' && inchesVal != null && inchesVal !== '') {
    const feetStr = String(feetVal).trim();
    const inchesStr = String(inchesVal).trim();
    if (feetStr && inchesStr) {
      bodyEntries.push({
        id: 'height',
        label: 'Height',
        value: `${feetStr}'${inchesStr}"`,
        rawValue: `${feetStr}'${inchesStr}"`,
      });
    }
  }

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
    ...patientIdentityFields,
    ...bodyMetricsFields,
    ...vitalsFields,
    ...medicalHistoryFields,
    ...lifestyleFields,
    ...medicationFields,
    ...riskFields,
    ...complianceFields,
    'submission-id',
    'submission-date',
    'submissionId',
    'submittedAt',
    'createdAt',
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

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Build patient data from Wellmedr payload
 */
function buildWellmedrPatient(payload: WellmedrPayload): NormalizedPatient {
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

  // First Name (check multiple field variations)
  const firstName =
    payload['first-name'] ||
    payload['firstName'] ||
    payload['first_name'] ||
    payload['fname'] ||
    payload['fName'] ||
    payload['First Name'] ||
    payload['First name'] ||
    payload['FIRST NAME'];
  if (firstName) {
    patient.firstName = capitalizeWords(String(firstName));
  }

  // Last Name (check multiple field variations)
  const lastName =
    payload['last-name'] ||
    payload['lastName'] ||
    payload['last_name'] ||
    payload['lname'] ||
    payload['lName'] ||
    payload['Last Name'] ||
    payload['Last name'] ||
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
          if (!/^\d+$/.test(fn) && !/^\d+$/.test(ln)) {
            patient.firstName = capitalizeWords(fn.replace(/[^a-zA-Z]/g, ''));
            patient.lastName = capitalizeWords(ln.replace(/[^a-zA-Z]/g, ''));
            logger.info('[Wellmedr Normalizer] Extracted name from email', {
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

  // Phone (check multiple field variations)
  const phoneField =
    payload['phone'] ||
    payload['Phone'] ||
    payload['PHONE'] ||
    payload['phone-number'] ||
    payload['phoneNumber'] ||
    payload['phone_number'] ||
    payload['mobile'] ||
    payload['cell'] ||
    payload['telephone'] ||
    payload['Phone Number'] ||
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

  // ========================================
  // ADDRESS PARSING - Enterprise Solution
  // ========================================
  // Parse address from various possible field formats:
  // 1. Heyflow address component (id-38a5bae0) - can be JSON object
  // 2. Combined strings: shipping_address, billing_address, address
  // 3. Individual fields: address1, city, state, zip

  let addressParsed = false;

  // ========================================
  // Priority 1: Try Heyflow address component (id-38a5bae0) which can be JSON
  // ========================================
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
      logger.info('[Wellmedr Normalizer] Found Heyflow address JSON component', {
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
        logger.info('[Wellmedr Normalizer] Address extracted from Heyflow JSON', {
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
  // Priority 2: Try combined address strings (from Airtable)
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

        logger.info('[Wellmedr Normalizer] Parsing combined address', {
          field,
          rawAddressLength: rawAddress.length,
          rawAddressPreview: rawAddress.substring(0, 50) + (rawAddress.length > 50 ? '...' : ''),
        });

        const parsed = smartParseAddress(rawAddress);

        // Only use parsed values if we got meaningful data
        if (parsed.address1 || parsed.city || parsed.state || parsed.zip) {
          patient.address1 = parsed.address1 || '';
          patient.address2 = parsed.address2 || '';
          patient.city = parsed.city || '';
          patient.state = parsed.state || '';
          patient.zip = parsed.zip || '';
          addressParsed = true;

          logger.info('[Wellmedr Normalizer] Address parsed successfully', {
            address1: patient.address1.substring(0, 30),
            city: patient.city,
            state: patient.state,
            zip: patient.zip,
          });
          break; // Stop after first successful parse
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
        logger.info('[Wellmedr Normalizer] Address extracted from Heyflow sub-fields', {
          address1: patient.address1,
          city: patient.city,
          state: patient.state,
          zip: patient.zip,
        });
      }
    }
  }

  // ========================================
  // Priority 4: Try Airtable bracket notation (from Airtable automations)
  // ========================================
  if (!addressParsed) {
    const airtableStreet = payload['Address [Street]'] || payload['Address [street]'];
    const airtableHouse = payload['Address [house]'] || payload['Address [House]'];
    const airtableCity = payload['Address [City]'] || payload['Address [city]'];
    const airtableState = payload['Address [State]'] || payload['Address [state]'];
    const airtableZip = payload['Address [Zip]'] || payload['Address [zip]'];
    const airtableApt = payload['apartment#'] || payload['Apartment#'];

    if (airtableStreet || airtableCity || airtableState || airtableZip) {
      // Compose street address with house number if present
      const composedStreet = [airtableHouse, airtableStreet].filter(Boolean).join(' ').trim();
      if (composedStreet) patient.address1 = String(composedStreet);
      if (airtableApt) patient.address2 = String(airtableApt).trim();
      if (airtableCity) patient.city = String(airtableCity).trim();
      if (airtableState) patient.state = normalizeStateInput(String(airtableState));
      if (airtableZip) patient.zip = normalizeZip(String(airtableZip));

      addressParsed = !!(patient.address1 || patient.city || patient.zip);
      if (addressParsed) {
        logger.info('[Wellmedr Normalizer] Address extracted from Airtable bracket notation', {
          address1: patient.address1,
          city: patient.city,
          state: patient.state,
          zip: patient.zip,
        });
      }
    }
  }

  // ========================================
  // Priority 5: Try individual fields (legacy)
  // ========================================
  if (!addressParsed) {
    // Street address
    if (payload['address1'] || payload['street_address']) {
      patient.address1 = String(payload['address1'] || payload['street_address']).trim();
    }

    // Address line 2
    if (payload['address2']) {
      patient.address2 = String(payload['address2']).trim();
    }

    // City
    if (payload['city']) {
      patient.city = String(payload['city']).trim();
    }

    // ZIP
    if (payload['zip'] || payload['zipCode'] || payload['zip_code']) {
      patient.zip = normalizeZip(
        String(payload['zip'] || payload['zipCode'] || payload['zip_code'])
      );
    }
  }

  // ========================================
  // Wellmedr-specific: fix corrupted address when combined string is present
  // (Airtable / intake often sends apt in city, state in zip for addresses with apartment numbers)
  // ========================================
  const rawCombined =
    (typeof payload['shipping_address'] === 'string' && payload['shipping_address'].trim()) ||
    (typeof payload['billing_address'] === 'string' && payload['billing_address'].trim()) ||
    (typeof payload['address'] === 'string' && payload['address'].trim());
  const combinedForCorrection =
    typeof rawCombined === 'string' && rawCombined.length > 0 ? rawCombined : null;
  const cityLooksLikeApt = patient.city ? isApartmentString(patient.city) : false;
  const zipLooksLikeState = patient.zip ? isStateName(patient.zip) && !isZipCode(patient.zip) : false;
  const stateLooksLikeZip = patient.state ? isZipCode(patient.state) : false;
  const addressLooksCorrupted =
    cityLooksLikeApt || zipLooksLikeState || stateLooksLikeZip;

  if (
    combinedForCorrection &&
    combinedForCorrection.includes(',') &&
    addressLooksCorrupted
  ) {
    const parsed = smartParseAddress(combinedForCorrection);
    if (parsed.address1 || parsed.city || parsed.state || parsed.zip) {
      patient.address1 = parsed.address1 || patient.address1 || '';
      patient.address2 = parsed.address2 || patient.address2 || '';
      patient.city = parsed.city || '';
      patient.state = parsed.state || '';
      patient.zip = parsed.zip || '';
      logger.info('[Wellmedr Normalizer] Address corrected from combined string (corrupted fields)', {
        hadCorruption: true,
        city: patient.city,
        state: patient.state,
        zip: patient.zip,
      });
    }
  }

  // State - handle separately as it might come from its own field
  // even when other address fields are parsed from combined string
  if (payload['state']) {
    const stateValue = String(payload['state']).trim();
    // Use the state from payload if we don't already have one,
    // or if the parsed state is empty
    if (!patient.state || patient.state === '') {
      patient.state = normalizeStateInput(stateValue);
    }
  }

  // Final state normalization to ensure 2-letter code
  if (patient.state) {
    patient.state = normalizeStateFromLib(patient.state);
  }

  return patient;
}

/**
 * Format field label from kebab-case to Title Case
 */
function formatFieldLabel(field: string): string {
  return field
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format value for display
 */
function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (value === null || value === undefined) {
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

/**
 * Normalize state input to 2-letter code
 */
function normalizeStateInput(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const normalizedUpper = trimmed.toUpperCase();

  // Check if already a valid state code
  if (STATE_CODE_SET.has(normalizedUpper)) return normalizedUpper;

  // Check if it's a full state name
  const alphaOnly = trimmed
    .replace(/[^a-zA-Z]/g, ' ')
    .trim()
    .toUpperCase();
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
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  // Already in correct format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Try MM/DD/YYYY format
  const slashParts = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashParts) {
    const [, mm, dd, yyyy] = slashParts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Try MM-DD-YYYY format
  const dashParts = trimmed.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashParts) {
    const [, mm, dd, yyyy] = dashParts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Try to parse other formats
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

/**
 * Sanitize phone number to digits only
 */
function sanitizePhone(value?: string): string {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  // Remove leading 1 for US numbers
  if (digits.length === 11 && digits.startsWith('1')) {
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
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

/**
 * Normalize gender input
 */
function normalizeGenderInput(value?: string): string {
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

/**
 * Check if checkout is complete
 */
export function isCheckoutComplete(payload: WellmedrPayload): boolean {
  const checkoutCompleted = payload['Checkout Completed'];
  const checkoutCompleted2 = payload['Checkout Completed 2'];

  // Check both fields - true if either indicates completion
  const isComplete1 =
    checkoutCompleted === true ||
    checkoutCompleted === 'true' ||
    checkoutCompleted === 'Yes' ||
    checkoutCompleted === 'yes' ||
    checkoutCompleted === '1';

  const isComplete2 =
    checkoutCompleted2 === true ||
    checkoutCompleted2 === 'true' ||
    checkoutCompleted2 === 'Yes' ||
    checkoutCompleted2 === 'yes' ||
    checkoutCompleted2 === '1';

  return isComplete1 || isComplete2;
}
