/**
 * Patient Merge Route
 * ===================
 *
 * API endpoints for merging duplicate patient profiles.
 *
 * POST /api/patients/merge - Execute patient merge
 *
 * @module api/patients/merge
 */

import { z } from 'zod';

import { withAuth } from '@/lib/auth/middleware';
import { patientMergeService, type UserContext } from '@/domains/patient';
import {
  handleApiError,
  BadRequestError,
  ValidationError,
  InternalError,
  isAppError,
} from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

/**
 * Request schema for merge execution
 */
const mergeRequestSchema = z.object({
  sourcePatientId: z.number().int().positive('Source patient ID must be a positive integer'),
  targetPatientId: z.number().int().positive('Target patient ID must be a positive integer'),
  fieldOverrides: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      dob: z.string().optional(),
      gender: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address1: z.string().optional(),
      address2: z.string().nullable().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      notes: z.string().nullable().optional(),
    })
    .optional(),
});

/**
 * POST /api/patients/merge
 * Execute a patient merge
 *
 * Request body:
 * - sourcePatientId: ID of patient to merge FROM (will be deleted)
 * - targetPatientId: ID of patient to merge INTO (will be kept)
 * - fieldOverrides: Optional manual field overrides
 *
 * Returns:
 * - mergedPatient: The resulting merged patient
 * - deletedPatientId: ID of the deleted patient
 * - recordsMoved: Number of records moved
 */
const mergeHandler = withAuth(
  async (request, user) => {
    try {
      const body = await request.json();

      // Validate request body
      const parsed = mergeRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid merge request',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          }))
        );
      }

      const { sourcePatientId, targetPatientId, fieldOverrides } = parsed.data;

      // Validate source and target are different
      if (sourcePatientId === targetPatientId) {
        throw new BadRequestError('Cannot merge a patient with themselves');
      }

      // Convert auth user to service UserContext
      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
        providerId: user.providerId,
      };

      // Execute the merge
      const result = await patientMergeService.executeMerge({
        sourcePatientId,
        targetPatientId,
        fieldOverrides,
        performedBy: userContext,
      });

      return Response.json({
        success: true,
        message: 'Patients merged successfully',
        mergedPatient: result.mergedPatient,
        deletedPatientId: result.deletedPatientId,
        recordsMoved: result.recordsMoved,
        auditId: result.auditId,
      });
    } catch (error) {
      // Log raw error for 500 debugging (merge touches many relations; failures often from missing model or encryption)
      if (!isAppError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('Patient merge failed', {
          route: 'POST /api/patients/merge',
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: msg,
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Surface encryption/setup hints to client (safe message)
        if (
          typeof msg === 'string' &&
          (msg.includes('ENCRYPTION_KEY') || msg.includes('encrypt') || msg.includes('key'))
        ) {
          return handleApiError(
            new InternalError(
              'Merge failed: encryption is not configured. Ensure ENCRYPTION_KEY is set in server environment.'
            ),
            { context: { route: 'POST /api/patients/merge' } }
          );
        }
      }
      return handleApiError(error, {
        context: { route: 'POST /api/patients/merge' },
      });
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);

export const POST = mergeHandler;
