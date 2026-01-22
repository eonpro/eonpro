/**
 * Domain Modules Index
 * ====================
 *
 * Central export point for all domain modules.
 * Import from this file for cross-domain access.
 *
 * @module domains
 *
 * @example
 * ```typescript
 * import { Errors, handleApiError } from '@/domains';
 * import { patientRepository } from '@/domains/patient';
 * ```
 */

// Shared utilities
export * from './shared';

// Domain modules
export * from './patient';
export * from './provider';
export * from './order';
