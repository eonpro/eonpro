/**
 * Patient Domain Types
 * ====================
 *
 * Type definitions for patient domain entities and DTOs.
 * These types provide type safety and documentation for patient operations.
 *
 * @module domains/patient/types
 */

/**
 * Patient entity as stored in the database
 */
export interface PatientEntity {
  id: number;
  createdAt: Date;
  clinicId: number;
  patientId: string | null;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  lifefileId: string | null;
  notes: string | null;
  tags: string[] | null;
  stripeCustomerId: string | null;
  source: PatientSource;
  sourceMetadata: PatientSourceMetadata | null;
}

/**
 * Patient with clinic information included
 */
export interface PatientWithClinic extends PatientEntity {
  clinic: {
    id: number;
    name: string;
    subdomain: string | null;
  };
}

/**
 * Patient source types
 */
export type PatientSource = 'manual' | 'webhook' | 'api' | 'referral' | 'import';

/**
 * Metadata about how patient was created
 */
export interface PatientSourceMetadata {
  endpoint?: string;
  timestamp?: string;
  userAgent?: string;
  createdBy?: string;
  createdByRole?: string;
  createdById?: number;
  webhookUrl?: string;
  referrerId?: string;
  importBatch?: string;
}

/**
 * Patient summary for list views (minimal PHI)
 */
export interface PatientSummary {
  id: number;
  patientId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  tags: string[] | null;
  source: PatientSource;
  createdAt: Date;
  clinicId: number;
}

/**
 * Patient summary with clinic name for super admin views
 */
export interface PatientSummaryWithClinic extends PatientSummary {
  clinicName: string | null;
}

/**
 * Input for creating a new patient
 */
export interface CreatePatientInput {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  zip: string;
  notes?: string | null;
  tags?: string[] | null;
  clinicId: number;
  source?: PatientSource;
  sourceMetadata?: PatientSourceMetadata;
}

/**
 * Input for updating an existing patient
 */
export interface UpdatePatientInput {
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  email?: string;
  address1?: string;
  address2?: string | null;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string | null;
  tags?: string[] | null;
}

/**
 * Options for filtering patient queries
 */
export interface PatientFilterOptions {
  /** Filter by clinic ID (required for multi-tenant isolation) */
  clinicId?: number;
  /** Filter by creation date range */
  createdAfter?: Date;
  createdBefore?: Date;
  /** Search by name or email */
  search?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by source */
  source?: PatientSource;
}

/**
 * Options for paginating patient queries
 */
export interface PatientPaginationOptions {
  /** Maximum number of results (default: 100, max: 500) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: 'createdAt' | 'firstName' | 'lastName';
  /** Order direction */
  orderDir?: 'asc' | 'desc';
}

/**
 * Paginated patient result
 */
export interface PaginatedPatients<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Patient with related counts for deletion checks
 */
export interface PatientWithCounts extends PatientEntity {
  _count: {
    orders: number;
    documents: number;
    soapNotes: number;
    appointments: number;
  };
}

/**
 * Audit context for tracking who performed an action
 */
export interface AuditContext {
  actorEmail: string;
  actorRole: string;
  actorId?: number;
}
