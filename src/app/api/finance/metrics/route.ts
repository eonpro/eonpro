/**
 * Finance Metrics API
 *
 * GET /api/finance/metrics
 * Returns aggregated financial KPIs for the dashboard
 *
 * Uses withAdminAuth so the auth middleware handles:
 * - JWT verification and session validation
 * - Role check (super_admin, admin only)
 * - Subdomain clinic override (e.g. ot.eonpro.io → OT clinic context)
 * - Clinic context setup via runWithClinicContext (thread-safe)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getReadPrisma } from '@/lib/database/read-replica';
import { Prisma } from '@prisma/client';
import { withAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { AGGREGATION_TAKE } from '@/lib/pagination';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { startOfYear, subDays, startOfMonth } from 'date-fns';

/**
 * Check if an error is a database connection error (P2024, P1001, etc.)
 * Returns 503 instead of 500 for transient DB failures
 */
function isDatabaseConnectionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const connectionErrorCodes = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'];
    return connectionErrorCodes.includes(error.code);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const patterns = ['connection', 'econnrefused', 'econnreset', 'timeout', 'pool', 'too many connections'];
    return patterns.some((p) => message.includes(p));
  }
  return false;
}

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const readDb = getReadPrisma();
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (range) {
      case '7d':
        startDate = subDays(now, 7);
        break;
      case '90d':
        startDate = subDays(now, 90);
        break;
      case 'ytd':
        startDate = startOfYear(now);
        break;
      default: // 30d
        startDate = subDays(now, 30);
    }

    // Clinic context is already set by withAdminAuth via runWithClinicContext
    // Get paid invoices for the period (primary source of revenue)
    const [paidInvoices, allTimePaidInvoices, previousPeriodInvoices] = await Promise.all([
      // Current period paid invoices
      readDb.invoice.aggregate({
        where: {
          clinicId,
          status: 'PAID',
          paidAt: { gte: startDate, lte: now },
        },
        _sum: { amountPaid: true },
        _count: true,
      }),
      // All-time paid invoices for total revenue
      readDb.invoice.aggregate({
        where: {
          clinicId,
          status: 'PAID',
        },
        _sum: { amountPaid: true },
        _count: true,
      }),
      // Previous period for growth calculation
      readDb.invoice.aggregate({
        where: {
          clinicId,
          status: 'PAID',
          paidAt: {
            gte: subDays(startDate, range === '7d' ? 7 : range === '90d' ? 90 : 30),
            lt: startDate,
          },
        },
        _sum: { amountPaid: true },
      }),
    ]);

    // Calculate revenue metrics from invoices
    const grossRevenue = paidInvoices._sum.amountPaid || 0;
    const previousGross = previousPeriodInvoices._sum.amountPaid || 0;
    const periodGrowth =
      previousGross > 0
        ? Math.round(((grossRevenue - previousGross) / previousGross) * 10000) / 100
        : grossRevenue > 0
          ? 100
          : 0;

    // Estimate fees (~2.9% for Stripe)
    const estimatedFees = Math.round(grossRevenue * 0.029);
    const netRevenue = grossRevenue - estimatedFees;

    // Average order value from paid invoices count
    const invoiceCount = paidInvoices._count || 0;
    const averageOrderValue = invoiceCount > 0 ? Math.round(grossRevenue / invoiceCount) : 0;

    // Get MRR from active subscriptions
    const activeSubscriptions = await readDb.subscription.findMany({
      where: {
        clinicId,
        status: 'ACTIVE',
      },
      select: {
        amount: true,
        interval: true,
      },
      take: AGGREGATION_TAKE,
    });

    // Calculate MRR (normalize to monthly)
    let mrr = 0;
    for (const sub of activeSubscriptions) {
      const amount = sub.amount || 0;
      switch (sub.interval?.toLowerCase()) {
        case 'year':
        case 'yearly':
        case 'annual':
          mrr += amount / 12;
          break;
        case 'quarter':
        case 'quarterly':
          mrr += amount / 3;
          break;
        case 'week':
        case 'weekly':
          mrr += amount * 4;
          break;
        default:
          mrr += amount;
      }
    }
    const arr = mrr * 12;

    // Get outstanding invoices
    const outstandingInvoices = await readDb.invoice.findMany({
      where: {
        clinicId,
        status: { in: ['OPEN', 'DRAFT'] },
      },
      select: {
        amount: true,
      },
      take: AGGREGATION_TAKE,
    });

    const outstandingAmount = outstandingInvoices.reduce(
      (sum: number, inv: { amount: number | null }) => sum + (inv.amount || 0),
      0
    );

    // Calculate churn rate (subscriptions canceled this month / active at start of month)
    const monthStart = startOfMonth(now);
    const canceledThisMonth = await readDb.subscription.count({
      where: {
        clinicId,
        status: 'CANCELED',
        canceledAt: { gte: monthStart },
      },
    });

    const totalActiveAtMonthStart = activeSubscriptions.length + canceledThisMonth;
    const churnRate =
      totalActiveAtMonthStart > 0
        ? Math.round((canceledThisMonth / totalActiveAtMonthStart) * 10000) / 100
        : 0;

    await auditPhiAccess(request, buildAuditPhiOptions(request, user, 'financial:view', { route: 'GET /api/finance/metrics' }));

    return NextResponse.json({
      grossRevenue,
      netRevenue,
      mrr,
      arr,
      activeSubscriptions: activeSubscriptions.length,
      churnRate,
      averageOrderValue,
      outstandingInvoices: outstandingInvoices.length,
      outstandingAmount,
      pendingPayouts: 0,
      disputeRate: 0,
      periodGrowth,
      mrrGrowth: 0,
    });
  } catch (error) {
    // Return 503 for transient DB connection issues so clients can retry
    if (isDatabaseConnectionError(error)) {
      logger.error('Database connection error in finance metrics', {
        error: error instanceof Error ? error.message : String(error),
        errorType: 'DATABASE_CONNECTION',
      });
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable. Please try again.',
          code: 'SERVICE_UNAVAILABLE',
          retryAfter: 5,
        },
        { status: 503, headers: { 'Retry-After': '5' } }
      );
    }

    logger.error('Failed to fetch finance metrics', { error });
    return NextResponse.json({ error: 'Failed to fetch finance metrics' }, { status: 500 });
  }
}

export const GET = withAdminAuth(handleGet);
