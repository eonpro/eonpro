import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { billingAnalyticsService } from '@/services/billing';
import { logger } from '@/lib/logger';
import { withoutClinicFilter } from '@/lib/db';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const querySchema = z.object({
  type: z
    .enum(['dashboard', 'revenue-trend', 'ar-aging', 'fee-breakdown', 'collection', 'top-clinics'])
    .default('dashboard'),
  months: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 12)),
  startDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 10)),
});

/**
 * GET /api/super-admin/billing-analytics
 * Returns financial analytics data based on query type.
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, _user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const params = Object.fromEntries(searchParams.entries());
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type, months, startDate, endDate, limit } = parsed.data;
    const now = new Date();
    const defaultStart = startDate ?? new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const defaultEnd = endDate ?? now;

    const data = await withoutClinicFilter(async () => {
      switch (type) {
        case 'dashboard':
          return billingAnalyticsService.getDashboardSummary();
        case 'revenue-trend':
          return billingAnalyticsService.getRevenueTrend(months);
        case 'ar-aging':
          return billingAnalyticsService.getARAgingReport();
        case 'fee-breakdown':
          return billingAnalyticsService.getFeeTypeBreakdown(defaultStart, defaultEnd);
        case 'collection':
          return billingAnalyticsService.getCollectionMetrics(defaultStart, defaultEnd);
        case 'top-clinics':
          return billingAnalyticsService.getTopClinicsByRevenue(limit, startDate, endDate);
        default:
          return null;
      }
    });

    if (data === null) {
      return NextResponse.json({ error: 'Unknown analytics type' }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    logger.error('[SuperAdmin] Billing analytics error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
});
