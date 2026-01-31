/**
 * Finance Metrics API
 * 
 * GET /api/finance/metrics
 * Returns aggregated financial KPIs for the dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { 
  startOfYear, 
  subDays,
  startOfMonth,
} from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicId = getClinicContext();
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

    return withClinicContext(clinicId, async () => {
      // Get paid invoices for the period (primary source of revenue)
      const [paidInvoices, allTimePaidInvoices, previousPeriodInvoices] = await Promise.all([
        // Current period paid invoices
        prisma.invoice.aggregate({
          where: {
            clinicId,
            status: 'PAID',
            paidAt: { gte: startDate, lte: now },
          },
          _sum: { amountPaid: true },
          _count: true,
        }),
        // All-time paid invoices for total revenue
        prisma.invoice.aggregate({
          where: {
            clinicId,
            status: 'PAID',
          },
          _sum: { amountPaid: true },
          _count: true,
        }),
        // Previous period for growth calculation
        prisma.invoice.aggregate({
          where: {
            clinicId,
            status: 'PAID',
            paidAt: { 
              gte: subDays(startDate, range === '7d' ? 7 : range === '90d' ? 90 : 30), 
              lt: startDate 
            },
          },
          _sum: { amountPaid: true },
        }),
      ]);

      // Calculate revenue metrics from invoices
      const grossRevenue = paidInvoices._sum.amountPaid || 0;
      const previousGross = previousPeriodInvoices._sum.amountPaid || 0;
      const periodGrowth = previousGross > 0 
        ? Math.round(((grossRevenue - previousGross) / previousGross) * 10000) / 100
        : grossRevenue > 0 ? 100 : 0;
      
      // Estimate fees (~2.9% for Stripe)
      const estimatedFees = Math.round(grossRevenue * 0.029);
      const netRevenue = grossRevenue - estimatedFees;
      
      // Average order value from paid invoices count
      const invoiceCount = paidInvoices._count || 0;
      const averageOrderValue = invoiceCount > 0 ? Math.round(grossRevenue / invoiceCount) : 0;

      // Get MRR from active subscriptions
      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
        },
        select: {
          amount: true,
          interval: true,
        },
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
      const outstandingInvoices = await prisma.invoice.findMany({
        where: {
          clinicId,
          status: { in: ['OPEN', 'DRAFT'] },
        },
        select: {
          amount: true,
        },
      });

      const outstandingAmount = outstandingInvoices.reduce(
        (sum: number, inv: { amount: number | null }) => sum + (inv.amount || 0), 
        0
      );

      // Calculate churn rate (subscriptions canceled this month / active at start of month)
      const monthStart = startOfMonth(now);
      const canceledThisMonth = await prisma.subscription.count({
        where: {
          clinicId,
          status: 'CANCELED',
          canceledAt: { gte: monthStart },
        },
      });
      
      const totalActiveAtMonthStart = activeSubscriptions.length + canceledThisMonth;
      const churnRate = totalActiveAtMonthStart > 0 
        ? Math.round((canceledThisMonth / totalActiveAtMonthStart) * 10000) / 100
        : 0;

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
    });
  } catch (error) {
    logger.error('Failed to fetch finance metrics', { error });
    return NextResponse.json(
      { error: 'Failed to fetch finance metrics' },
      { status: 500 }
    );
  }
}
