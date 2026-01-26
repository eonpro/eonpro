/**
 * Provider Domain Types
 * =====================
 *
 * Type definitions for the provider domain.
 *
 * @module domains/provider/types
 */

/**
 * Provider entity from database
 */
export interface Provider {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  clinicId: number | null;
  /** ENTERPRISE: Provider's primary/default clinic */
  primaryClinicId: number | null;
  /** ENTERPRISE: Currently active clinic for this session */
  activeClinicId: number | null;
  firstName: string;
  lastName: string;
  titleLine: string | null;
  npi: string;
  licenseState: string | null;
  licenseNumber: string | null;
  dea: string | null;
  email: string | null;
  phone: string | null;
  signatureDataUrl: string | null;
  npiVerifiedAt: Date | null;
  npiRawResponse: unknown;
  lastLogin: Date | null;
  passwordHash: string | null;
  passwordResetExpires: Date | null;
  passwordResetToken: string | null;
}

/**
 * Provider clinic assignment (from ProviderClinic junction table)
 */
export interface ProviderClinicAssignment {
  id: number;
  clinicId: number;
  isPrimary: boolean;
  isActive: boolean;
  titleLine: string | null;
  deaNumber: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  clinic: {
    id: number;
    name: string;
    subdomain?: string;
  };
}

/**
 * Provider with clinic information
 */
export interface ProviderWithClinic extends Provider {
  clinic: {
    id: number;
    name: string;
    subdomain?: string;
  } | null;
  /** ENTERPRISE: All clinic assignments for multi-clinic support */
  providerClinics?: ProviderClinicAssignment[];
}

/**
 * Provider creation input (validated)
 */
export interface CreateProviderInput {
  npi: string;
  firstName: string;
  lastName: string;
  titleLine?: string;
  licenseState?: string | null;
  licenseNumber?: string;
  dea?: string;
  email?: string;
  phone?: string;
  signatureDataUrl?: string;
  clinicId?: number | null;
}

/**
 * Provider update input (partial)
 */
export interface UpdateProviderInput {
  firstName?: string;
  lastName?: string;
  titleLine?: string | null;
  npi?: string;
  licenseState?: string | null;
  licenseNumber?: string | null;
  dea?: string | null;
  email?: string | null;
  phone?: string | null;
  signatureDataUrl?: string | null;
  clinicId?: number | null;
}

/**
 * Provider list filters
 */
export interface ListProvidersFilters {
  /** @deprecated Use clinicIds instead for multi-clinic support */
  clinicId?: number | null;
  /** Array of clinic IDs to filter by (supports multi-clinic users) */
  clinicIds?: number[];
  includeShared?: boolean;
  userId?: number;
  userProviderId?: number;
  userEmail?: string;
}

/**
 * Provider audit entry
 */
export interface ProviderAuditEntry {
  providerId: number;
  actorEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'PASSWORD_SET' | 'PASSWORD_RESET';
  diff?: Record<string, { before: unknown; after: unknown }>;
}

/**
 * NPI verification result
 */
export interface NpiVerificationResult {
  valid: boolean;
  basic?: {
    firstName?: string;
    lastName?: string;
    credential?: string;
    gender?: string;
    status?: string;
  };
  addresses?: Array<{
    addressPurpose: string;
    addressType: string;
    address1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }>;
  taxonomies?: Array<{
    code: string;
    desc?: string;
    primary: boolean;
    state?: string;
    license?: string;
  }>;
}

/**
 * Fields tracked for audit diff
 */
export const PROVIDER_AUDIT_FIELDS = [
  'firstName',
  'lastName',
  'titleLine',
  'npi',
  'licenseState',
  'licenseNumber',
  'dea',
  'email',
  'phone',
  'signatureDataUrl',
  'clinicId',
] as const;
