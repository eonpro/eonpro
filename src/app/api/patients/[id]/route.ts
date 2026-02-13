/**
 * Patient [id] Route
 * ==================
 *
 * API endpoints for single patient operations.
 * All handlers use the patient service layer for business logic.
 *
 * @module api/patients/[id]
 */

import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { patientService, type UserContext } from '@/domains/patient';
import { handleApiError, BadRequestError, NotFoundError } from '@/domains/shared/errors';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { tenantNotFoundResponse } from '@/lib/tenant-response';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/patients/[id]
 * Fetch a single patient by ID
 *
 * Uses the patient service layer which handles:
 * - Authorization (patient can only access own record)
 * - PHI decryption (with graceful error handling)
 * - Clinic isolation (non-super-admin filtered by clinicId)
 */
const getPatientHandler = withAuthParams(
  async (request, user, { params }: Params) => {
    try {
      requirePermission(toPermissionContext(user), 'patient:view');
      const resolvedParams = await params;
      const id = Number(resolvedParams.id);

      if (Number.isNaN(id)) {
        throw new BadRequestError('Invalid patient id');
      }

      // Convert auth user to service UserContext
      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
      };

      // Use patient service - handles authorization, PHI decryption, clinic isolation
      const patient = await patientService.getPatient(id, userContext);

      await auditPhiAccess(request, buildAuditPhiOptions(request, user, 'patient:view', { patientId: id, route: 'GET /api/patients/[id]' }));

      return Response.json({ patient });
    } catch (error) {
      if (error instanceof NotFoundError) return tenantNotFoundResponse();
      const err = error as Error & { statusCode?: number };
      if (err && typeof err === 'object' && err.statusCode == null) {
        const resolved = await params;
        logger.error('GET /api/patients/[id] unexpected error', {
          message: err?.message,
          name: err?.name,
          patientId: resolved?.id,
        });
      }
      return handleApiError(error, {
        context: { route: 'GET /api/patients/[id]' },
      });
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'patient', 'staff'] }
);

// Export directly - rate limiting breaks context passing for dynamic routes
export const GET = getPatientHandler;

/**
 * PATCH /api/patients/[id]
 * Update a patient by ID
 *
 * Uses the patient service layer which handles:
 * - Input validation (with normalization)
 * - Authorization (patient can only update own record)
 * - PHI encryption/decryption
 * - Clinic isolation
 * - Audit logging (tracks changes)
 */
const updatePatientHandler = withAuthParams(
  async (request, user, { params }: Params) => {
    try {
      requirePermission(toPermissionContext(user), 'patient:edit');
      const resolvedParams = await params;
      const id = Number(resolvedParams.id);

      if (Number.isNaN(id)) {
        throw new BadRequestError('Invalid patient id');
      }

      const body = await request.json();

      // Convert auth user to service UserContext
      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
      };

      // Use patient service - handles validation, authorization, PHI, audit
      const patient = await patientService.updatePatient(id, body, userContext);

      await auditPhiAccess(request, buildAuditPhiOptions(request, user, 'patient:edit', { patientId: id, route: 'PATCH /api/patients/[id]' }));

      return Response.json({ patient });
    } catch (error) {
      if (error instanceof NotFoundError) return tenantNotFoundResponse();
      return handleApiError(error, {
        context: { route: 'PATCH /api/patients/[id]' },
      });
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'patient', 'staff'] }
);

// Export directly - rate limiting breaks context passing for dynamic routes
export const PATCH = updatePatientHandler;

/**
 * DELETE /api/patients/[id]
 * Delete a patient and all related records
 *
 * Uses the patient service layer which handles:
 * - Authorization (admin only)
 * - Clinic isolation
 * - Cascade deletion (all related records)
 * - Audit logging (records deletion with related data counts)
 */
const deletePatientHandler = withAuthParams(
  async (_request, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const id = Number(resolvedParams.id);

      if (Number.isNaN(id)) {
        throw new BadRequestError('Invalid patient id');
      }

      // Convert auth user to service UserContext
      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
      };

      // Use patient service - handles authorization, cascade delete, audit
      await patientService.deletePatient(id, userContext);

      return Response.json({ success: true, message: 'Patient deleted successfully' });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'DELETE /api/patients/[id]' },
      });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const DELETE = deletePatientHandler;
