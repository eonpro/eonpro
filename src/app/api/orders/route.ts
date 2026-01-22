/**
 * Orders Route
 * ============
 *
 * API endpoints for order list and creation.
 * Uses the order service layer for business logic.
 *
 * @module api/orders
 */

import { NextRequest, NextResponse } from 'next/server';
import lifefile from '@/lib/lifefile';
import { verifyAuth } from '@/lib/auth/middleware';
import { orderService, type UserContext } from '@/domains/order';
import { handleApiError } from '@/domains/shared/errors';

/**
 * GET /api/orders
 * List orders with filtering
 *
 * Query params:
 * - limit: Max results (default 100)
 * - recent: Time filter (e.g., '24h')
 * - status: Filter by status
 * - patientId: Filter by patient
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = authResult.user!;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const recent = searchParams.get('recent') || undefined;
    const status = searchParams.get('status') || undefined;
    const patientId = searchParams.get('patientId');

    // Convert auth user to service UserContext
    const userContext: UserContext = {
      id: user.id,
      email: user.email,
      role: user.role as UserContext['role'],
      clinicId: user.clinicId,
      patientId: user.patientId,
      providerId: user.providerId,
    };

    // Use order service - handles clinic isolation, access control
    const result = await orderService.listOrders(userContext, {
      limit,
      recent,
      status,
      patientId: patientId ? parseInt(patientId, 10) : undefined,
    });

    // Include rxs for backward compatibility
    // The service returns OrderWithPatient, we need to fetch rxs separately if needed
    return NextResponse.json({
      orders: result.orders,
      count: result.count,
    });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/orders' },
    });
  }
}

/**
 * POST /api/orders
 * Create order via Lifefile API
 *
 * Note: This is a pass-through to Lifefile.
 * For full prescription creation, use POST /api/prescriptions
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const order = await lifefile.createOrder(body);
    return Response.json(order.data);
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'POST /api/orders' },
    });
  }
}
