/**
 * Order Detail Route
 * ==================
 *
 * API endpoint for getting order status from Lifefile.
 *
 * @module api/orders/[id]
 * @security Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import lifefile from '@/lib/lifefile';
import { verifyAuth } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { logger } from '@/lib/logger';

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/orders/[id]
 * Get order status from Lifefile API
 *
 * Note: This fetches status directly from Lifefile pharmacy API,
 * not from our local database. The ID is the Lifefile order ID.
 *
 * @security Requires authentication
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (authResult.user) {
      requirePermission(toPermissionContext(authResult.user), 'order:view');
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    logger.info('[Orders] Fetching Lifefile order status', {
      lifefileOrderId: id,
      userId: authResult.user?.id,
    });

    const status = await lifefile.getOrderStatus(id);

    return NextResponse.json({ success: true, status });
  } catch (error) {
    // Return 502 for Lifefile API errors (external service)
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 502 });
    }

    return handleApiError(error, {
      context: { route: 'GET /api/orders/[id]' },
    });
  }
}
