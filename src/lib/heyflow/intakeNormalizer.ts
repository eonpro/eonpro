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

/**
 * Patient field matchers - prioritizes fuzzy label matching over hardcoded IDs
 * 
 * The matchers are checked in order:
 * 1. labelIncludes - fuzzy label matching (most reliable, works across form versions)
 * 2. id - hardcoded field IDs (fallback for known form versions)
 * 
 * This approach is more resilient to form changes as label text is more stable than field IDs.
 */
const PATIENT_FIELD_MATCHERS: Record<keyof NormalizedPatient, FieldMatcher[]> = {
  firstName: [
    // Fuzzy label matching (prioritized)
    { labelIncludes: "first name" },
    { labelIncludes: "firstname" },
    { labelIncludes: "given name" },
    { labelIncludes: "nombre" },  // Spanish
    // Hardcoded IDs (fallback)
    { id: "id-b1679347" },
    { id: "idb1679347" },
    { id: "firstName" },
  ],
  lastName: [
    { labelIncludes: "last name" },
    { labelIncludes: "lastname" },
    { labelIncludes: "surname" },
    { labelIncludes: "family name" },
    { labelIncludes: "apellido" },  // Spanish
    { id: "id-30d7dea8" },
    { id: "id30d7dea8" },
    { id: "lastName" },
  ],
  email: [
    { labelIncludes: "email" },
    { labelIncludes: "e-mail" },
    { labelIncludes: "correo" },  // Spanish
    { id: "id-62de7872" },
    { id: "email" },
  ],
  phone: [
    { labelIncludes: "phone" },
    { labelIncludes: "mobile" },
    { labelIncludes: "cell" },
    { labelIncludes: "telephone" },
    { labelIncludes: "tel" },
    { labelIncludes: "teléfono" },  // Spanish
    { id: "phone-input-id-cc54007b" },
    { id: "id-cc54007b" },
    { id: "phone" },
  ],
  dob: [
    { labelIncludes: "date of birth" },
    { labelIncludes: "birth date" },
    { labelIncludes: "birthdate" },
    { labelIncludes: "dob" },
    { labelIncludes: "birthday" },
    { labelIncludes: "fecha de nacimiento" },  // Spanish
    { id: "id-01a47886" },
    { id: "dob" },
    { id: "dateOfBirth" },
  ],
  gender: [
    { labelIncludes: "gender" },
    { labelIncludes: "sex" },
    { labelIncludes: "género" },  // Spanish
    { id: "id-19e348ba" },
    { id: "gender" },
  ],
  address1: [
    { labelIncludes: "street address" },
    { labelIncludes: "address line 1" },
    { labelIncludes: "address1" },
    { labelIncludes: "street" },
    { labelIncludes: "dirección" },  // Spanish
    { id: "id-38a5bae0-street" },
    { id: "id-38a5bae0" },
    { id: "address1" },
    { id: "streetAddress" },
  ],
  address2: [
    { labelIncludes: "apartment" },
    { labelIncludes: "suite" },
    { labelIncludes: "unit" },
    { labelIncludes: "apt" },
    { labelIncludes: "address line 2" },
    { labelIncludes: "address2" },
    { id: "id-0d142f9e" },
    { id: "address2" },
  ],
  city: [
    { labelIncludes: "city" },
    { labelIncludes: "town" },
    { labelIncludes: "ciudad" },  // Spanish
    { id: "id-38a5bae0-city" },
    { id: "city" },
  ],
  state: [
    { labelIncludes: "state" },
    { labelIncludes: "province" },
    { labelIncludes: "region" },
    { labelIncludes: "estado" },  // Spanish
    { id: "id-38a5bae0-state_code" },
    { id: "id-38a5bae0-state" },
    { id: "state" },
  ],
  zip: [
    { labelIncludes: "zip" },
    { labelIncludes: "postal code" },
    { labelIncludes: "postcode" },
    { labelIncludes: "código postal" },  // Spanish
    { id: "id-38a5bae0-zip" },
    { id: "zip" },
    { id: "zipCode" },
    { id: "postalCode" },
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

export function normalizeMedLinkPayload(payload: Record<string, unknown>): NormalizedIntake {
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

function buildSections(payload: Record<string, unknown>): IntakeSection[] {
  // Check for data object structure (webhook format)
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    const answers: RawAnswer[] = [];
    
    // Extract all fields from the data object
    Object.entries(payload.data).forEach(([key, value]) => {
      // Skip tags array for now (handle separately if needed)
      if (key === 'tags' || key === 'timestamp' || key === 'submissionId') {
        return;
      }
      
      // Add as an answer with the key as label
      answers.push({
        id: key,
        label: key,
        value: value as any,
      });
    });
    
    logger.debug('[Normalizer] Extracted answers from data object:', { value: answers.length });
    
    if (answers.length > 0) {
      return [
        {
          title: "Intake Form",
          entries: normalizeAnswers(answers),
        },
      ];
    }
  }
  
  // Check for MedLink v2 format with responseId and fields at root level
  if (payload?.responseId && !payload?.sections && !payload?.answers) {
    const answers: RawAnswer[] = [];
    
    // Map of field IDs to human-readable labels
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
      'id-d79f4058': 'Have you been diagnosed with any mental health condition?',
      'id-2ce042cd': 'Do you have any medical conditions or chronic illnesses?',
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

function formatValue(value: unknown): string {
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

/**
 * Finds a value from entries using flexible matching strategies.
 * 
 * Strategy priority:
 * 1. Label-based matching (most reliable across form versions)
 * 2. ID-based matching (fallback for known form fields)
 * 
 * This prioritization ensures resilience when form field IDs change
 * but labels remain consistent.
 */
function findValue(entries: Array<{ id: string; label: string; value: string }>, matchers: FieldMatcher[]) {
  // First pass: try all label matchers (more reliable)
  for (const matcher of matchers) {
    if (matcher.labelIncludes) {
      const needle = matcher.labelIncludes.toLowerCase();
      const labelMatch = entries.find((entry: any) =>
        entry.label?.toLowerCase().includes(needle)
      );
      if (labelMatch?.value) {
        logger.debug(`[Normalizer] Found "${matcher.labelIncludes}" by label match: ${labelMatch.value.slice(0, 50)}`);
        return labelMatch.value;
      }
    }
  }
  
  // Second pass: try ID matchers (fallback)
  for (const matcher of matchers) {
    if (matcher.id) {
      const matcherId = normalizeKey(matcher.id);
      const direct = entries.find((entry: any) => normalizeKey(entry.id) === matcherId);
      if (direct?.value) {
        logger.debug(`[Normalizer] Found "${matcher.id}" by ID match: ${direct.value.slice(0, 50)}`);
        return direct.value;
      }
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

function parseMaybeJson(value: unknown): unknown {
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

  const zip = firstNonEmpty(
    getEntryValue(index, "id-38a5bae0-zip"),
    getEntryValue(index, "id-38a5bae0-postal_code"),
    getEntryValue(index, "id-38a5bae0-zipcode"),
    addressJson?.zip,
    addressJson?.postal_code,
    addressJson?.zipcode,
    addressJson?.postalCode
  );
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
