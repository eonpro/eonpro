/**
 * Order Cancellation Helper
 * =========================
 *
 * Shared logic for cancelling an order with LifeFile integration,
 * compensation voiding, and platform fee voiding.
 * Used by both /api/orders/[id]/cancel and /api/orders/[id]/disposition.
 *
 * @module domains/order/services/cancel-order
 */

import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getClinicLifefileClient } from '@/lib/clinic-lifefile';
import lifefile from '@/lib/lifefile';
import { providerCompensationService } from '@/services/provider';
import { platformFeeService } from '@/services/billing';

const NON_CANCELLABLE_STATUSES = [
  'shipped',
  'delivered',
  'cancelled',
  'completed',
  'in_transit',
  'out_for_delivery',
];

export interface CancelOrderInput {
  orderId: number;
  userId: number;
  userEmail: string;
  userRole: string;
  clinicId?: number | null;
  reason?: string;
  notes?: string;
}

export interface CancelOrderResult {
  success: boolean;
  message: string;
  order: {
    id: number;
    status: string | null;
    cancelledAt: Date | null;
    cancellationReason: string | null;
    lifefileOrderId: string | null;
  };
  lifefileError?: string;
  warning?: string;
}

export async function cancelOrder(input: CancelOrderInput): Promise<CancelOrderResult> {
  const { orderId, userId, userEmail, userRole, reason = 'provider_request', notes } = input;
  const clinicId = userRole === 'super_admin' ? undefined : input.clinicId;

  const order = await runWithClinicContext(clinicId, async () => {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
        clinic: { select: { id: true, name: true, lifefileEnabled: true } },
        rxs: true,
      },
    });
  });

  if (!order) {
    throw new CancelOrderError('Order not found', 404);
  }

  if (order.cancelledAt) {
    throw new CancelOrderError('Order already cancelled', 400);
  }

  const currentStatus = (order.status || '').toLowerCase();
  if (NON_CANCELLABLE_STATUSES.includes(currentStatus)) {
    throw new CancelOrderError(
      `Orders with status "${order.status}" cannot be cancelled.`,
      400
    );
  }

  logger.info('[CANCEL ORDER] Cancellation requested', {
    orderId,
    lifefileOrderId: order.lifefileOrderId,
    currentStatus: order.status,
    reason,
    requestedBy: userId,
  });

  let lifefileCancelResponse: any = null;
  let lifefileError: string | null = null;

  if (order.lifefileOrderId && order.clinic?.lifefileEnabled) {
    try {
      const lifefileClient = order.clinicId
        ? await getClinicLifefileClient(order.clinicId)
        : lifefile;

      try {
        lifefileCancelResponse = await lifefileClient.cancelOrder(
          order.lifefileOrderId,
          reason,
          notes
        );
      } catch (cancelErr: any) {
        logger.warn('[CANCEL ORDER] Primary cancel failed, trying alternatives...');
        try {
          lifefileCancelResponse = await lifefileClient.voidOrder(order.lifefileOrderId, reason);
        } catch (voidErr: any) {
          try {
            lifefileCancelResponse = await lifefileClient.deleteOrder(order.lifefileOrderId);
          } catch (deleteErr: any) {
            lifefileError = cancelErr.message || 'Lifefile cancellation failed';
            logger.error('[CANCEL ORDER] All Lifefile cancel attempts failed', {
              orderId,
              cancelErr: cancelErr.message,
              voidErr: voidErr?.message,
              deleteErr: deleteErr?.message,
            });
          }
        }
      }
    } catch (err: any) {
      lifefileError = err.message || 'Failed to connect to Lifefile';
      logger.error('[CANCEL ORDER] Lifefile client error', { orderId, error: err.message });
    }
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancellationReason: reason,
      cancellationNotes: notes,
      lifefileCancelResponse: lifefileCancelResponse
        ? JSON.stringify(lifefileCancelResponse)
        : lifefileError
          ? JSON.stringify({ error: lifefileError })
          : null,
      status: 'cancelled',
    },
  });

  await prisma.orderEvent.create({
    data: {
      orderId,
      lifefileOrderId: order.lifefileOrderId,
      eventType: 'order_cancelled',
      payload: {
        reason,
        notes,
        cancelledBy: userId,
        cancelledByEmail: userEmail,
        lifefileResponse: lifefileCancelResponse,
        lifefileError,
      } as any,
      note: `Order cancelled by ${userEmail}: ${reason}${notes ? ` - ${notes}` : ''}`,
    },
  });

  try {
    await providerCompensationService.voidCompensation(
      orderId,
      `Order cancelled: ${reason}${notes ? ` - ${notes}` : ''}`,
      userId
    );
  } catch (compError) {
    logger.error('[CANCEL ORDER] Failed to void compensation', {
      orderId,
      error: compError instanceof Error ? compError.message : 'Unknown error',
    });
  }

  try {
    const voidedFee = await platformFeeService.voidFeeByOrder(
      orderId,
      `Order cancelled: ${reason}${notes ? ` - ${notes}` : ''}`,
      userId
    );
    if (voidedFee) {
      logger.info('[CANCEL ORDER] Platform fee voided', { orderId, feeEventId: voidedFee.id });
    }
  } catch (feeError) {
    logger.error('[CANCEL ORDER] Failed to void platform fee', {
      orderId,
      error: feeError instanceof Error ? feeError.message : 'Unknown error',
    });
  }

  return {
    success: true,
    message: lifefileError
      ? 'Order cancelled locally but Lifefile cancellation may have failed.'
      : 'Order cancelled successfully',
    order: {
      id: updatedOrder.id,
      status: updatedOrder.status,
      cancelledAt: updatedOrder.cancelledAt,
      cancellationReason: updatedOrder.cancellationReason,
      lifefileOrderId: order.lifefileOrderId,
    },
    lifefileError: lifefileError || undefined,
    warning: lifefileError
      ? 'Lifefile cancellation failed. Please contact the pharmacy directly.'
      : undefined,
  };
}

export class CancelOrderError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'CancelOrderError';
  }
}
