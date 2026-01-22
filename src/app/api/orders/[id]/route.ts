/**
 * Order Detail Route
 * ==================
 *
 * API endpoint for getting order status from Lifefile.
 *
 * @module api/orders/[id]
 */

import lifefile from '@/lib/lifefile';
import { handleApiError, AppError } from '@/domains/shared/errors';

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/orders/[id]
 * Get order status from Lifefile API
 *
 * Note: This fetches status directly from Lifefile pharmacy API,
 * not from our local database. The ID is the Lifefile order ID.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const status = await lifefile.getOrderStatus(id);

    return Response.json({ success: true, status });
  } catch (error) {
    // Return 502 for Lifefile API errors (external service)
    if (error instanceof Error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 502 }
      );
    }

    return handleApiError(error, {
      context: { route: 'GET /api/orders/[id]' },
    });
  }
}
