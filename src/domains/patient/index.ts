/**
 * Patient Domain Module
 * =====================
 *
 * Domain module for patient management operations.
 *
 * @module domains/patient
 *
 * @example
 * ```typescript
 * import { patientRepository, type PatientEntity } from '@/domains/patient';
 *
 * // Find a patient
 * const patient = await patientRepository.findById(123, clinicId);
 *
 * // List patients
 * const { data, total } = await patientRepository.findMany(
 *   { clinicId },
 *   { limit: 50, orderBy: 'createdAt', orderDir: 'desc' }
 * );
 *
 * // Create a patient
 * const newPatient = await patientRepository.create(
 *   { firstName: 'John', lastName: 'Doe', ... },
 *   { actorEmail: 'admin@clinic.com', actorRole: 'admin' }
 * );
 * ```
 */

// Types
export * from './types';

// Repositories
export * from './repositories';
