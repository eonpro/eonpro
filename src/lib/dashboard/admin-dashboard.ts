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

import { prisma } from '@/lib/db';
import { patientService, type UserContext } from '@/domains/patient';
import { getDashboardCache, setDashboardCache } from '@/lib/cache/dashboard';

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
 * Uses 20s in-memory cache per (clinicId, userId) to reduce DB load.
 */
export async function getAdminDashboard(
  userContext: UserContext
): Promise<AdminDashboardPayload> {
  const clinicId = userContext.role === 'super_admin' ? undefined : (userContext.clinicId ?? undefined);
  const cached = getDashboardCache(clinicId, userContext.id);
  if (cached) return cached;

  const clinicFilter = clinicId ? { clinicId } : {};
  const twentyFourHoursAgo = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000);

  // Phase 1: All count/aggregate queries in parallel (no findMany for aggregates)
  const [
    convertedFromPayments,
    convertedFromOrders,
    totalPatientsCount,
    totalOrdersCount,
    recentPatientsCount,
    recentOrdersCount,
    totalRevenueAgg,
    recentRevenueAgg,
    subscriptionMrr,
  ] = await Promise.all([
    // Converted = distinct patient IDs with SUCCEEDED payment
    prisma.payment
      .groupBy({
        by: ['patientId'],
        where: {
          status: 'SUCCEEDED',
          ...(clinicId && { patient: { clinicId } }),
        },
        _count: { patientId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.patientId))),

    // Converted = distinct patient IDs with order
    prisma.order
      .groupBy({
        by: ['patientId'],
        where: clinicId ? { patient: { clinicId } } : {},
        _count: { patientId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.patientId))),

    prisma.patient.count({ where: clinicFilter }),
    prisma.order.count({ where: clinicFilter }),
    prisma.patient.count({
      where: { ...clinicFilter, createdAt: { gte: twentyFourHoursAgo } },
    }),
    prisma.order.count({
      where: { ...clinicFilter, createdAt: { gte: twentyFourHoursAgo } },
    }),

    // Revenue: use aggregate instead of findMany + reduce
    prisma.invoice.aggregate({
      where: { ...clinicFilter, status: 'PAID' },
      _sum: { amountPaid: true },
    }),

    prisma.invoice.aggregate({
      where: {
        ...clinicFilter,
        status: 'PAID',
        paidAt: { gte: twentyFourHoursAgo },
      },
      _sum: { amountPaid: true },
    }),

    // PERF FIX: Use groupBy by interval instead of loading up to 500 subscription records.
    // Returns at most ~5 rows (one per interval type) instead of 500 full records.
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
  ]);

  const convertedIds = new Set<number>([
    ...convertedFromPayments,
    ...convertedFromOrders,
  ]);
  const totalConverted = convertedIds.size;
  const totalIntakes = Math.max(0, totalPatientsCount - totalConverted);
  const conversionRate =
    totalPatientsCount > 0
      ? Math.round((totalConverted / totalPatientsCount) * 100 * 10) / 10
      : 0;

  const totalRevenue = ((totalRevenueAgg._sum?.amountPaid ?? 0) / 100);
  const recentRevenue = ((recentRevenueAgg._sum?.amountPaid ?? 0) / 100);

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
