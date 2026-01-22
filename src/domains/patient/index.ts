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
 * import { patientService, type PatientEntity, type UserContext } from '@/domains/patient';
 *
 * // Get a patient (with authorization)
 * const patient = await patientService.getPatient(123, userContext);
 *
 * // List patients
 * const { data, total } = await patientService.listPatients(userContext, {
 *   limit: 50,
 *   recent: '7d',
 *   search: 'john',
 * });
 *
 * // Create a patient
 * const newPatient = await patientService.createPatient(
 *   { firstName: 'John', lastName: 'Doe', ... },
 *   userContext
 * );
 *
 * // For direct repository access (testing/admin)
 * import { patientRepository } from '@/domains/patient';
 * ```
 */

// Types
export * from './types';

// Repositories
export * from './repositories';

// Services
export * from './services';
