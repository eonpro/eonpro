/**
 * Orders List Route (Legacy)
 * ==========================
 *
 * Legacy endpoint for listing orders with events.
 * Now uses order service for proper clinic isolation.
 *
 * @module api/orders/list
 * @deprecated Use GET /api/orders instead
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { orderService, orderRepository, type UserContext } from '@/domains/order';
import { handleApiError } from '@/domains/shared/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/list
 * List recent orders with events
 *
 * Note: This endpoint now requires authentication for security.
 * Super admin sees all orders, others see clinic orders only.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication (security fix - was previously unauthenticated!)
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = authResult.user!;

    // Convert auth user to service UserContext
    const userContext: UserContext = {
      id: user.id,
      email: user.email,
      role: user.role as UserContext['role'],
      clinicId: user.clinicId,
      patientId: user.patientId,
      providerId: user.providerId,
    };

    // Parse query params
    const { searchParams } = new URL(request.url);
    const hasTrackingNumber = searchParams.get('hasTrackingNumber');

    // Use order service for proper access control
    const result = await orderService.listOrders(userContext, {
      limit: 100,
      hasTrackingNumber: hasTrackingNumber === 'true' ? true : hasTrackingNumber === 'false' ? false : undefined,
    });

    // Fetch events for each order (for backward compatibility)
    const ordersWithEvents = await Promise.all(
      result.orders.map(async (order) => {
        const events = await orderRepository.getEventsByOrderId(order.id, 5);
        return {
          ...order,
          events,
        };
      })
    );

    return Response.json({ orders: ordersWithEvents });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/orders/list' },
    });
  }
}
