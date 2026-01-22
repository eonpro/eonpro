/**
 * Shared Domain Types
 * ===================
 *
 * Common types used across multiple domains.
 *
 * @module domains/shared/types
 */

/**
 * User context for authorization
 *
 * Represents the authenticated user making a request.
 * Used by services to enforce access control.
 */
export interface UserContext {
  /** User ID from the database */
  id: number;
  /** User email address */
  email: string;
  /** User role for authorization */
  role: 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient';
  /** Clinic ID the user belongs to (null for super_admin) */
  clinicId?: number | null;
  /** Patient ID if the user is a patient */
  patientId?: number | null;
  /** Provider ID if the user is a provider */
  providerId?: number | null;
}

/**
 * Pagination options for list operations
 */
export interface PaginationOptions {
  /** Number of results per page */
  limit?: number;
  /** Page number (1-indexed) */
  page?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string | number;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  /** The data items */
  data: T[];
  /** Total count of all matching items */
  total: number;
  /** Whether there are more pages */
  hasMore: boolean;
  /** Current page (if page-based) */
  page?: number;
  /** Total pages (if page-based) */
  totalPages?: number;
  /** Next cursor (if cursor-based) */
  nextCursor?: string | number;
}

/**
 * Audit entry base interface
 */
export interface AuditEntry {
  /** Actor who performed the action */
  actorEmail: string;
  /** Type of action */
  action: string;
  /** Changes made (diff) */
  diff?: Record<string, { before: unknown; after: unknown }>;
}

/**
 * Source metadata for tracking data origin
 */
export interface SourceMetadata {
  /** API endpoint or source system */
  endpoint?: string;
  /** When the data was created */
  timestamp: string;
  /** User agent if from HTTP request */
  userAgent?: string;
  /** Email of user who created */
  createdBy?: string;
  /** Role of user who created */
  createdByRole?: string;
  /** ID of user who created */
  createdById?: number;
}
