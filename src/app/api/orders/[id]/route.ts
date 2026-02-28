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
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
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
 * @security Requires authentication with order:view permission
 */
async function handler(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split('/').pop();

    if (!id) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    logger.info('[Orders] Fetching Lifefile order status', {
      lifefileOrderId: id,
      userId: user.id,
    });

    const status = await lifefile.getOrderStatus(id);

    return NextResponse.json({ success: true, status });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 502 });
    }

    return handleApiError(error, {
      context: { route: 'GET /api/orders/[id]' },
    });
  }
}

export const GET = withAuth(handler, { roles: ['admin', 'super_admin', 'provider', 'staff'] });
