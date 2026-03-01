/**
 * Order Disposition API
 * POST /api/orders/[id]/disposition
 *
 * Allows admins to disposition awaiting-fulfillment orders:
 *  - add_tracking: Attach a tracking number (moves order to "tracked")
 *  - cancel: Cancel order (delegates to shared cancel helper)
 *  - completed: Mark order as completed (e.g., picked up in person)
 *
 * All actions require admin password re-entry (verified server-side)
 * and create an OrderEvent audit trail entry.
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';

const dispositionSchema = z
  .object({
    action: z.enum(['add_tracking', 'cancel', 'completed']),
    password: z.string().min(1, 'Password is required'),
    trackingNumber: z.string().min(1).optional(),
    carrier: z.string().min(1).optional(),
    trackingUrl: z.string().url().optional().or(z.literal('')),
    reason: z.string().max(1000).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.action === 'add_tracking') {
        return !!data.trackingNumber && !!data.carrier;
      }
      return true;
    },
    { message: 'trackingNumber and carrier are required for add_tracking', path: ['trackingNumber'] }
  );

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function handler(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const orderId = parseInt(resolvedParams.id, 10);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Only administrators can disposition orders' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parseResult = dispositionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { action, password, trackingNumber, carrier, trackingUrl, reason, notes } =
      parseResult.data;

    // --- Server-side password verification ---
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!userData?.passwordHash) {
      return NextResponse.json({ error: 'Unable to verify password' }, { status: 400 });
    }

    const isValid = await bcrypt.compare(password, userData.passwordHash);
    if (!isValid) {
      logger.warn('[DISPOSITION] Invalid password attempt', { userId: user.id, orderId });
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // --- Fetch order with clinic isolation ---
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const order = await runWithClinicContext(clinicId, async () => {
      return prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          patientId: true,
          clinicId: true,
          lifefileOrderId: true,
          cancelledAt: true,
        },
      });
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    logger.info('[DISPOSITION] Action requested', {
      orderId,
      action,
      approvedBy: user.id,
    });

    // --- Execute action ---
    if (action === 'add_tracking') {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            trackingNumber: trackingNumber!,
            trackingUrl: trackingUrl || null,
            shippingStatus: 'shipped',
            status: 'COMPLETED',
          },
        });

        await tx.patientShippingUpdate.create({
          data: {
            clinicId: order.clinicId,
            patientId: order.patientId,
            orderId: order.id,
            trackingNumber: trackingNumber!,
            carrier: carrier!,
            trackingUrl: trackingUrl || null,
            status: 'SHIPPED',
            source: 'manual',
            rawPayload: {
              addedBy: user.id,
              addedByEmail: user.email,
              disposition: true,
            } as any,
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId,
            lifefileOrderId: order.lifefileOrderId,
            eventType: 'disposition',
            payload: {
              action: 'add_tracking',
              approvedBy: user.id,
              approvedByEmail: user.email,
              trackingNumber,
              carrier,
              trackingUrl,
            } as any,
            note: `Tracking added by ${user.email}: ${carrier} ${trackingNumber}`,
          },
        });
      });

      return NextResponse.json({
        success: true,
        message: 'Tracking number added successfully',
        action: 'add_tracking',
        orderId,
      });
    }

    if (action === 'cancel') {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledBy: user.id,
            cancellationReason: reason || 'admin_disposition',
            cancellationNotes: notes,
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId,
            lifefileOrderId: order.lifefileOrderId,
            eventType: 'disposition',
            payload: {
              action: 'cancel',
              approvedBy: user.id,
              approvedByEmail: user.email,
              reason,
              notes,
              recordOnly: true,
            } as any,
            note: `Order marked cancelled by ${user.email}${reason ? `: ${reason}` : ''}`,
          },
        });
      });

      return NextResponse.json({
        success: true,
        message: 'Order marked as cancelled',
        action: 'cancel',
        orderId,
      });
    }

    if (action === 'completed') {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'COMPLETED' },
        });

        await tx.orderEvent.create({
          data: {
            orderId,
            lifefileOrderId: order.lifefileOrderId,
            eventType: 'disposition',
            payload: {
              action: 'completed',
              approvedBy: user.id,
              approvedByEmail: user.email,
              reason,
              notes,
            } as any,
            note: `Order marked completed by ${user.email}${reason ? `: ${reason}` : ''}`,
          },
        });
      });

      return NextResponse.json({
        success: true,
        message: 'Order marked as completed',
        action: 'completed',
        orderId,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    logger.error('[DISPOSITION] Error:', { error: error.message, stack: error.stack });
    return NextResponse.json(
      { error: 'Failed to disposition order' },
      { status: 500 }
    );
  }
}

export const POST = withAuthParams(handler);
