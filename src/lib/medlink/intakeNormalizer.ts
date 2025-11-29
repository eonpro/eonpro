import { US_STATE_OPTIONS } from "@/lib/usStates";
import type { IntakeSection, NormalizedIntake, NormalizedPatient } from "./types";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

// Re-export types for convenience
export type { IntakeSection, NormalizedIntake, NormalizedPatient } from "./types";

const STATE_CODE_SET = new Set(US_STATE_OPTIONS.map((state: any) => state.value.toUpperCase()));
const STATE_NAME_TO_CODE = US_STATE_OPTIONS.reduce<Record<string, string>>((acc, state) => {
  acc[state.label.toUpperCase()] = state.value.toUpperCase();
  return acc;
}, {});

const PATIENT_FIELD_MATCHERS: Record<keyof NormalizedPatient, FieldMatcher[]> = {
  firstName: [
    { id: "id-b1679347" },
    { id: "idb1679347" },
    { labelIncludes: "first name" },
    { labelIncludes: "firstname" },
  ],
  lastName: [
    { id: "id-30d7dea8" },
    { id: "id30d7dea8" },
    { labelIncludes: "last name" },
    { labelIncludes: "lastname" },
  ],
  email: [
    { id: "id-62de7872" },
    { labelIncludes: "EMAIL" },
  ],
  phone: [
    { id: "phone-input-id-cc54007b" },
    { id: "id-cc54007b" },
    { labelIncludes: "PHONE" },
  ],
  dob: [
    { id: "id-01a47886" },
    { labelIncludes: "DOB" },
    { labelIncludes: "DATE OF BIRTH" },
  ],
  gender: [
    { id: "id-19e348ba" },
    { labelIncludes: "GENDER" },
  ],
  address1: [
    { id: "id-38a5bae0-street" },
    { id: "id-38a5bae0" },
    { labelIncludes: "street address" },
    { labelIncludes: "address" },
  ],
  address2: [
    { id: "id-0d142f9e" },
    { labelIncludes: "apartment" },
    { labelIncludes: "suite" },
  ],
  city: [
    { id: "id-38a5bae0-city" },
    { labelIncludes: "city" },
  ],
  state: [
    { id: "id-38a5bae0-state_code" },
    { id: "id-38a5bae0-state" },
    { labelIncludes: "state" },
  ],
  zip: [
    { id: "id-38a5bae0-zip" },
    { labelIncludes: "postal code" },
    { labelIncludes: "zip" },
  ],
};

const normalizeKey = (value?: string | null) =>
  value ? value.toString().toLowerCase().replace(/[^a-z0-9]/g, "") : "";

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

export function normalizeMedLinkPayload(payload): NormalizedIntake {
  // Log payload structure for debugging
  logger.debug("[Normalizer] Payload keys:", { keys: Object.keys(payload || {}) });
  logger.debug("[Normalizer] Payload type check", { 
    hasSections: !!payload?.sections, 
    hasAnswers: !!payload?.answers, 
    hasResponseId: !!payload?.responseId 
  });
  
  const submissionId =
    payload?.submissionId || payload?.responseId || payload?.id || payload?.submission_id || payload?.meta?.submissionId;
  const submittedAt = new Date(
    payload?.submittedAt || payload?.submitted_at || payload?.createdAt || Date.now()
  );

  const sections = buildSections(payload);
  const flatEntries = sections.flatMap((section: any) =>
    section.entries.map((entry: any) => ({ ...entry, section: section.title }))
  );
  
  logger.debug("[Normalizer] Extracted entries count:", { value: flatEntries.length });

  const patient = buildPatient(flatEntries);

  return {
    submissionId: submissionId ?? `medlink-${Date.now()}`,
    submittedAt,
    patient,
    sections,
    answers: flatEntries,
  };
}

function buildSections(payload): IntakeSection[] {
  // Check for data object structure (webhook format)
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    const answers: RawAnswer[] = [];
    
    // Map common field names to proper labels for better display
    const commonFieldMappings: Record<string, string> = {
      'First Name': 'First Name',
      'Last Name': 'Last Name',
      'Email': 'Email',
      'Phone': 'Phone Number',
      'Date of Birth': 'Date of Birth',
      'Gender': 'Gender',
      'Street Address': 'Street Address',
      'City': 'City',
      'State': 'State',
      'ZIP Code': 'ZIP Code',
      'Current Medications': 'Current Medications',
      'Allergies': 'Allergies',
      'Medical Conditions': 'Medical Conditions',
      'Chronic Conditions': 'Chronic Conditions',
      'Reason for Visit': 'Reason for Visit',
      'Chief Complaint': 'Chief Complaint',
      'Medical History': 'Medical History',
      'Family History': 'Family Medical History',
      'Surgical History': 'Surgical History',
      'Current Symptoms': 'Current Symptoms',
      'Pain Level': 'Pain Level',
      'Blood Pressure': 'Blood Pressure',
      'Heart Rate': 'Heart Rate',
      'Temperature': 'Temperature',
      'Weight': 'Current Weight',
      'Height': 'Height',
      'BMI': 'BMI',
      'Medications List': 'Current Medications List',
      'Medication Allergies': 'Medication Allergies',
      'Previous Treatments': 'Previous Treatments',
      'Mental Health History': 'Mental Health History',
      'Substance Use': 'Substance Use History',
      'Tobacco Use': 'Tobacco Use',
      'Alcohol Use': 'Alcohol Use',
      'Exercise Frequency': 'Exercise Frequency',
      'Diet Type': 'Diet Type',
      'Sleep Patterns': 'Sleep Patterns',
      'Stress Level': 'Stress Level',
    };
    
    // Extract all fields from the data object
    Object.entries(payload.data).forEach(([key, value]) => {
      // Skip metadata fields
      if (key === 'tags' || key === 'timestamp' || key === 'submissionId') {
        return;
      }
      
      // Use mapped label if available, otherwise use the key with better formatting
      const label = commonFieldMappings[key] || 
                   key.replace(/_/g, ' ')
                      .replace(/([a-z])([A-Z])/g, '$1 $2')
                      .replace(/\b\w/g, c => c.toUpperCase());
      
      answers.push({
        id: key,
        label: label,
        value: value as any,
      });
    });
    
    logger.debug('[Normalizer] Extracted answers from data object:', { value: answers.length });
    if (answers.length > 0) {
      logger.debug('[Normalizer] Sample fields:', answers.slice(0, 5).map((a: any) => `${a.label}: ${a.value}`));
    }
    
    if (answers.length > 0) {
      return [
        {
          title: "Medical Intake Form",
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
      'BMI': 'BMI',
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
        label: fieldLabels[key] || key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim(),
        value: value as any,
      });
    });
    
    if (answers.length > 0) {
      return [
        {
          title: "Responses",
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
        title: "Responses",
        entries: normalizeAnswers(payload.answers),
      },
    ];
  }

  if (payload?.fields && typeof payload.fields === "object") {
    const answers = Object.entries(payload.fields).map(([key, value]) => ({
      id: key,
      label: key,
      value,
    }));
    return [
      {
        title: "Responses",
        entries: normalizeAnswers(answers),
      },
    ];
  }

  return [
    {
      title: "Responses",
      entries: [],
    },
  ];
}

function normalizeAnswers(rawAnswers: RawAnswer[]): IntakeSection["entries"] {
  return rawAnswers
    .map((answer, index) => {
      const raw = answer.value ?? answer.answer ?? "";
      return {
        id: String(answer.id ?? index),
        label: String(answer.label ?? answer.question ?? answer.id ?? `Field ${index + 1}`),
        value: formatValue(raw),
        rawValue: raw,
      };
    })
    .filter((entry: any) => entry.value !== "");
}

function formatValue(value): string {
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function buildPatient(
  entries: Array<{ id: string; label: string; value: string; rawValue?: any }>
): NormalizedPatient {
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

  (Object.keys(PATIENT_FIELD_MATCHERS) as Array<keyof NormalizedPatient>).forEach((key: any) => {
    const matchers = PATIENT_FIELD_MATCHERS[key];
    const value = findValue(entries, matchers);
    if (value) {
      if (key === "dob") {
        const normalizedDob = normalizeDateInput(value);
        if (normalizedDob) {
          patient[key] = normalizedDob;
        }
      } else if (key === "phone") {
        patient[key] = sanitizePhone(value);
      } else if (key === "email") {
        patient[key] = value.trim().toLowerCase();
      } else if (key === "gender") {
        patient[key] = normalizeGenderInput(value);
      } else if (key === "state") {
        patient[key] = normalizeStateInput(value);
      } else if (key === "firstName" || key === "lastName") {
        patient[key] = capitalizeWords(value);
      } else {
        patient[key] = value;
      }
    }
  });

  applyDerivedFields(entries, patient);

  return patient;
}

function findValue(entries: Array<{ id: string; label: string; value: string }>, matchers: FieldMatcher[]) {
  for (const matcher of matchers) {
    if (matcher.id) {
      const matcherId = normalizeKey(matcher.id);
      const direct = entries.find((entry: any) => normalizeKey(entry.id) === matcherId);
      if (direct?.value) return direct.value;
    }
    if (matcher.labelIncludes) {
      const needle = matcher.labelIncludes.toLowerCase();
      const labelMatch = entries.find((entry: any) =>
        entry.label?.toLowerCase().includes(needle)
      );
      if (labelMatch?.value) return labelMatch.value;
    }
  }
  return undefined;
}

type EntryIndexRecord = { value: string; raw: any };

function buildEntryIndex(entries: Array<{ id: string; label: string; value: string; rawValue?: any }>) {
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

function parseMaybeJson(value) {
  if (!value) return undefined;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
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
  values.find((value: any) => typeof value === "string" && value.trim().length > 0)?.trim();

function applyDerivedFields(
  entries: Array<{ id: string; label: string; value: string; rawValue?: any }>,
  patient: NormalizedPatient
) {
  const index = buildEntryIndex(entries);

  const addressJson = getEntryJson(index, "id-38a5bae0");
  const street = firstNonEmpty(
    getEntryValue(index, "id-38a5bae0-street"),
    addressJson?.street,
    addressJson?.address1,
    addressJson?.street_1,
    addressJson?.address
  );
  const house = firstNonEmpty(getEntryValue(index, "id-38a5bae0-house"), addressJson?.house);
  const apartment = firstNonEmpty(
    getEntryValue(index, "id-0d142f9e"),
    addressJson?.apartment,
    addressJson?.apt
  );

  const composedStreet = [house, street].filter(Boolean).join(" ").trim();
  if (composedStreet) {
    patient.address1 = composedStreet;
  } else if (!patient.address1 && addressJson?.formattedAddress) {
    patient.address1 = addressJson.formattedAddress;
  } else if (!patient.address1 && typeof addressJson === "string") {
    patient.address1 = addressJson;
  }

  if (apartment) {
    patient.address2 = apartment;
  }

  const city = firstNonEmpty(getEntryValue(index, "id-38a5bae0-city"), addressJson?.city);
  if (city) {
    patient.city = city;
  }

  const zip = firstNonEmpty(getEntryValue(index, "id-38a5bae0-zip"), addressJson?.zip);
  if (zip) {
    patient.zip = zip;
  }

  const stateInput = firstNonEmpty(
    getEntryValue(index, "id-38a5bae0-state_code"),
    getEntryValue(index, "id-38a5bae0-state"),
    addressJson?.state_code,
    addressJson?.state
  );
  const normalizedState = normalizeStateInput(stateInput);
  if (normalizedState) {
    patient.state = normalizedState;
  }

  const dobValue = firstNonEmpty(getEntryValue(index, "id-01a47886"));
  if (dobValue) {
    const normalizedDob = normalizeDateInput(dobValue);
    if (normalizedDob) {
      patient.dob = normalizedDob;
    }
  }

  const phone =
    firstNonEmpty(
      getEntryValue(index, "phone-input-id-cc54007b"),
      getEntryValue(index, "country-select-id-cc54007b")
    ) ?? patient.phone;
  if (phone) {
    patient.phone = sanitizePhone(phone);
  }

  const email = firstNonEmpty(getEntryValue(index, "id-62de7872"));
  if (email) {
    patient.email = email.trim().toLowerCase();
  }

  const gender = firstNonEmpty(getEntryValue(index, "id-19e348ba"));
  if (gender) {
    patient.gender = normalizeGenderInput(gender);
  }

  if (!patient.firstName || patient.firstName === "Unknown") {
    const firstName =
      firstNonEmpty(getEntryValue(index, "id-b1679347")) ??
      (getEntryJson(index, "id-b1679347")?.first ?? getEntryJson(index, "id-b1679347")?.firstname);
    if (firstName) {
      patient.firstName = firstName;
    }
  }

  if (!patient.lastName || patient.lastName === "Unknown") {
    const lastName =
      firstNonEmpty(getEntryValue(index, "id-30d7dea8")) ??
      (getEntryJson(index, "id-30d7dea8")?.last ?? getEntryJson(index, "id-30d7dea8")?.lastname);
    if (lastName) {
      patient.lastName = capitalizeWords(lastName);
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

function normalizeDateInput(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, " ").trim().split(/\s+/);
  if (digits.length === 3) {
    let [first, second, third] = digits;
    if (first.length === 4 && second.length === 2 && third.length === 2) {
      return `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
    }
    if (first.length === 4) {
      return `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
    }
    if (third.length === 4) {
      let month = first;
      let day = second;
      if (parseInt(first, 10) > 12 && parseInt(second, 10) <= 12) {
        month = second;
        day = first;
      }
      const year = third;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    if (third.length === 2) {
      const year = parseInt(third, 10) > 30 ? `19${third}` : `20${third}`;
      return `${year}-${first.padStart(2, "0")}-${second.padStart(2, "0")}`;
    }
  }
  return trimmed;
}

function sanitizePhone(value?: string) {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits;
}

function capitalizeWords(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word: any) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

function normalizeGenderInput(value?: string) {
  if (!value) return "";
  const upper = value.trim().toUpperCase();
  if (upper.startsWith("F")) return "F";
  if (upper.startsWith("M")) return "M";
  return upper || value;
}
