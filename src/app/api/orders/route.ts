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

/**
 * Get the current date parts (year, month, day, dayOfWeek) in a specific IANA timezone.
 * Falls back to UTC if the timezone is invalid.
 */
function getDatePartsInTimezone(tz: string): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
} {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(now);
    const yearPart = parts.find((p) => p.type === 'year');
    const monthPart = parts.find((p) => p.type === 'month');
    const dayPart = parts.find((p) => p.type === 'day');
    const weekdayPart = parts.find((p) => p.type === 'weekday');
    if (!yearPart || !monthPart || !dayPart || !weekdayPart) {
      throw new Error('Missing date parts from formatter');
    }
    const year = Number(yearPart.value);
    const month = Number(monthPart.value) - 1; // 0-indexed
    const day = Number(dayPart.value);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = dayNames.indexOf(weekdayPart.value);

    return { year, month, day, dayOfWeek };
  } catch {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth(),
      day: now.getUTCDate(),
      dayOfWeek: now.getUTCDay(),
    };
  }
}

/**
 * Create a UTC Date that represents midnight of a given calendar date in
 * the specified IANA timezone. For example, midnightInTz(2026, 2, 11, 'America/New_York')
 * returns 2026-03-11T04:00:00.000Z (EDT is UTC-4 in March).
 */
function midnightInTz(year: number, month: number, day: number, tz: string): Date {
  const guess = new Date(Date.UTC(year, month, day, 12, 0, 0));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(guess);
    const hourPart = parts.find((p) => p.type === 'hour');
    const minutePart = parts.find((p) => p.type === 'minute');
    if (!hourPart || !minutePart) {
      throw new Error('Missing time parts from formatter');
    }
    const h = Number(hourPart.value) % 24;
    const m = Number(minutePart.value);
    const offsetMs = (h * 60 + m - 12 * 60) * 60 * 1000;
    return new Date(Date.UTC(year, month, day) - offsetMs);
  } catch {
    return new Date(Date.UTC(year, month, day));
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resolvePeriodDates(
  period: string,
  startDateParam?: string,
  endDateParam?: string,
  tz = 'UTC'
): { start: Date; end: Date } {
  const { year, month, day, dayOfWeek } = getDatePartsInTimezone(tz);

  const todayStart = midnightInTz(year, month, day, tz);
  const tomorrowStart = new Date(todayStart.getTime() + MS_PER_DAY);
  const endOfToday = new Date(tomorrowStart.getTime() - 1);

  switch (period) {
    case 'today':
      return { start: todayStart, end: endOfToday };
    case 'yesterday': {
      const yesterdayStart = new Date(todayStart.getTime() - MS_PER_DAY);
      return { start: yesterdayStart, end: new Date(todayStart.getTime() - 1) };
    }
    case 'this_week': {
      const weekStartDate = new Date(todayStart.getTime() - dayOfWeek * MS_PER_DAY);
      return { start: weekStartDate, end: endOfToday };
    }
    case 'last_week': {
      const thisWeekStart = new Date(todayStart.getTime() - dayOfWeek * MS_PER_DAY);
      const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * MS_PER_DAY);
      return { start: lastWeekStart, end: new Date(thisWeekStart.getTime() - 1) };
    }
    case 'this_month': {
      const monthStart = midnightInTz(year, month, 1, tz);
      return { start: monthStart, end: endOfToday };
    }
    case 'last_month': {
      const lastMonthStart = midnightInTz(year, month - 1, 1, tz);
      const thisMonthStart = midnightInTz(year, month, 1, tz);
      return { start: lastMonthStart, end: new Date(thisMonthStart.getTime() - 1) };
    }
    case 'this_quarter': {
      const qStartMonth = Math.floor(month / 3) * 3;
      const qStart = midnightInTz(year, qStartMonth, 1, tz);
      return { start: qStart, end: endOfToday };
    }
    case 'last_quarter': {
      const thisQStartMonth = Math.floor(month / 3) * 3;
      const lastQStartMonth = thisQStartMonth - 3;
      const lqStartYear = lastQStartMonth < 0 ? year - 1 : year;
      const lqStartMonth = lastQStartMonth < 0 ? lastQStartMonth + 12 : lastQStartMonth;
      const lqStart = midnightInTz(lqStartYear, lqStartMonth, 1, tz);
      const lqEnd = midnightInTz(year, thisQStartMonth, 1, tz);
      return { start: lqStart, end: new Date(lqEnd.getTime() - 1) };
    }
    case 'this_semester': {
      const semStartMonth = month < 6 ? 0 : 6;
      const semStart = midnightInTz(year, semStartMonth, 1, tz);
      return { start: semStart, end: endOfToday };
    }
    case 'last_semester': {
      const thisSemStart = month < 6 ? 0 : 6;
      const lsStartYear = thisSemStart === 0 ? year - 1 : year;
      const lsStartMonth = thisSemStart === 0 ? 6 : 0;
      const lsStart = midnightInTz(lsStartYear, lsStartMonth, 1, tz);
      const lsEnd = midnightInTz(year, thisSemStart, 1, tz);
      return { start: lsStart, end: new Date(lsEnd.getTime() - 1) };
    }
    case 'this_year': {
      const yearStart = midnightInTz(year, 0, 1, tz);
      return { start: yearStart, end: endOfToday };
    }
    case 'last_year': {
      const lastYearStart = midnightInTz(year - 1, 0, 1, tz);
      const thisYearStart = midnightInTz(year, 0, 1, tz);
      return { start: lastYearStart, end: new Date(thisYearStart.getTime() - 1) };
    }
    case 'custom': {
      if (!startDateParam || !endDateParam) {
        const monthStart = midnightInTz(year, month, 1, tz);
        return { start: monthStart, end: endOfToday };
      }
      const [sy, sm, sd] = startDateParam.split('-').map(Number);
      const [ey, em, ed] = endDateParam.split('-').map(Number);
      const s = midnightInTz(sy, sm - 1, sd, tz);
      const eNext = new Date(midnightInTz(ey, em - 1, ed, tz).getTime() + MS_PER_DAY);
      return { start: s, end: new Date(eNext.getTime() - 1) };
    }
    default: {
      const monthStart = midnightInTz(year, month, 1, tz);
      return { start: monthStart, end: endOfToday };
    }
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
    const tz = searchParams.get('tz') || 'America/New_York';

    // Resolve date filters from period preset or explicit start/end
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (period && period !== 'all') {
      const { start, end } = resolvePeriodDates(period, startDateParam, endDateParam, tz);
      dateFrom = start;
      dateTo = end;
    } else if (startDateParam || endDateParam) {
      if (startDateParam) {
        const [sy, sm, sd] = startDateParam.split('-').map(Number);
        dateFrom = midnightInTz(sy, sm - 1, sd, tz);
      }
      if (endDateParam) {
        const [ey, em, ed] = endDateParam.split('-').map(Number);
        const nextDay = new Date(midnightInTz(ey, em - 1, ed, tz).getTime() + MS_PER_DAY);
        dateTo = new Date(nextDay.getTime() - 1);
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
