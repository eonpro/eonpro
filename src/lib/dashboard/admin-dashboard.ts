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
import { patientService, type UserContext } from '@/domains/patient';
import { getDashboardCache, getDashboardCacheAsync, setDashboardCache } from '@/lib/cache/dashboard';
import { executeDbRead } from '@/lib/database/executeDb';

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
  const clinicId = userContext.role === 'super_admin' ? undefined : (userContext.clinicId ?? undefined);

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

  const statsResult = await executeDbRead(
    () =>
      Promise.all([
        // Query A: All counts + revenue in a single round-trip
        prisma.$queryRaw<
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
        prisma.$queryRaw<Array<{ patient_id: number }>>(Prisma.sql`
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
        prisma.subscription
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

  // If breaker blocked the stats query, return zeroed stats
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
  const listResult = await patientService.listPatients(userContext, {
    limit: RECENT_INTAKES_LIMIT,
    recent: '24h',
  });

  const recentIntakes: RecentIntake[] = listResult.data.map((p) => ({
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

  const payload: AdminDashboardPayload = { stats, recentIntakes };
  setDashboardCache(clinicId, userContext.id, payload);
  return payload;
}
