/**
 * Individual Shipment Schedule API
 * =================================
 *
 * GET /api/admin/shipment-schedule/[id] - Get shipment details
 * PATCH /api/admin/shipment-schedule/[id] - Update/reschedule shipment
 * DELETE /api/admin/shipment-schedule/[id] - Cancel a shipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  getShipmentSeries,
  rescheduleShipment,
  cancelRemainingShipments,
} from '@/lib/shipment-schedule';
import {
  handleApiError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '@/domains/shared/errors';

// Update schema
const updateSchema = z.object({
  nextRefillDate: z.string().datetime().optional(),
  adminNotes: z.string().max(1000).optional(),
});

// Context type
type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/shipment-schedule/[id]
 * Get shipment details including the full series
 */
async function handleGet(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const { id } = await context.params;
    const refillId = parseInt(id, 10);

    if (isNaN(refillId)) {
      throw new BadRequestError('Invalid shipment ID');
    }

    // Get the shipment
    const shipment = await prisma.refillQueue.findUnique({
      where: { id: refillId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            patientId: true,
          },
        },
        subscription: {
          select: {
            id: true,
            planName: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
            defaultBudDays: true,
          },
        },
        lastOrder: {
          select: {
            id: true,
            status: true,
            trackingNumber: true,
            shippingStatus: true,
          },
        },
        parentRefill: true,
      },
    });

    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    // Verify clinic access
    if (user.role !== 'super_admin' && shipment.clinicId !== user.clinicId) {
      throw new ForbiddenError('Access denied');
    }

    // Get the full series if this is part of a multi-shipment schedule
    let series: any[] = [];
    if (shipment.parentRefillId) {
      series = await getShipmentSeries(shipment.parentRefillId);
    } else if (shipment.totalShipments && shipment.totalShipments > 1) {
      series = await getShipmentSeries(shipment.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        shipment,
        series: series.map((s) => ({
          id: s.id,
          shipmentNumber: s.shipmentNumber,
          totalShipments: s.totalShipments,
          status: s.status,
          nextRefillDate: s.nextRefillDate,
          reminderSentAt: s.reminderSentAt,
          patientNotifiedAt: s.patientNotifiedAt,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/shipment-schedule/[id]' });
  }
}

/**
 * PATCH /api/admin/shipment-schedule/[id]
 * Update/reschedule a shipment
 */
async function handlePatch(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const { id } = await context.params;
    const refillId = parseInt(id, 10);

    if (isNaN(refillId)) {
      throw new BadRequestError('Invalid shipment ID');
    }

    const body = await req.json();
    const validated = updateSchema.parse(body);

    // Get the shipment
    const shipment = await prisma.refillQueue.findUnique({
      where: { id: refillId },
      select: { clinicId: true, status: true },
    });

    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    // Verify clinic access
    if (user.role !== 'super_admin' && shipment.clinicId !== user.clinicId) {
      throw new ForbiddenError('Access denied');
    }

    // Check if shipment can be modified
    const nonModifiableStatuses = ['PRESCRIBED', 'COMPLETED', 'CANCELLED'];
    if (nonModifiableStatuses.includes(shipment.status)) {
      throw new BadRequestError(`Cannot modify shipment with status: ${shipment.status}`);
    }

    // Reschedule if date provided
    if (validated.nextRefillDate) {
      const updated = await rescheduleShipment(
        refillId,
        new Date(validated.nextRefillDate),
        validated.adminNotes
      );

      logger.info('[Shipment Schedule API] Rescheduled shipment', {
        userId: user.id,
        refillId,
        newDate: validated.nextRefillDate,
      });

      return NextResponse.json({
        success: true,
        data: updated,
      });
    }

    // Just update notes if no date change
    if (validated.adminNotes) {
      const updated = await prisma.refillQueue.update({
        where: { id: refillId },
        data: { adminNotes: validated.adminNotes },
      });

      return NextResponse.json({
        success: true,
        data: updated,
      });
    }

    throw new BadRequestError('No updates provided');
  } catch (error) {
    return handleApiError(error, { route: 'PATCH /api/admin/shipment-schedule/[id]' });
  }
}

/**
 * DELETE /api/admin/shipment-schedule/[id]
 * Cancel a shipment or remaining shipments in series
 */
async function handleDelete(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const { id } = await context.params;
    const refillId = parseInt(id, 10);
    const { searchParams } = new URL(req.url);
    const cancelSeries = searchParams.get('cancelSeries') === 'true';

    if (isNaN(refillId)) {
      throw new BadRequestError('Invalid shipment ID');
    }

    // Get the shipment
    const shipment = await prisma.refillQueue.findUnique({
      where: { id: refillId },
      select: { clinicId: true, status: true, parentRefillId: true },
    });

    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    // Verify clinic access
    if (user.role !== 'super_admin' && shipment.clinicId !== user.clinicId) {
      throw new ForbiddenError('Access denied');
    }

    // Check if shipment can be cancelled
    const nonCancellableStatuses = ['PRESCRIBED', 'COMPLETED', 'CANCELLED'];
    if (nonCancellableStatuses.includes(shipment.status)) {
      throw new BadRequestError(`Cannot cancel shipment with status: ${shipment.status}`);
    }

    // Get reason from body if provided
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // No body provided, that's fine
    }

    if (cancelSeries) {
      // Cancel all remaining shipments in the series
      const parentId = shipment.parentRefillId || refillId;
      const cancelledCount = await cancelRemainingShipments(parentId, reason);

      logger.info('[Shipment Schedule API] Cancelled shipment series', {
        userId: user.id,
        parentRefillId: parentId,
        cancelledCount,
      });

      return NextResponse.json({
        success: true,
        data: { cancelledCount },
      });
    } else {
      // Cancel just this shipment
      const updated = await prisma.refillQueue.update({
        where: { id: refillId },
        data: {
          status: 'CANCELLED',
          adminNotes: reason,
        },
      });

      logger.info('[Shipment Schedule API] Cancelled single shipment', {
        userId: user.id,
        refillId,
      });

      return NextResponse.json({
        success: true,
        data: updated,
      });
    }
  } catch (error) {
    return handleApiError(error, { route: 'DELETE /api/admin/shipment-schedule/[id]' });
  }
}

export const GET = withAuth(
  (req: NextRequest, user: AuthUser, context?: any) =>
    handleGet(req, user, context as RouteContext),
  { roles: ['admin', 'super_admin'] }
);

export const PATCH = withAuth(
  (req: NextRequest, user: AuthUser, context?: any) =>
    handlePatch(req, user, context as RouteContext),
  { roles: ['admin', 'super_admin'] }
);

export const DELETE = withAuth(
  (req: NextRequest, user: AuthUser, context?: any) =>
    handleDelete(req, user, context as RouteContext),
  { roles: ['admin', 'super_admin'] }
);
