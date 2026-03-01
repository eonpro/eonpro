/**
 * Order Cancellation API
 * POST /api/orders/[id]/cancel
 *
 * Cancels an order that was sent to Lifefile.
 * Delegates to shared cancel-order helper for LifeFile integration,
 * compensation voiding, and audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { CANCELLATION_REASONS } from '@/lib/lifefile';
import { cancelOrder, CancelOrderError } from '@/domains/order/services/cancel-order';

const cancelOrderSchema = z.object({
  reason: z
    .enum(CANCELLATION_REASONS as unknown as [string, ...string[]])
    .optional()
    .default('provider_request'),
  notes: z.string().max(1000).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const resolvedParams = await context.params;
      const orderId = parseInt(resolvedParams.id, 10);

      if (isNaN(orderId)) {
        return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
      }

      if (!['provider', 'admin', 'super_admin'].includes(user.role)) {
        return NextResponse.json(
          { error: 'Only providers and administrators can cancel orders' },
          { status: 403 }
        );
      }

      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        // Empty body handled by schema validation below
      }
      const parseResult = cancelOrderSchema.safeParse(body);

      if (!parseResult.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parseResult.error.issues },
          { status: 400 }
        );
      }

      const { reason, notes } = parseResult.data;

      const result = await cancelOrder({
        orderId,
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        reason,
        notes,
      });

      return NextResponse.json(result);
    } catch (error: any) {
      if (error instanceof CancelOrderError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      logger.error('[ORDER CANCEL] Error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel order', message: error.message },
        { status: 500 }
      );
    }
  }
);
