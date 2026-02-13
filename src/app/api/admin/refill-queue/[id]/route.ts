/**
 * Admin Refill Queue Item API
 *
 * GET /api/admin/refill-queue/[id] - Get refill details
 * PATCH /api/admin/refill-queue/[id] - Update refill (hold, resume, cancel)
 *
 * @security Admin or Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/domains/shared/errors';
import { getRefillById, cancelRefill, holdRefill, resumeRefill } from '@/services/refill';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get refill details
export const GET = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const refillId = parseInt(id);

      if (isNaN(refillId)) {
        return NextResponse.json({ error: 'Invalid refill ID' }, { status: 400 });
      }

      const refill = await getRefillById(refillId);

      if (!refill) {
        return NextResponse.json({ error: 'Refill not found' }, { status: 404 });
      }

      // Check clinic access
      if (user.role !== 'super_admin' && refill.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      return NextResponse.json({
        refill: {
          id: refill.id,
          createdAt: refill.createdAt,
          updatedAt: refill.updatedAt,
          clinicId: refill.clinicId,
          patientId: refill.patientId,
          subscriptionId: refill.subscriptionId,
          status: refill.status,
          vialCount: refill.vialCount,
          refillIntervalDays: refill.refillIntervalDays,
          nextRefillDate: refill.nextRefillDate,
          lastRefillDate: refill.lastRefillDate,
          // Payment info
          paymentVerified: refill.paymentVerified,
          paymentVerifiedAt: refill.paymentVerifiedAt,
          paymentVerifiedBy: refill.paymentVerifiedBy,
          paymentMethod: refill.paymentMethod,
          paymentReference: refill.paymentReference,
          stripePaymentId: refill.stripePaymentId,
          invoiceId: refill.invoiceId,
          // Admin info
          adminApproved: refill.adminApproved,
          adminApprovedAt: refill.adminApprovedAt,
          adminApprovedBy: refill.adminApprovedBy,
          adminNotes: refill.adminNotes,
          // Provider info
          providerQueuedAt: refill.providerQueuedAt,
          prescribedAt: refill.prescribedAt,
          prescribedBy: refill.prescribedBy,
          orderId: refill.orderId,
          // Request info
          requestedEarly: refill.requestedEarly,
          patientNotes: refill.patientNotes,
          // Medication info
          medicationName: refill.medicationName,
          medicationStrength: refill.medicationStrength,
          medicationForm: refill.medicationForm,
          planName: refill.planName,
          // Relations
          patient: refill.patient,
          subscription: refill.subscription,
          clinic: refill.clinic
            ? {
                id: refill.clinic.id,
                name: refill.clinic.name,
                subdomain: refill.clinic.subdomain,
              }
            : null,
          lastOrder: refill.lastOrder,
          order: refill.order,
          invoice: refill.invoice,
        },
      });
    } catch (error) {
      return handleApiError(error, { route: 'GET /api/admin/refill-queue/[id]' });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// PATCH - Update refill status (hold, resume, cancel)
export const PATCH = withAuthParams(
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

      const body = await req.json();
      const { action, reason } = body;

      let updatedRefill;

      switch (action) {
        case 'hold':
          updatedRefill = await holdRefill(refillId, reason);
          break;
        case 'resume':
          updatedRefill = await resumeRefill(refillId);
          break;
        case 'cancel':
          if (!reason) {
            throw new BadRequestError('Reason required for cancellation');
          }
          updatedRefill = await cancelRefill(refillId, reason);
          break;
        default:
          throw new BadRequestError('Invalid action. Use "hold", "resume", or "cancel".');
      }

      logger.info('[Admin RefillQueue] Updated refill status', {
        refillId,
        action,
        userId: user.id,
      });

      return NextResponse.json({ refill: updatedRefill });
    } catch (error) {
      return handleApiError(error, { route: 'PATCH /api/admin/refill-queue/[id]' });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
