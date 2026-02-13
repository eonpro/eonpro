/**
 * Patient Merge Preview Route
 * ===========================
 *
 * API endpoint for previewing a patient merge without executing it.
 *
 * POST /api/patients/merge/preview - Get merge preview
 *
 * @module api/patients/merge/preview
 */

import { z } from 'zod';

import { withAuth } from '@/lib/auth/middleware';
import { patientMergeService, type UserContext } from '@/domains/patient';
import { handleApiError, BadRequestError, ValidationError } from '@/domains/shared/errors';

/**
 * Request schema for merge preview
 */
const previewRequestSchema = z.object({
  sourcePatientId: z.number().int().positive('Source patient ID must be a positive integer'),
  targetPatientId: z.number().int().positive('Target patient ID must be a positive integer'),
});

/**
 * POST /api/patients/merge/preview
 * Preview a patient merge without executing it
 *
 * Request body:
 * - sourcePatientId: ID of patient to merge FROM (will be deleted)
 * - targetPatientId: ID of patient to merge INTO (will be kept)
 *
 * Returns:
 * - source: Source patient with relation counts
 * - target: Target patient with relation counts
 * - mergedProfile: Preview of merged profile fields
 * - totalRecordsToMove: Number of records that will be moved
 * - conflicts: Any warnings or errors about the merge
 * - canMerge: Whether the merge can proceed
 */
const previewHandler = withAuth(
  async (request, user) => {
    try {
      const body = await request.json();

      // Validate request body
      const parsed = previewRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid preview request',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          }))
        );
      }

      const { sourcePatientId, targetPatientId } = parsed.data;

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
      };

      // Get the merge preview
      const preview = await patientMergeService.previewMerge(
        sourcePatientId,
        targetPatientId,
        userContext
      );

      return Response.json({
        success: true,
        preview,
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/patients/merge/preview' },
      });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const POST = previewHandler;
