/**
 * Airtable API Client for Overtime Men's Clinic
 *
 * Provides direct API access to pull intake data from Airtable tables
 * instead of relying on webhook automations.
 */

import { OvertimeTreatmentType } from './types';

// =============================================================================
// Types
// =============================================================================

export interface AirtableConfig {
  apiKey: string;
  baseId: string;
}

export interface AirtableTable {
  id: string;
  name: string;
  treatmentType: OvertimeTreatmentType;
}

export interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

export interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string; // Pagination cursor
}

export interface AirtableSyncResult {
  table: string;
  treatmentType: OvertimeTreatmentType;
  recordsProcessed: number;
  recordIds: string[];
  errors: Array<{ recordId: string; error: string }>;
}

// =============================================================================
// Table Mappings
// =============================================================================

/**
 * Maps Airtable table IDs to treatment types
 * These IDs were retrieved from the Airtable metadata API
 */
export const OVERTIME_AIRTABLE_TABLES: AirtableTable[] = [
  {
    id: 'tblnznnhTgy5Li66k',
    name: 'OT Mens - Weight Loss',
    treatmentType: 'weight_loss',
  },
  {
    id: 'tbl5wJs4jGsPegseO',
    name: 'OT Mens - Peptide Therapy',
    treatmentType: 'peptides',
  },
  {
    id: 'tbl8WmRKhlcb5bQ9e',
    name: 'OT Mens - NAD',
    treatmentType: 'nad_plus',
  },
  {
    id: 'tblwZg0EuVlmz0I01',
    name: 'OT Mens - Better Sex',
    treatmentType: 'better_sex',
  },
  {
    id: 'tblYfQCW70CR86Cnt',
    name: 'OT Mens - TRT',
    treatmentType: 'testosterone',
  },
  {
    id: 'tbl3LS20Y4nMVbqv1',
    name: 'OT Mens - Baseline',
    treatmentType: 'baseline_bloodwork',
  },
];

// =============================================================================
// Field Mappings (Airtable field names → normalized field names)
// =============================================================================

/**
 * Common fields present in all tables
 */
export const COMMON_FIELD_MAP: Record<string, string> = {
  // Identifiers
  'Response ID': 'submission-id',
  'Heyflow ID': 'heyflow-id',

  // Patient Info
  'First name': 'first-name',
  'Last name': 'last-name',
  'DOB': 'dob',
  'email': 'email',
  'phone number': 'phone',
  'Gender': 'gender',
  'State': 'state',

  // Address
  'Address': 'address',
  'Address [Street]': 'street',
  'Address [house]': 'house-number',
  'Address [City]': 'city',
  'Address [State]': 'address-state',
  'Address [Zip]': 'zip',
  'Address [Country]': 'country',
  'apartment#': 'apartment',

  // Physical
  'starting weight': 'current-weight',
  'Height [feet]': 'height-feet',
  'Height [inches]': 'height-inches',

  // Referral & Marketing
  'How did you hear about us?': 'referral-source',
  'Who reccomended OT Mens Health to you?': 'referrer-name',
  'Who recommended OT Mens Health to you?': 'referrer-name', // TRT has different spelling
  'INFLUENCER CODE': 'promo-code',
  'Referrer': 'referrer-url',
  'URL': 'submission-url',
  'URL with parameters': 'submission-url-params',

  // Consent & Marketing
  'Consent Forms ': 'consent-forms',
  '18+ Consent': 'age-consent',
  'marketing consent': 'marketing-consent',

  // Medical Common
  'Drinking': 'alcohol-use',
  'Allergies': 'has-allergies',
  'Allergies ': 'has-allergies', // Some tables have trailing space
  'Which allergies': 'allergy-details',
  'List of Allergies': 'allergy-details',
  'Allergy Type': 'allergy-details',

  // IntakeQ Integration
  'IntakeQ Status': 'intakeq-status',
  'IntakeQ Client ID': 'intakeq-client-id',

  // A/B Testing
  'A/B Test ID': 'ab-test-id',
  'A/B Test Version': 'ab-test-version',
};

/**
 * Treatment-specific field mappings
 */
export const TREATMENT_FIELD_MAPS: Record<OvertimeTreatmentType, Record<string, string>> = {
  weight_loss: {
    // ═══════════════════════════════════════════════════════════════════
    // OT Mens - Weight Loss Airtable Table (Heyflow ID: uvvNo2JSHPctHpG87s0x)
    // Complete field mapping from Airtable screenshot
    // ═══════════════════════════════════════════════════════════════════

    // Weight Goals
    'ideal weight': 'goal-weight',
    'BMI': 'bmi',

    // GLP-1 History
    'GLP-1 History': 'glp1-history',
    'Type of GLP-1': 'glp1-type',
    'Happy with GLP-1 Dose': 'glp1-dose-satisfaction',
    'Side Effect History': 'side-effect-history',

    // Semaglutide Specific
    'Semaglutide Dose': 'semaglutide-dose',
    'Semaglutide Side Effects': 'semaglutide-side-effects',
    'Semaglutide Success': 'semaglutide-success',

    // Tirzepatide Specific
    'Tirzepatide Dose': 'tirzepatide-dose',
    'Tirzepatide Side Effects': 'tirzepatide-side-effects',
    'Tirzepatide Success': 'tirzepatide-success',

    // Weight Loss Motivation
    'How would your life change by losing weight': 'weight-loss-motivation',
    'Activity Level': 'activity-level',

    // Contraindications (Critical for GLP-1)
    'Thyroid Cancer': 'thyroid-cancer-history',
    'Neoplasia type 2 (MEN 2)': 'men2-history',
    'Pancreatitis': 'pancreatitis-history',
    'Gastroparesis': 'gastroparesis',
    'Pregnant or Breastfeeding': 'pregnant-breastfeeding',
    'Type 2 Diabetes': 'type2-diabetes',

    // Chronic Conditions
    'Chronic Illness': 'has-chronic-illness',
    'Type of Chronic Illness': 'chronic-illness-type',
    'Type of  Chronic Illness': 'chronic-illness-type', // Handle double space variant
    'Specific Chronic Illness': 'chronic-illness-details',
    'Family History Diagnoses': 'family-history',
    'Blood Pressure': 'blood-pressure',

    // Surgery History
    'Past surgery': 'past-surgery',
    'Surgery Type': 'surgery-type',

    // Mental Health
    'Mental Health': 'mental-health-status',
    'Mental health Diagnosis': 'mental-health-diagnosis',

    // Medications
    'Medications / Supplements': 'current-medications',
    'Which Medication /Supplement': 'medication-list',
    'Alcohol Use': 'alcohol-use',

    // Treatment Preferences
    'Qualifying Conditions': 'qualifying-conditions',
    'Personalized Treatment': 'treatment-preferences',
  },

  peptides: {
    'Symptoms ': 'symptoms',
    'Peptide choice': 'peptide-choice',
    'goals': 'treatment-goals',
    'What are you looking to Optimize?': 'optimization-goals',
    'Activity Level': 'activity-level',
    'Medications [current]': 'current-medications',
    'List of medications': 'medication-list',
    'Prescription Medications': 'prescription-medications',
    'Chronic Kidney Disease ': 'chronic-kidney-disease',
    'Conditions': 'medical-conditions',
    'Cancer ': 'cancer-history',
    'Bloodowrk': 'recent-bloodwork',
    'B12 Deficiency': 'b12-deficiency',
  },

  nad_plus: {
    'NAD Goals': 'nad-goals',
    'Health Goals': 'health-goals',
    'goals': 'treatment-goals',
    'Used NAD Before': 'prior-nad-experience',
    'Prescription Medications': 'prescription-medications',
    'List of medications': 'medication-list',
    'Chronic Illnesses': 'chronic-illnesses',
    'Kidney Disease': 'kidney-disease',
    'Cancer ': 'cancer-history',
  },

  better_sex: {
    // ═══════════════════════════════════════════════════════════════════
    // OT Mens - Better Sex Airtable Table (Heyflow ID: 5ypJkFxQN4V4U4PB7R4u)
    // Complete field mapping from Airtable screenshot
    // ═══════════════════════════════════════════════════════════════════

    // Symptoms & Duration
    'Symptoms': 'symptoms',
    'How long have you notice': 'symptom-duration',
    'How often do these sexual issues occur?': 'symptom-frequency',

    // Treatment Goals
    'goals': 'treatment-goals',

    // Physical Activity & Lifestyle
    'Physical Active': 'physical-activity',
    'Smoke/Nicotine': 'smoking-status',

    // Medical History - Cardiovascular (Critical for ED meds)
    'Heart condition': 'heart-condition',
    'Chest Pains': 'chest-pain-history',
    'meds with nitrates or nitroglycerin': 'nitrate-medications',

    // Chronic Conditions
    'Chronic Disease': 'chronic-disease',
    'Chronic Illnesses': 'chronic-illnesses',
    'Specific Conditions': 'specific-conditions',
    'Cancer': 'cancer-history',

    // Medications
    'Medications': 'current-medications',
    'List of Medications': 'medication-list',

    // Lab Work
    'Labwork': 'recent-labwork',

    // Allergies
    'Which allergies': 'allergy-details',
  },

  testosterone: {
    'Main Results to acchive': 'treatment-goals',
    'Medications, vitamins, Supplements': 'current-medications',
    'List of medications, vitamins, supplements': 'medication-list',
    'Allergic to': 'allergic-to',
    'Specific Medications': 'specific-medications',
    'Chronic Conditions': 'chronic-conditions',
    'Blood Pressure': 'blood-pressure',
    'Previous Therapies (Hormone, Pept, GLP1)': 'previous-therapies',
    'Self Administration': 'self-administration-comfort',
    'bloodwork': 'recent-bloodwork',
    'Lab Results': 'lab-results',
  },

  baseline_bloodwork: {
    'Why Labs': 'lab-reasons',
    'Health areas insights': 'health-areas-interest',
    'changes in body': 'body-changes',
    'Importance of tracking results': 'tracking-importance',
    'Medications [current]': 'current-medications',
    'List of medications': 'medication-list',
    'Specific Supplements': 'specific-supplements',
    'Chronic Disease': 'chronic-disease',
    'List of disease': 'disease-list',
    'Bloodowrk': 'recent-bloodwork',
  },
};

// =============================================================================
// Airtable API Client
// =============================================================================

export class AirtableClient {
  private readonly apiKey: string;
  private readonly baseId: string;
  private readonly baseUrl = 'https://api.airtable.com/v0';

  constructor(config?: Partial<AirtableConfig>) {
    this.apiKey = config?.apiKey || process.env.AIRTABLE_API_KEY || '';
    this.baseId = config?.baseId || process.env.OVERTIME_AIRTABLE_BASE_ID || 'apppl0Heha1sOti59';

    if (!this.apiKey) {
      throw new Error('Airtable API key is required. Set AIRTABLE_API_KEY environment variable.');
    }
  }

  /**
   * Fetch records from a specific table
   */
  async listRecords(
    tableId: string,
    options?: {
      filterByFormula?: string;
      maxRecords?: number;
      pageSize?: number;
      offset?: string;
      sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
      fields?: string[];
    }
  ): Promise<AirtableListResponse> {
    const url = new URL(`${this.baseUrl}/${this.baseId}/${tableId}`);

    if (options?.filterByFormula) {
      url.searchParams.set('filterByFormula', options.filterByFormula);
    }
    if (options?.maxRecords) {
      url.searchParams.set('maxRecords', options.maxRecords.toString());
    }
    if (options?.pageSize) {
      url.searchParams.set('pageSize', options.pageSize.toString());
    }
    if (options?.offset) {
      url.searchParams.set('offset', options.offset);
    }
    if (options?.sort) {
      options.sort.forEach((s, i) => {
        url.searchParams.set(`sort[${i}][field]`, s.field);
        url.searchParams.set(`sort[${i}][direction]`, s.direction);
      });
    }
    if (options?.fields) {
      options.fields.forEach((f) => url.searchParams.append('fields[]', f));
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Airtable API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  /**
   * Fetch all records from a table (handles pagination automatically)
   */
  async listAllRecords(
    tableId: string,
    options?: {
      filterByFormula?: string;
      sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
      fields?: string[];
    }
  ): Promise<AirtableRecord[]> {
    const allRecords: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
      const response = await this.listRecords(tableId, {
        ...options,
        pageSize: 100, // Max allowed by Airtable
        offset,
      });

      allRecords.push(...response.records);
      offset = response.offset;

      // Rate limiting: Airtable allows 5 requests/second
      if (offset) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } while (offset);

    return allRecords;
  }

  /**
   * Get a single record by ID
   */
  async getRecord(tableId: string, recordId: string): Promise<AirtableRecord> {
    const response = await fetch(`${this.baseUrl}/${this.baseId}/${tableId}/${recordId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Airtable API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  /**
   * Update a record (e.g., to mark it as synced)
   */
  async updateRecord(
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>
  ): Promise<AirtableRecord> {
    const response = await fetch(`${this.baseUrl}/${this.baseId}/${tableId}/${recordId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Airtable API error: ${response.status} - ${JSON.stringify(error)}`);
    }

    return response.json();
  }

  /**
   * Normalize an Airtable record's fields using the field mappings
   */
  normalizeFields(
    fields: Record<string, unknown>,
    treatmentType: OvertimeTreatmentType
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {
      treatmentType,
    };

    // Apply common field mappings
    for (const [airtableField, normalizedField] of Object.entries(COMMON_FIELD_MAP)) {
      if (fields[airtableField] !== undefined && fields[airtableField] !== null) {
        normalized[normalizedField] = fields[airtableField];
      }
    }

    // Apply treatment-specific field mappings
    const treatmentMap = TREATMENT_FIELD_MAPS[treatmentType];
    if (treatmentMap) {
      for (const [airtableField, normalizedField] of Object.entries(treatmentMap)) {
        if (fields[airtableField] !== undefined && fields[airtableField] !== null) {
          normalized[normalizedField] = fields[airtableField];
        }
      }
    }

    // Also include any unmapped fields with their original names (kebab-cased)
    for (const [key, value] of Object.entries(fields)) {
      const kebabKey = key
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!normalized[kebabKey] && value !== undefined && value !== null) {
        normalized[kebabKey] = value;
      }
    }

    return normalized;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a default Airtable client instance
 */
export function createAirtableClient(): AirtableClient {
  return new AirtableClient();
}

/**
 * Get the treatment type for a given table ID
 */
export function getTreatmentTypeForTable(tableId: string): OvertimeTreatmentType | null {
  const table = OVERTIME_AIRTABLE_TABLES.find((t) => t.id === tableId);
  return table?.treatmentType ?? null;
}

/**
 * Get the table ID for a given treatment type
 */
export function getTableIdForTreatment(treatmentType: OvertimeTreatmentType): string | null {
  const table = OVERTIME_AIRTABLE_TABLES.find((t) => t.treatmentType === treatmentType);
  return table?.id ?? null;
}
