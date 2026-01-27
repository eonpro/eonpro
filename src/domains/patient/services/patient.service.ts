/**
 * Patient Service
 * ================
 *
 * Business logic layer for patient operations.
 * Handles validation, authorization, and orchestrates repository calls.
 *
 * @module domains/patient/services
 */

import { z } from 'zod';

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  ValidationError,
  Errors,
  type ValidationErrorDetail,
} from '@/domains/shared/errors';

import type { UserContext } from '@/domains/shared/types';

import {
  type PatientRepository,
  patientRepository as defaultRepo,
} from '../repositories';

import type {
  PatientEntity,
  PatientSummary,
  PatientSummaryWithClinic,
  CreatePatientInput,
  UpdatePatientInput,
  PatientFilterOptions,
  PatientPaginationOptions,
  PaginatedPatients,
  AuditContext,
} from '../types';

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * US state codes for validation
 */
const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
] as const;

/**
 * State name to code mapping for normalization
 */
const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR', 'virgin islands': 'VI', 'guam': 'GU',
};

// Add codes as keys too
US_STATE_CODES.forEach((code) => {
  STATE_NAME_TO_CODE[code.toLowerCase()] = code;
});

/**
 * Normalize state input to 2-letter code
 */
const stateSchema = z.string().transform((val, ctx) => {
  const trimmed = val?.trim();
  if (!trimmed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'State is required' });
    return z.NEVER;
  }
  const normalized = trimmed.toLowerCase();
  const code = STATE_NAME_TO_CODE[normalized];
  if (code) {
    return code;
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid state: ${val}` });
  return z.NEVER;
});

/**
 * Normalize gender input
 */
const genderSchema = z.string().transform((val, ctx) => {
  const trimmed = val?.trim();
  if (!trimmed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gender is required' });
    return z.NEVER;
  }
  const normalized = trimmed.toLowerCase();
  if (['m', 'male', 'man'].includes(normalized)) {
    return 'm';
  }
  if (['f', 'female', 'woman'].includes(normalized)) {
    return 'f';
  }
  if (['other', 'o', 'non-binary', 'nonbinary', 'nb'].includes(normalized)) {
    return 'other';
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid gender: ${val}` });
  return z.NEVER;
});

/**
 * Phone number normalization
 */
const phoneSchema = z.string().transform((val, ctx) => {
  const trimmed = val?.trim();
  if (!trimmed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Phone is required' });
    return z.NEVER;
  }
  // Remove non-digits
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Phone must be at least 10 digits' });
    return z.NEVER;
  }
  // Return normalized format
  return digits.length === 10 ? digits : digits.slice(-10);
});

/**
 * Email validation
 */
const emailSchema = z.string().email('Invalid email format').transform((val) => val.toLowerCase().trim());

/**
 * Date of birth validation (accepts various formats)
 */
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$|^(\d{2})[/-](\d{2})[/-](\d{4})$/;

const dobSchema = z.string().transform((val, ctx) => {
  const trimmed = val?.trim();
  if (!trimmed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date of birth is required' });
    return z.NEVER;
  }
  // Accept YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY
  const match = DATE_REGEX.exec(trimmed);
  if (!match) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date format. Use YYYY-MM-DD' });
    return z.NEVER;
  }
  // Normalize to YYYY-MM-DD
  if (match[1]) {
    return trimmed;
  }
  return `${match[6]}-${match[4]}-${match[5]}`;
});

/**
 * ZIP code validation
 */
const ZIP_REGEX = /^\d{5}(-?\d{4})?$/;

/**
 * Time filter regex (e.g., '24h', '7d')
 */
const TIME_FILTER_REGEX = /^(\d+)(h|d)$/;

/**
 * Error messages
 */
const ERR_NO_CLINIC = 'No clinic associated with your account';

const zipSchema = z.string().transform((val, ctx) => {
  const trimmed = val?.trim();
  if (!trimmed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ZIP code is required' });
    return z.NEVER;
  }
  const zip = trimmed.replace(/\s/g, '');
  // Accept 5 or 9 digit ZIP
  if (!ZIP_REGEX.test(zip)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid ZIP code format' });
    return z.NEVER;
  }
  return zip;
});

/**
 * Schema for creating a patient
 */
export const createPatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dob: dobSchema,
  gender: genderSchema,
  phone: phoneSchema,
  email: emailSchema,
  address1: z.string().min(1, 'Address is required').max(200),
  address2: z.string().max(200).nullable().optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: stateSchema,
  zip: zipSchema,
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

/**
 * Schema for updating a patient (all fields optional)
 */
export const updatePatientSchema = createPatientSchema.partial();

/**
 * Preprocess update data: filter out empty strings for optional address fields
 * This allows the frontend to send empty strings without triggering validation errors
 */
function preprocessUpdateData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  
  const input = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  
  // Fields where empty string should be treated as "no update"
  const optionalFields = ['address1', 'address2', 'city', 'state', 'zip'];
  
  for (const [key, value] of Object.entries(input)) {
    // Skip empty strings for optional fields
    if (optionalFields.includes(key) && value === '') {
      continue;
    }
    // Keep all other values (including empty strings for required fields - let validation handle those)
    if (value !== undefined) {
      result[key] = value;
    }
  }
  
  return result;
}

// ============================================================================
// Types (re-export from shared)
// ============================================================================

// UserContext is imported from @/domains/shared/types
export type { UserContext } from '@/domains/shared/types';

/**
 * Options for listing patients
 */
export interface ListPatientsOptions extends PatientPaginationOptions {
  /** Filter by recent time period (e.g., '24h', '7d', '30d') */
  recent?: string;
  /** Search by name or patient ID */
  search?: string;
  /** Filter by source */
  source?: 'manual' | 'webhook' | 'api' | 'referral' | 'import';
  /** Filter by tags */
  tags?: string[];
}

// ============================================================================
// Service Interface
// ============================================================================

export interface PatientService {
  /**
   * Get a patient by ID with authorization check
   */
  getPatient(id: number, user: UserContext): Promise<PatientEntity>;

  /**
   * List patients with filtering (respects user's clinic)
   */
  listPatients(
    user: UserContext,
    options?: ListPatientsOptions
  ): Promise<PaginatedPatients<PatientSummary> | PaginatedPatients<PatientSummaryWithClinic>>;

  /**
   * Create a new patient with validation
   */
  createPatient(
    data: unknown,
    user: UserContext
  ): Promise<PatientEntity>;

  /**
   * Update a patient with validation and authorization
   */
  updatePatient(
    id: number,
    data: unknown,
    user: UserContext
  ): Promise<PatientEntity>;

  /**
   * Delete a patient (admin only)
   */
  deletePatient(id: number, user: UserContext): Promise<void>;

  /**
   * Check if email is already registered in clinic
   */
  isEmailRegistered(email: string, clinicId: number, excludePatientId?: number): Promise<boolean>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a patient service instance
 */
export function createPatientService(repo: PatientRepository = defaultRepo): PatientService {
  return {
    async getPatient(id: number, user: UserContext): Promise<PatientEntity> {
      // Determine clinic filter based on role
      // Convert null to undefined for type compatibility
      const clinicId = user.role === 'super_admin' ? undefined : (user.clinicId ?? undefined);

      // Require clinic for non-super-admin
      if (user.role !== 'super_admin' && !clinicId) {
        throw new ForbiddenError(ERR_NO_CLINIC);
      }

      const patient = await repo.findById(id, clinicId);

      // Additional check for patient role - can only see own record
      if (user.role === 'patient' && user.patientId !== patient.id) {
        throw new ForbiddenError('You can only access your own patient record');
      }

      return patient;
    },

    async listPatients(
      user: UserContext,
      options: ListPatientsOptions = {}
    ): Promise<PaginatedPatients<PatientSummary> | PaginatedPatients<PatientSummaryWithClinic>> {
      // Build filter
      const filter: PatientFilterOptions = {};

      // Clinic isolation (super_admin sees all)
      if (user.role !== 'super_admin') {
        if (!user.clinicId) {
          throw new ForbiddenError(ERR_NO_CLINIC);
        }
        filter.clinicId = user.clinicId;
      }

      // Parse recent time filter
      if (options.recent) {
        const now = new Date();
        const match = TIME_FILTER_REGEX.exec(options.recent);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2];
          const ms = unit === 'h' ? value * 60 * 60 * 1000 : value * 24 * 60 * 60 * 1000;
          filter.createdAfter = new Date(now.getTime() - ms);
        }
      }

      if (options.search) {
        filter.search = options.search;
      }

      if (options.source) {
        filter.source = options.source;
      }

      if (options.tags?.length) {
        filter.tags = options.tags;
      }

      // Pagination
      const pagination: PatientPaginationOptions = {
        limit: options.limit,
        offset: options.offset,
        orderBy: options.orderBy,
        orderDir: options.orderDir,
      };

      // Super admin gets clinic info
      if (user.role === 'super_admin') {
        return repo.findManyWithClinic(filter, pagination);
      }

      return repo.findMany(filter, pagination);
    },

    async createPatient(data: unknown, user: UserContext): Promise<PatientEntity> {
      // Validate input
      const parsed = createPatientSchema.safeParse(data);
      if (!parsed.success) {
        throw convertZodToValidationError(parsed.error);
      }

      // Determine clinic
      let clinicId: number;
      if (user.role === 'super_admin') {
        // Super admin must provide clinic in data
        const inputData = data as Record<string, unknown>;
        if (typeof inputData.clinicId !== 'number') {
          throw new BadRequestError('Super admin must specify a clinic for the patient');
        }
        clinicId = inputData.clinicId;
      } else {
        if (!user.clinicId) {
          throw new ForbiddenError(ERR_NO_CLINIC);
        }
        clinicId = user.clinicId;
      }

      // Check for duplicate email in clinic
      const existingEmail = await repo.findByEmail(parsed.data.email, clinicId);
      if (existingEmail) {
        throw new ConflictError(`A patient with email ${parsed.data.email} already exists in this clinic`);
      }

      // Build input
      const input: CreatePatientInput = {
        ...parsed.data,
        clinicId,
        source: 'api',
        sourceMetadata: {
          endpoint: '/api/patients',
          timestamp: new Date().toISOString(),
          createdBy: user.email,
          createdByRole: user.role,
          createdById: user.id,
        },
      };

      // Create with audit context
      const audit: AuditContext = {
        actorEmail: user.email,
        actorRole: user.role,
        actorId: user.id,
      };

      return repo.create(input, audit);
    },

    async updatePatient(id: number, data: unknown, user: UserContext): Promise<PatientEntity> {
      // Preprocess: filter out empty strings for optional address fields
      const preprocessed = preprocessUpdateData(data);
      
      // Validate input
      const parsed = updatePatientSchema.safeParse(preprocessed);
      if (!parsed.success) {
        throw convertZodToValidationError(parsed.error);
      }

      // Check if there's anything to update
      if (Object.keys(parsed.data).length === 0) {
        throw new BadRequestError('No fields to update');
      }

      // Determine clinic filter
      const clinicId = user.role === 'super_admin' ? undefined : (user.clinicId ?? undefined);

      if (user.role !== 'super_admin' && !clinicId) {
        throw new ForbiddenError(ERR_NO_CLINIC);
      }

      // Verify patient exists and user has access
      const existing = await repo.findByIdOrNull(id, clinicId);
      if (!existing) {
        throw Errors.patientNotFound(id);
      }

      // Patient role can only update own record
      if (user.role === 'patient' && user.patientId !== id) {
        throw new ForbiddenError('You can only update your own patient record');
      }

      // Check email uniqueness if changing email
      if (parsed.data.email && parsed.data.email !== existing.email) {
        const emailExists = await this.isEmailRegistered(
          parsed.data.email,
          existing.clinicId,
          id
        );
        if (emailExists) {
          throw new ConflictError(`A patient with email ${parsed.data.email} already exists in this clinic`);
        }
      }

      // Update with audit
      const audit: AuditContext = {
        actorEmail: user.email,
        actorRole: user.role,
        actorId: user.id,
      };

      return repo.update(id, parsed.data as UpdatePatientInput, audit, clinicId);
    },

    async deletePatient(id: number, user: UserContext): Promise<void> {
      // Only admins can delete
      if (!['super_admin', 'admin'].includes(user.role)) {
        throw new ForbiddenError('Only administrators can delete patients');
      }

      // Determine clinic filter
      const clinicId = user.role === 'super_admin' ? undefined : (user.clinicId ?? undefined);

      if (user.role !== 'super_admin' && !clinicId) {
        throw new ForbiddenError(ERR_NO_CLINIC);
      }

      // Get patient with counts
      const patient = await repo.findWithCounts(id, clinicId);
      if (!patient) {
        throw Errors.patientNotFound(id);
      }

      // Check for business rules - warn if has related data
      const totalRelated =
        patient._count.orders +
        patient._count.documents +
        patient._count.soapNotes +
        patient._count.appointments;

      if (totalRelated > 0) {
        // This is allowed but noteworthy - could add a confirmation flow
        // For now, we allow deletion with audit trail
      }

      // Delete with audit
      const audit: AuditContext = {
        actorEmail: user.email,
        actorRole: user.role,
        actorId: user.id,
      };

      await repo.delete(id, audit, clinicId);
    },

    async isEmailRegistered(
      email: string,
      clinicId: number,
      excludePatientId?: number
    ): Promise<boolean> {
      const existing = await repo.findByEmail(email.toLowerCase(), clinicId);
      // If no existing patient, email is available
      // If excluding a patient (for updates), check if it's the same patient
      return existing !== null && existing.id !== excludePatientId;
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Zod error to our ValidationError
 */
function convertZodToValidationError(error: z.ZodError): ValidationError {
  const details: ValidationErrorDetail[] = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
  return new ValidationError('Validation failed', details);
}

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Default patient service instance
 */
export const patientService = createPatientService();
