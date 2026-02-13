/**
 * Admin Refill Rejection API
 *
 * POST /api/admin/refill-queue/[id]/reject - Reject refill request
 *
 * @security Admin or Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/domains/shared/errors';
import { getRefillById, rejectRefill } from '@/services/refill';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST - Reject refill request
export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const refillId = parseInt(id);

      if (isNaN(refillId)) {
        throw new BadRequestError('Invalid refill ID');
      }

      const refill = await getRefillById(refillId);

      if (!refill) {
        throw new NotFoundError('Refill not found');
      }

      // Check clinic access
      if (user.role !== 'super_admin' && refill.clinicId !== user.clinicId) {
        throw new ForbiddenError('Access denied');
      }

      // Check if already processed
      if (refill.adminApproved !== null) {
        throw new BadRequestError(`Refill already ${refill.adminApproved ? 'approved' : 'rejected'}`);
      }

      // Check status
      if (refill.status !== 'PENDING_ADMIN') {
        throw new BadRequestError(`Cannot reject refill in status: ${refill.status}. Must be PENDING_ADMIN.`);
      }

      const body = await req.json();
      const { reason } = body;

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        throw new BadRequestError('Rejection reason is required');
      }

      const updatedRefill = await rejectRefill(refillId, user.id, reason.trim());

      logger.info('[Admin RefillQueue] Refill rejected', {
        refillId,
        userId: user.id,
        patientId: refill.patientId,
        reason,
      });

      return NextResponse.json({
        success: true,
        refill: updatedRefill,
      });
    } catch (error) {
      return handleApiError(error, { route: 'POST /api/admin/refill-queue/[id]/reject' });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
