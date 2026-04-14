/**
 * Super Admin Sales Rep Detail API
 *
 * Comprehensive report card: stats, daily/weekly breakdown, commission ledger,
 * patient roster, and ref-code analytics for a single sales rep.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { serverError } from '@/lib/api/error-response';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { COMMISSION_ELIGIBLE_ROLES } from '@/lib/constants/commission-eligible-roles';

function withSalesRepAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    return withAuth(
      async (request: NextRequest, authUser: AuthUser) => {
        const params = await context.params;
        return handler(request, authUser, params);
      },
      { roles: ['super_admin'] }
    )(req);
  };
}

const safeDecrypt = (v: string | null): string => {
  if (!v) return '';
  try {
    return decryptPHI(v) ?? '';
  } catch {
    return v ?? '';
  }
};

function parseDateRange(req: NextRequest): { startDate: Date; endDate: Date } {
  const p = req.nextUrl.searchParams;
  const preset = p.get('preset');
  const cs = p.get('startDate');
  const ce = p.get('endDate');

  const now = new Date();
  let s = new Date();
  let e = new Date();

  if (cs && ce) {
    s = new Date(cs);
    e = new Date(ce);
    e.setHours(23, 59, 59, 999);
    return { startDate: s, endDate: e };
  }

  switch (preset) {
    case 'today':
      s.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      s.setDate(now.getDate() - 1);
      s.setHours(0, 0, 0, 0);
      e.setDate(now.getDate() - 1);
      e.setHours(23, 59, 59, 999);
      break;
    case 'this-week':
      s.setDate(now.getDate() - now.getDay());
      s.setHours(0, 0, 0, 0);
      break;
    case 'last-week': {
      const d = now.getDay();
      s.setDate(now.getDate() - d - 7);
      s.setHours(0, 0, 0, 0);
      e.setDate(now.getDate() - d - 1);
      e.setHours(23, 59, 59, 999);
      break;
    }
    case 'last7':
      s.setDate(now.getDate() - 7);
      s.setHours(0, 0, 0, 0);
      break;
    case 'this-month':
      s.setDate(1);
      s.setHours(0, 0, 0, 0);
      break;
    case 'last-month':
      s.setMonth(now.getMonth() - 1);
      s.setDate(1);
      s.setHours(0, 0, 0, 0);
      e.setDate(0);
      e.setHours(23, 59, 59, 999);
      break;
    case 'last30':
      s.setDate(now.getDate() - 30);
      s.setHours(0, 0, 0, 0);
      break;
    case 'this-quarter': {
      const q = Math.floor(now.getMonth() / 3);
      s = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case 'last-quarter': {
      const q = Math.floor(now.getMonth() / 3);
      s = new Date(now.getFullYear(), (q - 1) * 3, 1);
      e = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
      break;
    }
    case 'this-semester':
      s = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
      break;
    case 'last-semester':
      if (now.getMonth() < 6) {
        s = new Date(now.getFullYear() - 1, 6, 1);
        e = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      } else {
        s = new Date(now.getFullYear(), 0, 1);
        e = new Date(now.getFullYear(), 5, 30, 23, 59, 59, 999);
      }
      break;
    case 'this-year':
      s = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last-year':
      s = new Date(now.getFullYear() - 1, 0, 1);
      e = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    case 'all-time':
      s = new Date(2020, 0, 1);
      break;
    default:
      s.setDate(now.getDate() - 30);
      s.setHours(0, 0, 0, 0);
  }
  return { startDate: s, endDate: e };
}

async function handler(
  req: NextRequest,
  _user: AuthUser,
  params: { id: string }
): Promise<Response> {
  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid sales rep ID' }, { status: 400 });
  }

  const { startDate, endDate } = parseDateRange(req);

  logger.security('[SalesReps] Super admin viewed sales rep detail', {
    action: 'SALES_REP_DETAIL_VIEWED',
    salesRepId: userId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  try {
    return await withoutClinicFilter(async () => {
      const days = Math.min(Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000), 90);

      // Round 1: everything in parallel
      const [
        rep,
        totalClicks,
        totalConversions,
        totalPatientsAssigned,
        commissionAgg,
        dailyClicks,
        dailyConversions,
        dailyCommissions,
        commissionEvents,
        patientAssignments,
      ] = await Promise.all([
        prisma.user.findFirst({
          where: { id: userId, role: { in: [...COMMISSION_ELIGIBLE_ROLES] } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            clinicId: true,
            createdAt: true,
            lastLogin: true,
            clinic: { select: { id: true, name: true } },
            salesRepRefCodes: {
              select: { id: true, refCode: true, isActive: true, createdAt: true },
            },
            salesRepPlanAssignments: {
              where: { effectiveTo: null },
              include: { commissionPlan: { select: { name: true, planType: true } } },
              take: 1,
              orderBy: { effectiveFrom: 'desc' },
            },
          },
        }),
        prisma.salesRepTouch.count({
          where: {
            salesRepId: userId,
            touchType: 'CLICK',
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        prisma.salesRepTouch.count({
          where: { salesRepId: userId, convertedAt: { not: null, gte: startDate, lte: endDate } },
        }),
        prisma.patientSalesRepAssignment.count({
          where: {
            salesRepId: userId,
            isActive: true,
            assignedAt: { gte: startDate, lte: endDate },
          },
        }),
        prisma.salesRepCommissionEvent
          .aggregate({
            where: {
              salesRepId: userId,
              occurredAt: { gte: startDate, lte: endDate },
              status: { in: ['PENDING', 'APPROVED', 'PAID'] },
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          })
          .catch(() => ({
            _sum: { commissionAmountCents: null, eventAmountCents: null },
            _count: 0,
          })),
        prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM "SalesRepTouch"
        WHERE "salesRepId" = ${userId} AND "touchType" = 'CLICK'
          AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        GROUP BY DATE("createdAt") ORDER BY date
      `.catch(() => [] as Array<{ date: Date; count: number }>),
        prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE("convertedAt") as date, COUNT(*)::int as count
        FROM "SalesRepTouch"
        WHERE "salesRepId" = ${userId} AND "convertedAt" IS NOT NULL
          AND "convertedAt" >= ${startDate} AND "convertedAt" <= ${endDate}
        GROUP BY DATE("convertedAt") ORDER BY date
      `.catch(() => [] as Array<{ date: Date; count: number }>),
        prisma.$queryRaw<Array<{ date: Date; commission: number }>>`
        SELECT DATE("occurredAt") as date, COALESCE(SUM("commissionAmountCents"), 0)::int as commission
        FROM "SalesRepCommissionEvent"
        WHERE "salesRepId" = ${userId}
          AND "occurredAt" >= ${startDate} AND "occurredAt" <= ${endDate}
          AND status IN ('PENDING', 'APPROVED', 'PAID')
        GROUP BY DATE("occurredAt") ORDER BY date
      `.catch(() => [] as Array<{ date: Date; commission: number }>),
        // Commission event ledger (recent 100)
        prisma.salesRepCommissionEvent
          .findMany({
            where: { salesRepId: userId, occurredAt: { gte: startDate, lte: endDate } },
            orderBy: { occurredAt: 'desc' },
            take: 100,
            select: {
              id: true,
              occurredAt: true,
              eventAmountCents: true,
              commissionAmountCents: true,
              baseCommissionCents: true,
              volumeTierBonusCents: true,
              productBonusCents: true,
              multiItemBonusCents: true,
              status: true,
              isManual: true,
              notes: true,
              metadata: true,
            },
          })
          .catch(() => [] as any[]),
        // Patient roster (50 most recent assignments in period)
        prisma.patientSalesRepAssignment.findMany({
          where: {
            salesRepId: userId,
            isActive: true,
            assignedAt: { gte: startDate, lte: endDate },
          },
          orderBy: { assignedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            assignedAt: true,
            patientId: true,
            patient: {
              select: {
                id: true,
                patientId: true,
                firstName: true,
                lastName: true,
                createdAt: true,
                clinicId: true,
                _count: { select: { payments: { where: { status: 'SUCCEEDED' } } } },
              },
            },
          },
        }),
      ]);

      if (!rep) {
        return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 });
      }

      // Round 2: ref-code breakdown
      const refCodeStrings = rep.salesRepRefCodes.map((r) => r.refCode);
      const [clicksByCode, conversionsByCode] = await Promise.all([
        prisma.salesRepTouch.groupBy({
          by: ['refCode'],
          where: {
            refCode: { in: refCodeStrings },
            touchType: 'CLICK',
            createdAt: { gte: startDate, lte: endDate },
          },
          _count: true,
        }),
        prisma.salesRepTouch.groupBy({
          by: ['refCode'],
          where: {
            refCode: { in: refCodeStrings },
            convertedAt: { not: null, gte: startDate, lte: endDate },
          },
          _count: true,
        }),
      ]);

      // Build daily breakdown
      const clickMap = new Map(
        dailyClicks.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.count])
      );
      const convMap = new Map(
        dailyConversions.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.count])
      );
      const commDailyMap = new Map(
        dailyCommissions.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.commission])
      );

      const dailyBreakdown: Array<{
        date: string;
        clicks: number;
        conversions: number;
        commissionCents: number;
      }> = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        dailyBreakdown.push({
          date: d.toISOString(),
          clicks: clickMap.get(key) || 0,
          conversions: convMap.get(key) || 0,
          commissionCents: commDailyMap.get(key) || 0,
        });
      }

      // Build weekly rollup from daily data
      const weeklyRollup: Array<{
        weekStart: string;
        weekEnd: string;
        clicks: number;
        conversions: number;
        commissionCents: number;
      }> = [];
      let currentWeek: {
        weekStart: string;
        weekEnd: string;
        clicks: number;
        conversions: number;
        commissionCents: number;
      } | null = null;

      for (const day of dailyBreakdown) {
        const d = new Date(day.date);
        const dow = d.getDay();
        const mondayOffset = dow === 0 ? -6 : 1 - dow;
        const monday = new Date(d);
        monday.setDate(d.getDate() + mondayOffset);
        const weekKey = monday.toISOString().slice(0, 10);

        if (!currentWeek || currentWeek.weekStart !== weekKey) {
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          currentWeek = {
            weekStart: weekKey,
            weekEnd: sunday.toISOString().slice(0, 10),
            clicks: 0,
            conversions: 0,
            commissionCents: 0,
          };
          weeklyRollup.push(currentWeek);
        }
        currentWeek.clicks += day.clicks;
        currentWeek.conversions += day.conversions;
        currentWeek.commissionCents += day.commissionCents;
      }

      // Build code performance
      const codeClickMap = new Map(clicksByCode.map((r) => [r.refCode, r._count]));
      const codeConvMap = new Map(conversionsByCode.map((r) => [r.refCode, r._count]));
      const codePerformance = rep.salesRepRefCodes.map((rc) => {
        const cl = codeClickMap.get(rc.refCode) || 0;
        const co = codeConvMap.get(rc.refCode) || 0;
        return {
          id: rc.id,
          refCode: rc.refCode,
          isActive: rc.isActive,
          clicks: cl,
          conversions: co,
          conversionRate: cl > 0 ? (co / cl) * 100 : 0,
        };
      });

      // Commission event ledger (safe shape)
      const commissionLedger = (commissionEvents as any[]).map((ev: any) => ({
        id: ev.id,
        occurredAt: ev.occurredAt,
        eventAmountCents: ev.eventAmountCents,
        commissionAmountCents: ev.commissionAmountCents,
        baseCommissionCents: ev.baseCommissionCents,
        volumeTierBonusCents: ev.volumeTierBonusCents,
        productBonusCents: ev.productBonusCents,
        multiItemBonusCents: ev.multiItemBonusCents,
        status: ev.status,
        isManual: ev.isManual,
        notes: ev.notes,
        planName: ev.metadata?.planName || null,
      }));

      // Patient roster (decrypt PHI)
      type AssignmentRow = (typeof patientAssignments)[number];
      const patients = patientAssignments.map((a: AssignmentRow) => ({
        assignmentId: a.id,
        assignedAt: a.assignedAt,
        patientId: a.patient.id,
        displayId: a.patient.patientId,
        firstName: safeDecrypt(a.patient.firstName),
        lastName: safeDecrypt(a.patient.lastName),
        clinicId: a.patient.clinicId,
        createdAt: a.patient.createdAt,
        hasPayment: (a.patient._count?.payments || 0) > 0,
      }));

      // Override commission data (earned as a manager)
      const [overrideAgg, overrideAssignments, overrideLedger] = await Promise.all([
        prisma.salesRepOverrideCommissionEvent
          .aggregate({
            where: {
              overrideRepId: userId,
              occurredAt: { gte: startDate, lte: endDate },
              status: { in: ['PENDING', 'APPROVED', 'PAID'] },
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          })
          .catch(() => ({
            _sum: { commissionAmountCents: null, eventAmountCents: null },
            _count: 0,
          })),
        prisma.salesRepOverrideAssignment.findMany({
          where: { overrideRepId: userId, isActive: true },
          include: {
            subordinateRep: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
        prisma.salesRepOverrideCommissionEvent
          .findMany({
            where: { overrideRepId: userId, occurredAt: { gte: startDate, lte: endDate } },
            orderBy: { occurredAt: 'desc' },
            take: 50,
            select: {
              id: true,
              occurredAt: true,
              eventAmountCents: true,
              commissionAmountCents: true,
              overridePercentBps: true,
              subordinateRepId: true,
              status: true,
              notes: true,
            },
          })
          .catch(() => [] as any[]),
      ]);

      const overrideEarnedCents = overrideAgg._sum.commissionAmountCents || 0;
      const overrideRevenueCents = overrideAgg._sum.eventAmountCents || 0;
      const overrideEventCount = overrideAgg._count || 0;

      // Computed averages
      const revenueCents = commissionAgg._sum.eventAmountCents || 0;
      const commissionEarnedCents = commissionAgg._sum.commissionAmountCents || 0;
      const commEvents = commissionAgg._count || 0;

      return NextResponse.json({
        rep: {
          id: rep.id,
          name: `${rep.firstName || ''} ${rep.lastName || ''}`.trim() || rep.email,
          firstName: rep.firstName,
          lastName: rep.lastName,
          email: rep.email,
          status: rep.status,
          clinicId: rep.clinicId,
          clinicName: rep.clinic?.name || null,
          createdAt: rep.createdAt,
          lastLogin: rep.lastLogin,
          currentPlan: rep.salesRepPlanAssignments[0]?.commissionPlan?.name || null,
        },
        stats: {
          totalClicks,
          totalConversions,
          patientsAssigned: totalPatientsAssigned,
          commissionEarnedCents,
          revenueCents,
          commissionEvents: commEvents,
          overrideEarnedCents,
          overrideRevenueCents,
          overrideEvents: overrideEventCount,
          totalEarningsCents: commissionEarnedCents + overrideEarnedCents,
          conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
          avgDealSizeCents: totalConversions > 0 ? Math.round(revenueCents / totalConversions) : 0,
          avgCommissionPerSaleCents:
            commEvents > 0 ? Math.round(commissionEarnedCents / commEvents) : 0,
        },
        dailyBreakdown,
        weeklyRollup,
        commissionLedger,
        overrideCommissions: {
          subordinates: overrideAssignments.map((a) => ({
            assignmentId: a.id,
            subordinateRepId: a.subordinateRep.id,
            subordinateRepName:
              `${a.subordinateRep.firstName || ''} ${a.subordinateRep.lastName || ''}`.trim() ||
              a.subordinateRep.email,
            overridePercentBps: a.overridePercentBps,
            overridePercentDisplay: `${(a.overridePercentBps / 100).toFixed(2)}%`,
          })),
          ledger: (overrideLedger as any[]).map((ev: any) => ({
            id: ev.id,
            occurredAt: ev.occurredAt,
            eventAmountCents: ev.eventAmountCents,
            commissionAmountCents: ev.commissionAmountCents,
            overridePercentBps: ev.overridePercentBps,
            subordinateRepId: ev.subordinateRepId,
            status: ev.status,
            notes: ev.notes,
          })),
        },
        patients,
        codePerformance,
        dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      });
    }); // end withoutClinicFilter
  } catch (error) {
    logger.error('[SalesReps] Failed to fetch sales rep detail', {
      salesRepId: userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to fetch sales rep detail');
  }
}

export const GET = withSalesRepAuth(handler);
