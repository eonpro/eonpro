/**
 * Admin Refill Approval API
 *
 * POST /api/admin/refill-queue/[id]/approve - Approve refill for provider queue
 *
 * @security Admin or Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/domains/shared/errors';
import { getRefillById, approveRefill } from '@/services/refill';
import { prisma } from '@/lib/db';

const IDEMPOTENCY_RESOURCE = 'refill_approve';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST - Approve refill for provider queue (B6: idempotency key supported)
export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const idempotencyKey = req.headers.get('idempotency-key')?.trim();
      if (idempotencyKey) {
        const existing = await prisma.idempotencyRecord.findUnique({
          where: { key: idempotencyKey },
        });
        if (existing && existing.resource === IDEMPOTENCY_RESOURCE) {
          return NextResponse.json(existing.responseBody as object, {
            status: existing.responseStatus,
          });
        }
      }

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

      // Check if already approved
      if (refill.adminApproved === true) {
        throw new BadRequestError('Refill already approved');
      }

      // Check status
      if (refill.status !== 'PENDING_ADMIN') {
        throw new BadRequestError(`Cannot approve refill in status: ${refill.status}. Must be PENDING_ADMIN.`);
      }

      // Check payment verification
      if (!refill.paymentVerified) {
        throw new BadRequestError('Payment must be verified before approval');
      }

      // Parse optional body - notes are optional
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        // Empty body is OK for approval
      }
      const notes = typeof body.notes === 'string' ? body.notes : undefined;

      const updatedRefill = await approveRefill(refillId, user.id, notes);

      logger.info('[Admin RefillQueue] Refill approved', {
        refillId,
        userId: user.id,
        patientId: refill.patientId,
      });

      const responseBody = { success: true, refill: updatedRefill };
      const status = 200;

      if (idempotencyKey) {
        await prisma.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            resource: IDEMPOTENCY_RESOURCE,
            responseStatus: status,
            responseBody: responseBody as object,
          },
        });
      }

      return NextResponse.json(responseBody, { status });
    } catch (error) {
      return handleApiError(error, { route: 'POST /api/admin/refill-queue/[id]/approve' });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
