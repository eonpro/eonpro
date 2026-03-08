/**
 * Super Admin Sales Reps API
 *
 * Cross-clinic sales rep performance with flexible date ranges.
 * Sales reps are Users with role SALES_REP, tracked via SalesRepTouch,
 * PatientSalesRepAssignment, and SalesRepCommissionPlan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { serverError } from '@/lib/api/error-response';
import { superAdminRateLimit } from '@/lib/rateLimit';

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
      const dow = now.getDay();
      startDate.setDate(now.getDate() - dow - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - dow - 1);
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

  const { startDate, endDate } = parseDateRange(req);

  logger.security('[SalesReps] Super admin accessed sales rep performance', {
    action: 'SALES_REP_REPORT_VIEWED',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    clinicFilter: clinicIdParam || 'all',
  });

  try {
    return await withoutClinicFilter(async () => {
    const clinicFilter = clinicIdParam ? { clinicId: parseInt(clinicIdParam, 10) } : {};

    // Sales reps are Users with role SALES_REP
    const salesReps = await prisma.user.findMany({
      where: {
        role: 'SALES_REP',
        ...clinicFilter,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        clinicId: true,
        lastLogin: true,
        clinic: { select: { name: true } },
        salesRepRefCodes: {
          where: { isActive: true },
          select: { refCode: true },
        },
      },
    });

    if (salesReps.length === 0) {
      return NextResponse.json({
        summary: {
          totalReps: 0, activeReps: 0, totalPatients: 0,
          totalClicks: 0, totalConversions: 0, totalCommissionCents: 0,
          totalRevenueCents: 0, avgConversionRate: 0,
        },
        reps: [],
        dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      });
    }

    const repIds = salesReps.map((r) => r.id);

    // Parallel: clicks, conversions, patient assignments, commissions in the period
    const [clicksByRep, conversionsByRep, patientsByRep, commissionsByRep] = await Promise.all([
      prisma.salesRepTouch.groupBy({
        by: ['salesRepId'],
        where: {
          salesRepId: { in: repIds },
          touchType: 'CLICK',
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      prisma.salesRepTouch.groupBy({
        by: ['salesRepId'],
        where: {
          salesRepId: { in: repIds },
          convertedAt: { not: null, gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      prisma.patientSalesRepAssignment.groupBy({
        by: ['salesRepId'],
        where: {
          salesRepId: { in: repIds },
          isActive: true,
          assignedAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      prisma.salesRepCommissionEvent.groupBy({
        by: ['salesRepId'],
        where: {
          salesRepId: { in: repIds },
          occurredAt: { gte: startDate, lte: endDate },
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        },
        _sum: { commissionAmountCents: true, eventAmountCents: true },
      }),
    ]);

    const clicksMap = new Map(clicksByRep.map((r) => [r.salesRepId, r._count]));
    const conversionsMap = new Map(conversionsByRep.map((r) => [r.salesRepId, r._count]));
    const patientsMap = new Map(patientsByRep.map((r) => [r.salesRepId, r._count]));
    const commissionMap = new Map(commissionsByRep.map((r) => [r.salesRepId, {
      commissionCents: r._sum?.commissionAmountCents || 0,
      revenueCents: r._sum?.eventAmountCents || 0,
    }]));

    type RepRow = (typeof salesReps)[number];

    const reps = salesReps.map((r: RepRow) => {
      const clicks = clicksMap.get(r.id) || 0;
      const conversions = conversionsMap.get(r.id) || 0;
      const comm = commissionMap.get(r.id) || { commissionCents: 0, revenueCents: 0 };
      return {
        id: r.id,
        name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.email,
        email: r.email,
        status: r.status,
        clinicId: r.clinicId,
        clinicName: r.clinic?.name || null,
        lastLogin: r.lastLogin,
        totalClicks: clicks,
        totalConversions: conversions,
        patientsAssigned: patientsMap.get(r.id) || 0,
        conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
        commissionEarnedCents: comm.commissionCents,
        revenueCents: comm.revenueCents,
        refCodes: r.salesRepRefCodes.map((c) => c.refCode),
      };
    });

    reps.sort((a, b) => b.totalConversions - a.totalConversions);

    const activeReps = reps.filter((r) => r.status === 'ACTIVE').length;
    const totalClicks = reps.reduce((s, r) => s + r.totalClicks, 0);
    const totalConversions = reps.reduce((s, r) => s + r.totalConversions, 0);
    const totalCommissionCents = reps.reduce((s, r) => s + r.commissionEarnedCents, 0);
    const totalRevenueCents = reps.reduce((s, r) => s + r.revenueCents, 0);

    return NextResponse.json({
      summary: {
        totalReps: reps.length,
        activeReps,
        totalPatients: reps.reduce((s, r) => s + r.patientsAssigned, 0),
        totalClicks,
        totalConversions,
        totalCommissionCents,
        totalRevenueCents,
        avgConversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      },
      reps,
      dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
    }); // end withoutClinicFilter
  } catch (error) {
    logger.error('[SalesReps] Failed to fetch sales rep data', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to fetch sales rep performance data');
  }
}

export const GET = superAdminRateLimit(withSuperAdminAuth(handler));
