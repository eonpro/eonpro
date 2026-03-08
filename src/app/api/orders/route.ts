/**
 * Orders Route
 * ============
 *
 * API endpoints for order list and creation.
 * Uses the order service layer for business logic.
 *
 * SECURITY: All endpoints require authentication.
 * POST requires provider/admin role for order creation.
 *
 * @module api/orders
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import lifefile from '@/lib/lifefile';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { orderService, type UserContext } from '@/domains/order';
import { handleApiError } from '@/domains/shared/errors';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

const IDEMPOTENCY_RESOURCE_ORDER = 'order_create';

function resolvePeriodDates(
  period: string,
  startDateParam?: string,
  endDateParam?: string
): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (period) {
    case 'today':
      return { start: today, end: endOfToday };
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { start: yesterday, end: new Date(today.getTime() - 1) };
    }
    case 'this_week': {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return { start: weekStart, end: now };
    }
    case 'last_week': {
      const lastWeekEnd = new Date(today);
      lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
      lastWeekEnd.setHours(23, 59, 59, 999);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
      lastWeekStart.setHours(0, 0, 0, 0);
      return { start: lastWeekStart, end: lastWeekEnd };
    }
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case 'last_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case 'this_quarter': {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { start: qStart, end: now };
    }
    case 'last_quarter': {
      const lqEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0, 23, 59, 59, 999);
      const lqStart = new Date(lqEnd.getFullYear(), lqEnd.getMonth() - 2, 1);
      return { start: lqStart, end: lqEnd };
    }
    case 'this_semester': {
      const semStart = now.getMonth() < 6
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getFullYear(), 6, 1);
      return { start: semStart, end: now };
    }
    case 'last_semester': {
      const lsEnd = now.getMonth() < 6
        ? new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
        : new Date(now.getFullYear(), 5, 30, 23, 59, 59, 999);
      const lsStart = now.getMonth() < 6
        ? new Date(now.getFullYear() - 1, 6, 1)
        : new Date(now.getFullYear(), 0, 1);
      return { start: lsStart, end: lsEnd };
    }
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end: now };
    case 'last_year':
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      };
    case 'custom': {
      if (!startDateParam || !endDateParam) {
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
      }
      const s = new Date(startDateParam);
      s.setHours(0, 0, 0, 0);
      const e = new Date(endDateParam);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    default:
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }
}

// Zod schema for order creation request
const createOrderSchema = z.object({
  patientId: z.number().positive('Patient ID must be positive'),
  providerId: z.number().positive('Provider ID must be positive').optional(),
  products: z
    .array(
      z.object({
        productId: z.number().positive(),
        quantity: z.number().min(1).default(1),
      })
    )
    .min(1, 'At least one product is required')
    .optional(),
  // Lifefile-specific fields
  orderType: z.string().optional(),
  shippingAddress: z
    .object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(2).max(2),
      zip: z.string().min(5),
      country: z.string().default('US'),
    })
    .optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/orders
 * List orders with filtering and pagination
 *
 * Query params:
 * - limit: Max results per page (default 50)
 * - offset: Number of results to skip (default 0)
 * - recent: Time filter (e.g., '24h')
 * - status: Filter by status
 * - patientId: Filter by patient
 * - period: Date preset (today, this_week, this_month, this_quarter, this_semester, this_year, custom)
 * - startDate: ISO date string for custom range start
 * - endDate: ISO date string for custom range end
 */
async function listOrdersHandler(request: NextRequest, user: AuthUser) {
  try {
    requirePermission(toPermissionContext(user), 'order:view');
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const recent = searchParams.get('recent') || undefined;
    const status = searchParams.get('status') || undefined;
    const patientId = searchParams.get('patientId');
    const search = searchParams.get('search') || undefined;
    const period = searchParams.get('period') || undefined;
    const startDateParam = searchParams.get('startDate') || undefined;
    const endDateParam = searchParams.get('endDate') || undefined;

    // Resolve date filters from period preset or explicit start/end
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (period && period !== 'all') {
      const { start, end } = resolvePeriodDates(period, startDateParam, endDateParam);
      dateFrom = start;
      dateTo = end;
    } else if (startDateParam || endDateParam) {
      if (startDateParam) {
        dateFrom = new Date(startDateParam);
        dateFrom.setHours(0, 0, 0, 0);
      }
      if (endDateParam) {
        dateTo = new Date(endDateParam);
        dateTo.setHours(23, 59, 59, 999);
      }
    }

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
      offset,
      recent,
      status,
      patientId: patientId ? parseInt(patientId, 10) : undefined,
      search,
      dateFrom,
      dateTo,
    });

    // Return paginated results with metadata
    return NextResponse.json({
      orders: result.orders,
      count: result.count,
      total: result.total,
      hasMore: result.hasMore,
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/orders' },
    });
  }
}

// Export with authentication wrapper
export const GET = withAuth(listOrdersHandler);

/**
 * POST /api/orders
 * Create order via Lifefile API
 *
 * SECURITY: Requires authentication with provider, admin, or super_admin role.
 *
 * Note: This is a pass-through to Lifefile.
 * For full prescription creation, use POST /api/prescriptions
 */
async function createOrderHandler(req: NextRequest, user: AuthUser) {
  try {
    requirePermission(toPermissionContext(user), 'order:create');

    const idempotencyKey = req.headers.get('idempotency-key')?.trim();
    if (idempotencyKey) {
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });
      if (existing && existing.resource === IDEMPOTENCY_RESOURCE_ORDER) {
        return NextResponse.json(existing.responseBody as object, {
          status: existing.responseStatus,
        });
      }
    }

    const body = await req.json();

    // Validate request body
    const validationResult = createOrderSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid order data', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Log order creation for audit
    logger.info('Order creation initiated', {
      userId: user.id,
      role: user.role,
      clinicId: user.clinicId,
      patientId: validationResult.data.patientId,
    });

    const order = await lifefile.createOrder(validationResult.data);

    logger.info('Order created successfully', {
      userId: user.id,
      lifefileOrderId: order.data?.orderId,
    });

    const responseData = order.data;
    const status = 200;

    if (idempotencyKey && responseData) {
      await prisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          resource: IDEMPOTENCY_RESOURCE_ORDER,
          responseStatus: status,
          responseBody: responseData as object,
        },
      });
    }

    await auditPhiAccess(req, buildAuditPhiOptions(req, user, 'order:create', {
      patientId: validationResult.data.patientId,
      route: 'POST /api/orders',
    }));

    return NextResponse.json(responseData);
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'POST /api/orders', userId: user.id },
    });
  }
}

// Export with authentication wrapper - requires authenticated user
export const POST = withAuth(createOrderHandler);
