/**
 * Order Cancellation API
 * POST /api/orders/[id]/cancel
 * 
 * Cancels an order that was sent to Lifefile.
 * Only works for orders that haven't entered fulfillment yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { getClinicLifefileClient } from '@/lib/clinic-lifefile';
import lifefile, { CANCELLATION_REASONS, CancellationReason } from '@/lib/lifefile';

// Request validation schema
const cancelOrderSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS as unknown as [string, ...string[]]).optional().default('provider_request'),
  notes: z.string().max(1000).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Statuses that allow cancellation
const CANCELLABLE_STATUSES = [
  'pending',
  'sent',
  'submitted',
  'received',
  'processing',
  'awaiting_webhook',
  'error',
];

// Statuses that cannot be cancelled (already in fulfillment or shipped)
const NON_CANCELLABLE_STATUSES = [
  'shipped',
  'delivered',
  'cancelled',
  'completed',
  'in_transit',
  'out_for_delivery',
];

export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  context: RouteContext
) => {
  const startTime = Date.now();
  
  try {
    const resolvedParams = await context.params;
    const orderId = parseInt(resolvedParams.id, 10);

    if (isNaN(orderId)) {
      return NextResponse.json(
        { error: 'Invalid order ID' },
        { status: 400 }
      );
    }

    // Only providers and admins can cancel orders
    if (!['provider', 'admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Only providers and administrators can cancel orders' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const parseResult = cancelOrderSchema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { reason, notes } = parseResult.data;

    // Determine clinic context
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Fetch order with clinic context
    const order = await runWithClinicContext(clinicId, async () => {
      return prisma.order.findUnique({
        where: { id: orderId },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          clinic: {
            select: {
              id: true,
              name: true,
              lifefileEnabled: true,
            },
          },
          rxs: true,
        },
      });
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if already cancelled
    if (order.cancelledAt) {
      return NextResponse.json(
        { 
          error: 'Order already cancelled',
          cancelledAt: order.cancelledAt,
          cancellationReason: order.cancellationReason,
        },
        { status: 400 }
      );
    }

    // Check if order status allows cancellation
    const currentStatus = (order.status || '').toLowerCase();
    
    if (NON_CANCELLABLE_STATUSES.includes(currentStatus)) {
      return NextResponse.json(
        { 
          error: 'Order cannot be cancelled',
          message: `Orders with status "${order.status}" cannot be cancelled. The order may already be in fulfillment or shipped.`,
          currentStatus: order.status,
        },
        { status: 400 }
      );
    }

    logger.info(`[ORDER CANCEL] User ${user.id} requesting cancellation for order ${orderId}`, {
      orderId,
      lifefileOrderId: order.lifefileOrderId,
      currentStatus: order.status,
      reason,
    });

    // Attempt to cancel in Lifefile if we have a Lifefile order ID
    let lifefileCancelResponse: any = null;
    let lifefileError: string | null = null;

    if (order.lifefileOrderId && order.clinic?.lifefileEnabled) {
      try {
        // Get clinic-specific Lifefile client
        const lifefileClient = order.clinicId 
          ? await getClinicLifefileClient(order.clinicId)
          : lifefile;

        // Try to cancel the order in Lifefile
        logger.info(`[ORDER CANCEL] Calling Lifefile cancel API for order ${order.lifefileOrderId}`);
        
        try {
          lifefileCancelResponse = await lifefileClient.cancelOrder(
            order.lifefileOrderId,
            reason,
            notes
          );
          logger.info(`[ORDER CANCEL] Lifefile cancel response:`, lifefileCancelResponse);
        } catch (cancelErr: any) {
          // Try alternative endpoints if primary fails
          logger.warn(`[ORDER CANCEL] Primary cancel endpoint failed, trying alternatives...`);
          
          try {
            lifefileCancelResponse = await lifefileClient.voidOrder(order.lifefileOrderId, reason);
          } catch (voidErr: any) {
            try {
              lifefileCancelResponse = await lifefileClient.deleteOrder(order.lifefileOrderId);
            } catch (deleteErr: any) {
              // All attempts failed
              lifefileError = cancelErr.message || 'Lifefile cancellation failed';
              logger.error(`[ORDER CANCEL] All Lifefile cancel attempts failed:`, {
                cancelErr: cancelErr.message,
                voidErr: voidErr?.message,
                deleteErr: deleteErr?.message,
              });
            }
          }
        }
      } catch (err: any) {
        lifefileError = err.message || 'Failed to connect to Lifefile';
        logger.error(`[ORDER CANCEL] Lifefile client error:`, err);
      }
    }

    // Update order in database regardless of Lifefile response
    // (We still want to track the cancellation attempt in our system)
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        cancelledAt: new Date(),
        cancelledBy: user.id,
        cancellationReason: reason,
        cancellationNotes: notes,
        lifefileCancelResponse: lifefileCancelResponse 
          ? JSON.stringify(lifefileCancelResponse) 
          : lifefileError ? JSON.stringify({ error: lifefileError }) : null,
        status: 'cancelled',
      },
    });

    // Create order event for audit trail
    await prisma.orderEvent.create({
      data: {
        orderId: orderId,
        lifefileOrderId: order.lifefileOrderId,
        eventType: 'order_cancelled',
        payload: {
          reason,
          notes,
          cancelledBy: user.id,
          cancelledByEmail: user.email,
          lifefileResponse: lifefileCancelResponse,
          lifefileError,
        } as any,
        note: `Order cancelled by ${user.email}: ${reason}${notes ? ` - ${notes}` : ''}`,
      },
    });

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: lifefileError 
        ? 'Order cancelled locally but Lifefile cancellation may have failed. Please verify with pharmacy.'
        : 'Order cancelled successfully',
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        cancelledAt: updatedOrder.cancelledAt,
        cancellationReason: updatedOrder.cancellationReason,
        lifefileOrderId: order.lifefileOrderId,
      },
      patient: {
        id: order.patient.id,
        name: `${order.patient.firstName} ${order.patient.lastName}`,
      },
      lifefileResponse: lifefileCancelResponse,
      lifefileError,
      warning: lifefileError 
        ? 'Lifefile cancellation failed. Please contact the pharmacy directly to confirm cancellation.'
        : undefined,
      processingTime: `${processingTime}ms`,
    });

  } catch (error: any) {
    logger.error('[ORDER CANCEL] Error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel order', message: error.message },
      { status: 500 }
    );
  }
});
