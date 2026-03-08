/**
 * Super Admin Sales Reps API
 *
 * Cross-clinic sales rep (affiliate) performance with flexible date ranges.
 * Supports: day, week, month, quarter, semester, year, custom date ranges.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { ACTIVE_COMMISSION_STATUSES, CLICK_FILTER } from '@/services/affiliate/reportingConstants';
import { serverError } from '@/lib/api/error-response';
import { superAdminRateLimit } from '@/lib/rateLimit';

interface SalesRepRow {
  id: number;
  displayName: string;
  status: string;
  clinicId: number;
  clinicName: string;
  totalClicks: number;
  totalConversions: number;
  totalRevenueCents: number;
  totalCommissionCents: number;
  conversionRate: number;
  refCodes: string[];
}

interface SalesRepSummary {
  totalReps: number;
  activeReps: number;
  totalSales: number;
  totalRevenueCents: number;
  totalEarningsCents: number;
  totalClicks: number;
  avgConversionRate: number;
}

function parseDateRange(req: NextRequest): { startDate: Date; endDate: Date } {
  const params = req.nextUrl.searchParams;
  const preset = params.get('preset');
  const customStart = params.get('startDate');
  const customEnd = params.get('endDate');

  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  if (customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  switch (preset) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this-week':
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'last-week': {
      const dayOfWeek = now.getDay();
      startDate.setDate(now.getDate() - dayOfWeek - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - dayOfWeek - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'last7':
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'this-month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'last-month':
      startDate.setMonth(now.getMonth() - 1);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last30':
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'this-quarter': {
      const q = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case 'last-quarter': {
      const q = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), (q - 1) * 3, 1);
      endDate = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
      break;
    }
    case 'this-semester':
      startDate = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
      break;
    case 'last-semester':
      if (now.getMonth() < 6) {
        startDate = new Date(now.getFullYear() - 1, 6, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      } else {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 5, 30, 23, 59, 59, 999);
      }
      break;
    case 'this-year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last-year':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    case 'all-time':
      startDate = new Date(2020, 0, 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
}

async function handler(req: NextRequest): Promise<Response> {
  const params = req.nextUrl.searchParams;
  const clinicIdParam = params.get('clinicId');
  const sortBy = params.get('sortBy') || 'conversions';
  const sortDir = params.get('sortDir') || 'desc';

  const { startDate, endDate } = parseDateRange(req);

  logger.security('[SalesReps] Super admin accessed sales rep performance', {
    action: 'SALES_REP_REPORT_VIEWED',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    clinicFilter: clinicIdParam || 'all',
  });

  try {
    const clinicFilter = clinicIdParam ? { clinicId: parseInt(clinicIdParam, 10) } : {};

    const affiliates = await prisma.affiliate.findMany({
      where: clinicFilter,
      select: {
        id: true,
        displayName: true,
        status: true,
        clinicId: true,
        clinic: { select: { name: true } },
        refCodes: {
          where: { isActive: true },
          select: { refCode: true },
        },
      },
    });

    if (affiliates.length === 0) {
      return NextResponse.json({
        summary: {
          totalReps: 0,
          activeReps: 0,
          totalSales: 0,
          totalRevenueCents: 0,
          totalEarningsCents: 0,
          totalClicks: 0,
          avgConversionRate: 0,
        },
        reps: [],
        dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      });
    }

    const affiliateIds = affiliates.map((a) => a.id);

    const [clicksByAffiliate, conversionsByAffiliate, commissionsByAffiliate] = await Promise.all([
      prisma.affiliateTouch.groupBy({
        by: ['affiliateId'],
        where: {
          affiliateId: { in: affiliateIds },
          ...CLICK_FILTER,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      prisma.affiliateTouch.groupBy({
        by: ['affiliateId'],
        where: {
          affiliateId: { in: affiliateIds },
          convertedAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      prisma.affiliateCommissionEvent.groupBy({
        by: ['affiliateId'],
        where: {
          affiliateId: { in: affiliateIds },
          occurredAt: { gte: startDate, lte: endDate },
          status: { in: ACTIVE_COMMISSION_STATUSES as any },
        },
        _sum: { eventAmountCents: true, commissionAmountCents: true },
      }),
    ]);

    const clicksMap = new Map(clicksByAffiliate.map((r) => [r.affiliateId, r._count]));
    const conversionsMap = new Map(conversionsByAffiliate.map((r) => [r.affiliateId, r._count]));
    const revenueMap = new Map(
      commissionsByAffiliate.map((r) => [r.affiliateId, r._sum?.eventAmountCents || 0])
    );
    const commissionMap = new Map(
      commissionsByAffiliate.map((r) => [r.affiliateId, r._sum?.commissionAmountCents || 0])
    );

    type AffiliateRow = (typeof affiliates)[number];

    const reps: SalesRepRow[] = affiliates.map((a: AffiliateRow) => {
      const clicks = clicksMap.get(a.id) || 0;
      const conversions = conversionsMap.get(a.id) || 0;
      return {
        id: a.id,
        displayName: a.displayName,
        status: a.status,
        clinicId: a.clinicId,
        clinicName: a.clinic.name,
        totalClicks: clicks,
        totalConversions: conversions,
        totalRevenueCents: revenueMap.get(a.id) || 0,
        totalCommissionCents: commissionMap.get(a.id) || 0,
        conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
        refCodes: a.refCodes.map((r) => r.refCode),
      };
    });

    const sortFn = (a: SalesRepRow, b: SalesRepRow) => {
      const key = sortBy as keyof SalesRepRow;
      const valA = typeof a[key] === 'number' ? (a[key] as number) : 0;
      const valB = typeof b[key] === 'number' ? (b[key] as number) : 0;
      return sortDir === 'asc' ? valA - valB : valB - valA;
    };
    reps.sort(sortFn);

    const activeReps = reps.filter((r) => r.status === 'ACTIVE').length;
    const totalClicks = reps.reduce((s, r) => s + r.totalClicks, 0);
    const totalConversions = reps.reduce((s, r) => s + r.totalConversions, 0);

    const summary: SalesRepSummary = {
      totalReps: reps.length,
      activeReps,
      totalSales: totalConversions,
      totalRevenueCents: reps.reduce((s, r) => s + r.totalRevenueCents, 0),
      totalEarningsCents: reps.reduce((s, r) => s + r.totalCommissionCents, 0),
      totalClicks,
      avgConversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
    };

    return NextResponse.json({
      summary,
      reps,
      dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error) {
    logger.error('[SalesReps] Failed to fetch sales rep data', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to fetch sales rep performance data');
  }
}

export const GET = superAdminRateLimit(withSuperAdminAuth(handler));
