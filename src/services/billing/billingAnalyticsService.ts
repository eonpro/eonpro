/**
 * BILLING ANALYTICS SERVICE
 * =========================
 * Provides financial analytics, AR aging, revenue trends,
 * collection metrics, and clinic-level reporting for the
 * super-admin billing dashboard.
 *
 * @module services/billing/billingAnalyticsService
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface MonthlyRevenue {
  month: string; // YYYY-MM
  label: string; // "Jan 2026"
  prescriptionFees: number;
  transmissionFees: number;
  adminFees: number;
  total: number;
  invoiceCount: number;
}

export interface AgingBucket {
  label: string;
  range: string;
  amountCents: number;
  invoiceCount: number;
}

export interface FeeBreakdown {
  prescriptionFees: number;
  transmissionFees: number;
  adminFees: number;
  total: number;
  prescriptionCount: number;
  transmissionCount: number;
  adminCount: number;
}

export interface CollectionMetrics {
  totalInvoicedCents: number;
  totalPaidCents: number;
  totalOutstandingCents: number;
  totalOverdueCents: number;
  collectionRate: number; // 0-100
  avgDaysToPayment: number;
  paymentMethodBreakdown: { method: string; count: number; amountCents: number }[];
}

export interface ClinicRevenue {
  clinicId: number;
  clinicName: string;
  totalInvoicedCents: number;
  totalPaidCents: number;
  invoiceCount: number;
  outstandingCents: number;
  collectionRate: number;
}

export interface MonthComparison {
  current: { month: string; revenue: number; invoiceCount: number; paidCount: number };
  previous: { month: string; revenue: number; invoiceCount: number; paidCount: number };
  lastYear: { month: string; revenue: number; invoiceCount: number; paidCount: number };
}

export interface FullDashboard {
  overview: {
    totalRevenue: number;
    momChange: number;
    collectionRate: number;
    avgInvoiceValue: number;
    totalOutstanding: number;
    totalOverdue: number;
  };
  revenueTrend: MonthlyRevenue[];
  arAging: AgingBucket[];
  feeBreakdown: FeeBreakdown;
  collectionMetrics: CollectionMetrics;
  topClinics: ClinicRevenue[];
  monthComparison: MonthComparison;
}

// ============================================================================
// Service
// ============================================================================

export const billingAnalyticsService = {
  /**
   * Monthly revenue trend for the last N months.
   */
  async getRevenueTrend(months = 12): Promise<MonthlyRevenue[]> {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where: {
        createdAt: { gte: startDate },
        status: { notIn: ['CANCELLED'] },
      },
      select: {
        createdAt: true,
        prescriptionFeeTotal: true,
        transmissionFeeTotal: true,
        adminFeeTotal: true,
        totalAmountCents: true,
      },
    });

    const buckets = new Map<string, MonthlyRevenue>();

    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      buckets.set(key, {
        month: key,
        label,
        prescriptionFees: 0,
        transmissionFees: 0,
        adminFees: 0,
        total: 0,
        invoiceCount: 0,
      });
    }

    for (const inv of invoices) {
      const d = new Date(inv.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.prescriptionFees += inv.prescriptionFeeTotal;
        bucket.transmissionFees += inv.transmissionFeeTotal;
        bucket.adminFees += inv.adminFeeTotal;
        bucket.total += inv.totalAmountCents;
        bucket.invoiceCount++;
      }
    }

    return Array.from(buckets.values());
  },

  /**
   * Accounts Receivable aging report.
   */
  async getARAgingReport(): Promise<AgingBucket[]> {
    const now = new Date();

    const outstanding = await prisma.clinicPlatformInvoice.findMany({
      where: {
        status: { in: ['PENDING', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
      },
      select: {
        totalAmountCents: true,
        paidAmountCents: true,
        dueDate: true,
      },
    });

    const buckets: AgingBucket[] = [
      { label: 'Current', range: 'Not yet due', amountCents: 0, invoiceCount: 0 },
      { label: '1-30', range: '1-30 days past due', amountCents: 0, invoiceCount: 0 },
      { label: '31-60', range: '31-60 days past due', amountCents: 0, invoiceCount: 0 },
      { label: '61-90', range: '61-90 days past due', amountCents: 0, invoiceCount: 0 },
      { label: '90+', range: 'Over 90 days past due', amountCents: 0, invoiceCount: 0 },
    ];

    for (const inv of outstanding) {
      const remaining = inv.totalAmountCents - (inv.paidAmountCents ?? 0);
      if (remaining <= 0) continue;

      const daysOverdue = Math.floor(
        (now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      let idx: number;
      if (daysOverdue <= 0) idx = 0;
      else if (daysOverdue <= 30) idx = 1;
      else if (daysOverdue <= 60) idx = 2;
      else if (daysOverdue <= 90) idx = 3;
      else idx = 4;

      buckets[idx].amountCents += remaining;
      buckets[idx].invoiceCount++;
    }

    return buckets;
  },

  /**
   * Fee type breakdown for a date range.
   */
  async getFeeTypeBreakdown(startDate: Date, endDate: Date): Promise<FeeBreakdown> {
    const agg = await prisma.platformFeeEvent.groupBy({
      by: ['feeType'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ['VOIDED', 'WAIVED'] },
      },
      _sum: { amountCents: true },
      _count: true,
    });

    const result: FeeBreakdown = {
      prescriptionFees: 0,
      transmissionFees: 0,
      adminFees: 0,
      total: 0,
      prescriptionCount: 0,
      transmissionCount: 0,
      adminCount: 0,
    };

    for (const row of agg) {
      const amt = row._sum.amountCents ?? 0;
      switch (row.feeType) {
        case 'PRESCRIPTION':
          result.prescriptionFees = amt;
          result.prescriptionCount = row._count;
          break;
        case 'TRANSMISSION':
          result.transmissionFees = amt;
          result.transmissionCount = row._count;
          break;
        case 'ADMIN':
          result.adminFees = amt;
          result.adminCount = row._count;
          break;
      }
    }

    result.total = result.prescriptionFees + result.transmissionFees + result.adminFees;
    return result;
  },

  /**
   * Collection efficiency metrics.
   */
  async getCollectionMetrics(startDate: Date, endDate: Date): Promise<CollectionMetrics> {
    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ['CANCELLED'] },
      },
      select: {
        totalAmountCents: true,
        paidAmountCents: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
        paidAt: true,
      },
    });

    let totalInvoicedCents = 0;
    let totalPaidCents = 0;
    let totalOverdueCents = 0;
    let daysToPaymentSum = 0;
    let paidInvoiceCount = 0;
    const methodMap = new Map<string, { count: number; amountCents: number }>();

    for (const inv of invoices) {
      totalInvoicedCents += inv.totalAmountCents;

      if (inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') {
        const paid = inv.paidAmountCents ?? inv.totalAmountCents;
        totalPaidCents += paid;

        if (inv.paidAt) {
          const days = Math.floor(
            (new Date(inv.paidAt).getTime() - new Date(inv.createdAt).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          daysToPaymentSum += days;
          paidInvoiceCount++;
        }

        const method = inv.paymentMethod || 'unknown';
        const existing = methodMap.get(method) || { count: 0, amountCents: 0 };
        existing.count++;
        existing.amountCents += paid;
        methodMap.set(method, existing);
      }

      if (inv.status === 'OVERDUE') {
        totalOverdueCents += inv.totalAmountCents - (inv.paidAmountCents ?? 0);
      }
    }

    const totalOutstandingCents = totalInvoicedCents - totalPaidCents;
    const collectionRate = totalInvoicedCents > 0
      ? Math.round((totalPaidCents / totalInvoicedCents) * 10000) / 100
      : 0;
    const avgDaysToPayment = paidInvoiceCount > 0
      ? Math.round(daysToPaymentSum / paidInvoiceCount)
      : 0;

    return {
      totalInvoicedCents,
      totalPaidCents,
      totalOutstandingCents,
      totalOverdueCents,
      collectionRate,
      avgDaysToPayment,
      paymentMethodBreakdown: Array.from(methodMap.entries()).map(([method, data]) => ({
        method,
        ...data,
      })),
    };
  },

  /**
   * Top clinics ranked by total invoiced revenue.
   */
  async getTopClinicsByRevenue(
    limit = 10,
    startDate?: Date,
    endDate?: Date
  ): Promise<ClinicRevenue[]> {
    const where: Record<string, unknown> = {
      status: { notIn: ['CANCELLED'] },
    };
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where,
      select: {
        clinicId: true,
        totalAmountCents: true,
        paidAmountCents: true,
        status: true,
        clinic: { select: { id: true, name: true } },
      },
    });

    const clinicMap = new Map<number, ClinicRevenue>();

    for (const inv of invoices) {
      const existing = clinicMap.get(inv.clinicId) || {
        clinicId: inv.clinicId,
        clinicName: inv.clinic.name,
        totalInvoicedCents: 0,
        totalPaidCents: 0,
        invoiceCount: 0,
        outstandingCents: 0,
        collectionRate: 0,
      };

      existing.totalInvoicedCents += inv.totalAmountCents;
      existing.invoiceCount++;

      if (inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') {
        existing.totalPaidCents += inv.paidAmountCents ?? inv.totalAmountCents;
      }

      clinicMap.set(inv.clinicId, existing);
    }

    const clinics = Array.from(clinicMap.values()).map((c) => ({
      ...c,
      outstandingCents: c.totalInvoicedCents - c.totalPaidCents,
      collectionRate:
        c.totalInvoicedCents > 0
          ? Math.round((c.totalPaidCents / c.totalInvoicedCents) * 10000) / 100
          : 0,
    }));

    clinics.sort((a, b) => b.totalInvoicedCents - a.totalInvoicedCents);
    return clinics.slice(0, limit);
  },

  /**
   * Month-over-month comparison: current vs previous vs same month last year.
   */
  async getMonthlyComparison(): Promise<MonthComparison> {
    const now = new Date();

    const fetchMonth = async (year: number, month: number) => {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const label = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const invoices = await prisma.clinicPlatformInvoice.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          status: { notIn: ['CANCELLED'] },
        },
        select: { totalAmountCents: true, status: true },
      });

      return {
        month: label,
        revenue: invoices.reduce((s, i) => s + i.totalAmountCents, 0),
        invoiceCount: invoices.length,
        paidCount: invoices.filter((i) => i.status === 'PAID').length,
      };
    };

    const [current, previous, lastYear] = await Promise.all([
      fetchMonth(now.getFullYear(), now.getMonth()),
      fetchMonth(
        now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
        now.getMonth() === 0 ? 11 : now.getMonth() - 1
      ),
      fetchMonth(now.getFullYear() - 1, now.getMonth()),
    ]);

    return { current, previous, lastYear };
  },

  /**
   * Full dashboard aggregation — single call from the analytics API.
   */
  async getDashboardSummary(): Promise<FullDashboard> {
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const [revenueTrend, arAging, feeBreakdown, collectionMetrics, topClinics, monthComparison] =
      await Promise.all([
        this.getRevenueTrend(12),
        this.getARAgingReport(),
        this.getFeeTypeBreakdown(yearAgo, now),
        this.getCollectionMetrics(yearAgo, now),
        this.getTopClinicsByRevenue(10),
        this.getMonthlyComparison(),
      ]);

    const totalRevenue = collectionMetrics.totalInvoicedCents;
    const momChange =
      monthComparison.previous.revenue > 0
        ? Math.round(
            ((monthComparison.current.revenue - monthComparison.previous.revenue) /
              monthComparison.previous.revenue) *
              10000
          ) / 100
        : 0;
    const invoiceCount = revenueTrend.reduce((s, m) => s + m.invoiceCount, 0);
    const avgInvoiceValue = invoiceCount > 0 ? Math.round(totalRevenue / invoiceCount) : 0;

    return {
      overview: {
        totalRevenue,
        momChange,
        collectionRate: collectionMetrics.collectionRate,
        avgInvoiceValue,
        totalOutstanding: collectionMetrics.totalOutstandingCents,
        totalOverdue: collectionMetrics.totalOverdueCents,
      },
      revenueTrend,
      arAging,
      feeBreakdown,
      collectionMetrics,
      topClinics,
      monthComparison,
    };
  },
};

export type BillingAnalyticsService = typeof billingAnalyticsService;
