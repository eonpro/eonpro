/**
 * Clinic Domain
 * =============
 *
 * Domain module for clinic-related operations.
 * Provides type-safe access to clinic data with explicit field selections.
 *
 * Usage:
 * ```typescript
 * import { clinicRepository } from '@/domains/clinic';
 *
 * // Find clinic by ID
 * const clinic = await clinicRepository.findById(1);
 *
 * // Check if clinic exists
 * const exists = await clinicRepository.exists(1);
 *
 * // Find EONMEDS clinic
 * const eonmeds = await clinicRepository.findEonmeds();
 * ```
 *
 * @module domains/clinic
 */

export * from './repositories';
