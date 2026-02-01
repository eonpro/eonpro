/**
 * Overtime Men's Clinic Integration Module
 * 
 * Provides intake normalization, treatment type detection, and intake section
 * configuration for Overtime Men's Clinic (subdomain: ot).
 * 
 * Supports 6 treatment types:
 * 1. Weight Loss (GLP-1)
 * 2. Peptides
 * 3. NAD+
 * 4. Better Sex (ED/Sexual Health)
 * 5. Testosterone Replacement (TRT)
 * 6. Baseline/Bloodwork
 */

// Types
export type {
  OvertimeTreatmentType,
  OvertimePayload,
  OvertimeWebhookPayload,
  OvertimeCommonFields,
  WeightLossFields,
  PeptidesFields,
  NadPlusFields,
  BetterSexFields,
  TestosteroneFields,
  BaselineBloodworkFields,
} from './types';

// Re-export shared types
export type {
  IntakeEntry,
  IntakeSection,
  NormalizedIntake,
  NormalizedPatient,
} from './types';

// Treatment Types
export {
  OVERTIME_TREATMENT_TYPES,
  TREATMENT_TYPE_LABELS,
  TREATMENT_TYPE_DESCRIPTIONS,
  TREATMENT_TYPE_TAGS,
  AIRTABLE_TABLE_TO_TREATMENT,
  detectTreatmentType,
  getTagsForTreatment,
  isCheckoutComplete,
} from './treatmentTypes';

// Normalizer
export {
  normalizeOvertimePayload,
  extractPromoCode,
} from './intakeNormalizer';

// Intake Sections
export {
  OVERTIME_INTAKE_SECTIONS,
  getOvertimeIntakeSections,
  hasOvertimeIntakeSections,
  getIntakeSectionsForOvertimeClinic,
} from './intakeSections';

// Airtable API Client
export {
  AirtableClient,
  createAirtableClient,
  OVERTIME_AIRTABLE_TABLES,
  COMMON_FIELD_MAP,
  TREATMENT_FIELD_MAPS,
  getTreatmentTypeForTable,
  getTableIdForTreatment,
} from './airtableClient';
export type {
  AirtableConfig,
  AirtableTable,
  AirtableRecord,
  AirtableListResponse,
  AirtableSyncResult,
} from './airtableClient';

// Airtable Sync Service
export { AirtableSyncService, createSyncService } from './airtableSyncService';
export type { SyncOptions, SyncSummary } from './airtableSyncService';
