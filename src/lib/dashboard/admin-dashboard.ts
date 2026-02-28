/**
 * Unified Admin Dashboard Service
 * ================================
 *
 * Single source of truth for admin dashboard data.
 * - Parallelized Prisma queries
 * - Uses aggregate/count instead of findMany where possible
 * - 20s in-memory cache per clinic to reduce DB load
 *
 * @module lib/dashboard/admin-dashboard
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getReadPrisma } from '@/lib/database/read-replica';
import { patientService, type UserContext } from '@/domains/patient';
import { getDashboardCache, getDashboardCacheAsync, setDashboardCache } from '@/lib/cache/dashboard';
import { executeDbRead } from '@/lib/database/executeDb';
import { logger } from '@/lib/logger';

export interface DashboardStats {
  totalIntakes: number;
  totalPatients: number;
  totalPrescriptions: number;
  conversionRate: number;
  totalRevenue: number;
  recurringRevenue: number;
  recentIntakes: number;
  recentPrescriptions: number;
  recentRevenue: number;
}

export interface RecentIntake {
  id: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  createdAt: string;
}

export interface AdminDashboardPayload {
  stats: DashboardStats;
  recentIntakes: RecentIntake[];
}

const RECENT_HOURS = 24;
const RECENT_INTAKES_LIMIT = 20;

/**
 * Fetch full admin dashboard in a single operation.
 * All Prisma queries run in parallel.
 * Two-tier cache: L1 in-memory (20s) + L2 Redis (60s).
 */
export async function getAdminDashboard(
  userContext: UserContext
): Promise<AdminDashboardPayload> {
  // Ensure clinicId is strictly a number (JWT may deliver it as string)
  const rawClinicId = userContext.role === 'super_admin' ? undefined : (userContext.clinicId ?? undefined);
  const clinicId = rawClinicId != null ? Number(rawClinicId) : undefined;
  if (clinicId != null && (isNaN(clinicId) || clinicId <= 0)) {
    logger.error('[ADMIN-DASHBOARD] Invalid clinicId — cannot load stats', {
      userId: userContext.id,
      rawClinicId,
      clinicId,
    });
  }

  // L1 fast path (sync, zero-latency)
  const l1Cached = getDashboardCache(clinicId, userContext.id);
  if (l1Cached) return l1Cached;

  // L2 Redis path (async, ~1ms)
  const l2Cached = await getDashboardCacheAsync(clinicId, userContext.id);
  if (l2Cached) return l2Cached;

  const clinicFilter = clinicId ? { clinicId } : {};
  const twentyFourHoursAgo = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000);

  // PHASE 2 OPTIMIZATION: Consolidated from 9 queries → 3 queries
  //   Query A: Single raw SQL for counts + revenue aggregates (replaces 6 Prisma calls)
  //   Query B: Distinct converted patient IDs (payment + order) via raw SQL
  //   Query C: Subscription MRR groupBy (kept as Prisma — interval-based logic)
  const clinicWhere = clinicId ? Prisma.sql`AND "clinicId" = ${clinicId}` : Prisma.empty;

  const readDb = getReadPrisma();

  const statsResult = await executeDbRead(
    () =>
      Promise.all([
        // Query A: All counts + revenue in a single round-trip
        readDb.$queryRaw<
          [
            {
              total_patients: bigint;
              total_orders: bigint;
              recent_patients: bigint;
              recent_orders: bigint;
              total_revenue_cents: bigint;
              recent_revenue_cents: bigint;
            },
          ]
        >(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM "Patient" WHERE TRUE ${clinicWhere})::bigint
            AS total_patients,
          (SELECT COUNT(*) FROM "Order" WHERE TRUE ${clinicWhere})::bigint
            AS total_orders,
          (SELECT COUNT(*) FROM "Patient" WHERE "createdAt" >= ${twentyFourHoursAgo} ${clinicWhere})::bigint
            AS recent_patients,
          (SELECT COUNT(*) FROM "Order" WHERE "createdAt" >= ${twentyFourHoursAgo} ${clinicWhere})::bigint
            AS recent_orders,
          COALESCE((SELECT SUM("amountPaid") FROM "Invoice" WHERE status = 'PAID' ${clinicWhere}), 0)::bigint
            AS total_revenue_cents,
          COALESCE((SELECT SUM("amountPaid") FROM "Invoice" WHERE status = 'PAID' AND "paidAt" >= ${twentyFourHoursAgo} ${clinicWhere}), 0)::bigint
            AS recent_revenue_cents
        `),

        // Query B: Distinct converted patient IDs (union of payment + order)
        readDb.$queryRaw<Array<{ patient_id: number }>>(Prisma.sql`
        SELECT DISTINCT sub."patientId" AS patient_id FROM (
          SELECT "patientId" FROM "Payment"
          WHERE status = 'SUCCEEDED'
            AND "patientId" IN (SELECT id FROM "Patient" WHERE TRUE ${clinicWhere})
          UNION
          SELECT "patientId" FROM "Order"
          WHERE "patientId" IN (SELECT id FROM "Patient" WHERE TRUE ${clinicWhere})
        ) sub
        `),

        // Query C: Subscription MRR (kept as Prisma groupBy — small result set)
        readDb.subscription
          .groupBy({
            by: ['interval'],
            where: { ...clinicFilter, status: 'ACTIVE' },
            _sum: { amount: true },
          })
          .then((groups) =>
            groups.reduce((mrr, group) => {
              const amt = (group._sum.amount ?? 0) / 100;
              switch (group.interval) {
                case 'year':
                case 'yearly':
                case 'annual':
                  return mrr + amt / 12;
                case 'quarter':
                case 'quarterly':
                  return mrr + amt / 3;
                case 'week':
                case 'weekly':
                  return mrr + amt * 4;
                default:
                  return mrr + amt;
              }
            }, 0)
          ),
      ]),
    'admin-dashboard:stats:consolidated'
  );

  let totalPatientsCount = 0;
  let totalOrdersCount = 0;
  let recentPatientsCount = 0;
  let recentOrdersCount = 0;
  let totalRevenue = 0;
  let recentRevenue = 0;
  let totalConverted = 0;
  let subscriptionMrr = 0;

  if (statsResult.success && statsResult.data) {
    const [countsRow, convertedRows, mrr] = statsResult.data;
    const counts = countsRow[0];
    totalPatientsCount = Number(counts.total_patients);
    totalOrdersCount = Number(counts.total_orders);
    recentPatientsCount = Number(counts.recent_patients);
    recentOrdersCount = Number(counts.recent_orders);
    totalRevenue = Number(counts.total_revenue_cents) / 100;
    recentRevenue = Number(counts.recent_revenue_cents) / 100;
    totalConverted = convertedRows.length;
    subscriptionMrr = mrr;
  } else {
    // Raw SQL failed — log error and try Prisma ORM fallback
    logger.error('[ADMIN-DASHBOARD] Raw SQL stats query failed — attempting Prisma fallback', {
      userId: userContext.id,
      clinicId,
      errorType: statsResult.error?.type,
      errorMessage: statsResult.error?.message,
      attempts: statsResult.attempts,
      durationMs: statsResult.durationMs,
    });

    try {
      // Call Prisma ORM directly — do NOT go through executeDbRead again.
      // The circuit breaker may have been tripped by the raw SQL failure above,
      // which would block the fallback on the same READ tier.
      const fb = await prismaFallbackStats(clinicFilter, twentyFourHoursAgo);
      totalPatientsCount = fb.totalPatients;
      totalOrdersCount = fb.totalOrders;
      recentPatientsCount = fb.recentPatients;
      recentOrdersCount = fb.recentOrders;
      totalRevenue = fb.totalRevenue;
      recentRevenue = fb.recentRevenue;
      totalConverted = fb.totalConverted;
      subscriptionMrr = fb.subscriptionMrr;

      logger.info('[ADMIN-DASHBOARD] Prisma fallback succeeded', {
        userId: userContext.id,
        clinicId,
        totalPatients: totalPatientsCount,
        totalOrders: totalOrdersCount,
      });
    } catch (fallbackErr) {
      logger.error('[ADMIN-DASHBOARD] Prisma fallback also failed', {
        userId: userContext.id,
        clinicId,
        error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        stack: fallbackErr instanceof Error ? fallbackErr.stack : undefined,
      });
    }
  }

  const totalIntakes = Math.max(0, totalPatientsCount - totalConverted);
  const conversionRate =
    totalPatientsCount > 0
      ? Math.round((totalConverted / totalPatientsCount) * 100 * 10) / 10
      : 0;

  const stats: DashboardStats = {
    totalIntakes,
    totalPatients: totalConverted,
    totalPrescriptions: totalOrdersCount,
    conversionRate,
    totalRevenue,
    recurringRevenue: subscriptionMrr,
    recentIntakes: recentPatientsCount,
    recentPrescriptions: recentOrdersCount,
    recentRevenue,
  };

  // Phase 2: Recent intakes via patient service (PHI decryption handled)
  let recentIntakes: RecentIntake[] = [];
  try {
    const listResult = await patientService.listPatients(userContext, {
      limit: RECENT_INTAKES_LIMIT,
      recent: '24h',
    });

    recentIntakes = listResult.data.map((p) => ({
      id: p.id,
      patientId: p.patientId ?? null,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      email: p.email,
      phone: p.phone,
      dateOfBirth: p.dob ?? undefined,
      gender: p.gender ?? undefined,
      createdAt:
        p.createdAt instanceof Date
          ? p.createdAt.toISOString()
          : String(p.createdAt ?? new Date().toISOString()),
    }));
  } catch (listErr) {
    logger.error('[ADMIN-DASHBOARD] listPatients failed — returning stats without recent intakes', {
      userId: userContext.id,
      clinicId,
      error: listErr instanceof Error ? listErr.message : String(listErr),
    });
  }

  const payload: AdminDashboardPayload = { stats, recentIntakes };
  setDashboardCache(clinicId, userContext.id, payload);
  return payload;
}

/**
 * Prisma ORM fallback for dashboard stats.
 * Uses standard Prisma queries instead of raw SQL — slower but more resilient
 * to type mismatches and schema drift.
 */
async function prismaFallbackStats(
  clinicFilter: { clinicId?: number },
  twentyFourHoursAgo: Date
): Promise<{
  totalPatients: number;
  totalOrders: number;
  recentPatients: number;
  recentOrders: number;
  totalRevenue: number;
  recentRevenue: number;
  totalConverted: number;
  subscriptionMrr: number;
}> {
  const db = getReadPrisma();
  const [
    totalPatients,
    totalOrders,
    recentPatients,
    recentOrders,
    revenueAgg,
    recentRevenueAgg,
    convertedPayments,
    convertedOrders,
    mrrGroups,
  ] = await Promise.all([
    db.patient.count({ where: { ...clinicFilter } }),
    db.order.count({ where: { ...clinicFilter } }),
    db.patient.count({ where: { ...clinicFilter, createdAt: { gte: twentyFourHoursAgo } } }),
    db.order.count({ where: { ...clinicFilter, createdAt: { gte: twentyFourHoursAgo } } }),
    db.invoice.aggregate({
      where: { ...clinicFilter, status: 'PAID' },
      _sum: { amountPaid: true },
    }),
    db.invoice.aggregate({
      where: { ...clinicFilter, status: 'PAID', paidAt: { gte: twentyFourHoursAgo } },
      _sum: { amountPaid: true },
    }),
    db.payment.findMany({
      where: { status: 'SUCCEEDED', patient: { ...clinicFilter } },
      select: { patientId: true },
      distinct: ['patientId'],
    }),
    db.order.findMany({
      where: { patient: { ...clinicFilter } },
      select: { patientId: true },
      distinct: ['patientId'],
    }),
    db.subscription.groupBy({
      by: ['interval'],
      where: { ...clinicFilter, status: 'ACTIVE' },
      _sum: { amount: true },
    }),
  ]);

  const convertedIds = new Set([
    ...convertedPayments.map((p) => p.patientId),
    ...convertedOrders.map((o) => o.patientId),
  ]);

  const subscriptionMrr = mrrGroups.reduce((mrr, group) => {
    const amt = (group._sum.amount ?? 0) / 100;
    switch (group.interval) {
      case 'year':
      case 'yearly':
      case 'annual':
        return mrr + amt / 12;
      case 'quarter':
      case 'quarterly':
        return mrr + amt / 3;
      case 'week':
      case 'weekly':
        return mrr + amt * 4;
      default:
        return mrr + amt;
    }
  }, 0);

  return {
    totalPatients,
    totalOrders,
    recentPatients,
    recentOrders,
    totalRevenue: (revenueAgg._sum.amountPaid ?? 0) / 100,
    recentRevenue: (recentRevenueAgg._sum.amountPaid ?? 0) / 100,
    totalConverted: convertedIds.size,
    subscriptionMrr,
  };
}
