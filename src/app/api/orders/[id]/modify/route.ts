/**
 * Order Modification API
 * POST /api/orders/[id]/modify
 *
 * Modifies an order that was sent to Lifefile.
 * Limited to shipping info and notes for orders not yet shipped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { getClinicLifefileClient } from '@/lib/clinic-lifefile';
import lifefile from '@/lib/lifefile';

// Request validation schema for modifications
const modifyOrderSchema = z.object({
  shipping: z
    .object({
      recipientFirstName: z.string().optional(),
      recipientLastName: z.string().optional(),
      recipientPhone: z.string().optional(),
      recipientEmail: z.string().email().optional(),
      addressLine1: z.string().optional(),
      addressLine2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      service: z.number().optional(),
    })
    .optional(),
  notes: z.string().max(1000).optional(),
  modificationReason: z.string().max(500).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Statuses that allow modification
const MODIFIABLE_STATUSES = [
  'pending',
  'sent',
  'submitted',
  'received',
  'processing',
  'awaiting_webhook',
];

export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    const startTime = Date.now();

    try {
      const resolvedParams = await context.params;
      const orderId = parseInt(resolvedParams.id, 10);

      if (isNaN(orderId)) {
        return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
      }

      // Only providers and admins can modify orders
      if (!['provider', 'admin', 'super_admin'].includes(user.role)) {
        return NextResponse.json(
          { error: 'Only providers and administrators can modify orders' },
          { status: 403 }
        );
      }

      // Parse request body
      const body = await req.json();
      const parseResult = modifyOrderSchema.safeParse(body);

      if (!parseResult.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parseResult.error.issues },
          { status: 400 }
        );
      }

      const modifications = parseResult.data;

      // Check if there's anything to modify
      if (!modifications.shipping && !modifications.notes) {
        return NextResponse.json({ error: 'No modifications provided' }, { status: 400 });
      }

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
              },
            },
            clinic: {
              select: {
                id: true,
                name: true,
                lifefileEnabled: true,
              },
            },
          },
        });
      });

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      // Check if order is cancelled
      if (order.cancelledAt) {
        return NextResponse.json({ error: 'Cannot modify a cancelled order' }, { status: 400 });
      }

      // Check if order status allows modification
      const currentStatus = (order.status || '').toLowerCase();

      if (!MODIFIABLE_STATUSES.includes(currentStatus)) {
        return NextResponse.json(
          {
            error: 'Order cannot be modified',
            message: `Orders with status "${order.status}" cannot be modified. The order may already be in fulfillment or shipped.`,
            currentStatus: order.status,
          },
          { status: 400 }
        );
      }

      logger.info(`[ORDER MODIFY] User ${user.id} requesting modification for order ${orderId}`, {
        orderId,
        lifefileOrderId: order.lifefileOrderId,
        currentStatus: order.status,
        modifications: Object.keys(modifications),
      });

      // Attempt to modify in Lifefile if we have a Lifefile order ID
      let lifefileModifyResponse: any = null;
      let lifefileError: string | null = null;

      if (order.lifefileOrderId && order.clinic?.lifefileEnabled) {
        try {
          // Get clinic-specific Lifefile client
          const lifefileClient = order.clinicId
            ? await getClinicLifefileClient(order.clinicId)
            : lifefile;

          logger.info(
            `[ORDER MODIFY] Calling Lifefile modify API for order ${order.lifefileOrderId}`
          );

          if (modifications.shipping) {
            try {
              lifefileModifyResponse = await lifefileClient.updateOrderShipping(
                order.lifefileOrderId,
                modifications.shipping
              );
              logger.info(
                `[ORDER MODIFY] Lifefile shipping update response:`,
                lifefileModifyResponse
              );
            } catch (shippingErr: any) {
              logger.warn(`[ORDER MODIFY] Lifefile shipping update failed:`, shippingErr.message);
              lifefileError = shippingErr.message;
            }
          }

          if (modifications.notes) {
            try {
              const notesResponse = await lifefileClient.addOrderNotes(
                order.lifefileOrderId,
                modifications.notes
              );
              lifefileModifyResponse = { ...lifefileModifyResponse, notes: notesResponse };
              logger.info(`[ORDER MODIFY] Lifefile notes added:`, notesResponse);
            } catch (notesErr: any) {
              logger.warn(`[ORDER MODIFY] Lifefile notes addition failed:`, notesErr.message);
              if (!lifefileError) lifefileError = notesErr.message;
            }
          }
        } catch (err: any) {
          lifefileError = err.message || 'Failed to connect to Lifefile';
          logger.error(`[ORDER MODIFY] Lifefile client error:`, err);
        }
      }

      // Build modification history entry
      const modificationEntry = {
        timestamp: new Date().toISOString(),
        modifiedBy: user.id,
        modifiedByEmail: user.email,
        changes: modifications,
        reason: modifications.modificationReason,
        lifefileResponse: lifefileModifyResponse,
        lifefileError,
      };

      // Update existing modification history or create new
      const existingHistory = (order.modificationHistory as any[]) || [];
      const newHistory = [...existingHistory, modificationEntry];

      // Update order in database
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          lastModifiedAt: new Date(),
          lastModifiedBy: user.id,
          modificationHistory: newHistory as any,
        },
      });

      // Create order event for audit trail
      await prisma.orderEvent.create({
        data: {
          orderId: orderId,
          lifefileOrderId: order.lifefileOrderId,
          eventType: 'order_modified',
          payload: modificationEntry as any,
          note: `Order modified by ${user.email}: ${Object.keys(modifications).join(', ')}`,
        },
      });

      const processingTime = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        message: lifefileError
          ? 'Order modified locally but Lifefile update may have failed. Please verify with pharmacy.'
          : 'Order modified successfully',
        order: {
          id: updatedOrder.id,
          status: updatedOrder.status,
          lastModifiedAt: updatedOrder.lastModifiedAt,
          lifefileOrderId: order.lifefileOrderId,
        },
        modifications: modifications,
        lifefileResponse: lifefileModifyResponse,
        lifefileError,
        warning: lifefileError
          ? 'Lifefile modification failed. Please contact the pharmacy directly to confirm changes.'
          : undefined,
        processingTime: `${processingTime}ms`,
      });
    } catch (error: any) {
      logger.error('[ORDER MODIFY] Error:', error);
      return NextResponse.json(
        { error: 'Failed to modify order', message: error.message },
        { status: 500 }
      );
    }
  }
);
