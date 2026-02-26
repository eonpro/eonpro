/**
 * SALES TRANSACTIONS REPORT API
 * ==============================
 * Every individual payment transaction with patient name, treatment,
 * amount, date, status — filterable by date range and status.
 *
 * GET /api/reports/sales-transactions
 *   ?range=today|yesterday|this_week|last_week|this_month|last_month|
 *          this_quarter|last_quarter|this_year|last_year|custom
 *   &startDate=YYYY-MM-DD  (required when range=custom)
 *   &endDate=YYYY-MM-DD    (required when range=custom)
 *   &status=all|succeeded|failed|refunded|pending  (default: all)
 *   &page=1&limit=200
 *
 * Summary numbers are computed with status-isolated aggregates so
 * "Gross Sales" only counts SUCCEEDED, "Failed" only counts FAILED, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import {
  DateRange,
  DateRangeParams,
  calculateDateRange,
} from '@/services/reporting/ReportingService';
import { prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_FILTER_MAP: Record<string, Prisma.PaymentWhereInput> = {
  all: {},
  succeeded: { status: 'SUCCEEDED' },
  failed: { status: 'FAILED' },
  refunded: { status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } },
  pending: { status: { in: ['PENDING', 'PROCESSING'] } },
  canceled: { status: 'CANCELED' },
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    requirePermission(toPermissionContext(user), 'report:run');

    const url = new URL(req.url);
    const rangeParam = (url.searchParams.get('range') || 'today') as DateRange;
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const statusFilter = url.searchParams.get('status') || 'all';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '200')));

    const dateRangeParams: DateRangeParams = { range: rangeParam };
    if (rangeParam === 'custom' && startDateParam && endDateParam) {
      dateRangeParams.startDate = new Date(startDateParam);
      dateRangeParams.endDate = new Date(endDateParam);
    }

    const { start, end, label } = calculateDateRange(dateRangeParams);
    const clinicFilter = user.clinicId ? { clinicId: user.clinicId } : {};
    const statusWhere = STATUS_FILTER_MAP[statusFilter] || {};

    const where: Prisma.PaymentWhereInput = {
      ...clinicFilter,
      ...statusWhere,
      createdAt: { gte: start, lte: end },
    };

    const dateWhere = { ...clinicFilter, createdAt: { gte: start, lte: end } };

    // Run all queries in parallel for speed
    const [
      transactions,
      totalCount,
      succeededAgg,
      failedAgg,
      refundedAgg,
      pendingAgg,
      canceledAgg,
      allRefundedAmountAgg,
    ] = await Promise.all([
      // 1. Transaction rows (paginated)
      prisma.payment.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              patientId: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              orders: {
                select: {
                  primaryMedName: true,
                  primaryMedStrength: true,
                  primaryMedForm: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          invoice: {
            select: {
              id: true,
              stripeInvoiceNumber: true,
              status: true,
              amount: true,
              amountPaid: true,
              items: {
                select: {
                  description: true,
                  amount: true,
                  quantity: true,
                  unitPrice: true,
                },
              },
            },
          },
          subscription: {
            select: {
              id: true,
              planName: true,
              interval: true,
              intervalCount: true,
              amount: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),

      // 2. Total count for pagination (respects status filter)
      prisma.payment.count({ where }),

      // 3-7. Per-status aggregates (always computed against full date range, ignoring status filter)
      prisma.payment.aggregate({
        where: { ...dateWhere, status: 'SUCCEEDED' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { ...dateWhere, status: 'FAILED' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { ...dateWhere, status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { ...dateWhere, status: { in: ['PENDING', 'PROCESSING'] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { ...dateWhere, status: 'CANCELED' },
        _sum: { amount: true },
        _count: true,
      }),

      // 8. Total refunded dollars (from refundedAmount field on SUCCEEDED payments that were partially refunded)
      prisma.payment.aggregate({
        where: {
          ...dateWhere,
          refundedAmount: { gt: 0 },
        },
        _sum: { refundedAmount: true },
        _count: true,
      }),
    ]);

    // Build detailed row data
    const rows = transactions.map((t) => {
      const latestOrder = t.patient?.orders?.[0] ?? null;
      const treatment = latestOrder
        ? [latestOrder.primaryMedName, latestOrder.primaryMedStrength, latestOrder.primaryMedForm]
            .filter(Boolean)
            .join(' ')
        : null;

      const invoiceLineItems = t.invoice?.items ?? [];

      return {
        id: t.id,
        createdAt: t.createdAt,
        paidAt: t.paidAt,
        patient: {
          id: t.patient?.id ?? null,
          patientId: t.patient?.patientId ?? null,
          name: t.patient
            ? `${t.patient.firstName} ${t.patient.lastName}`.trim()
            : 'Unknown',
          email: t.patient?.email ?? null,
          phone: t.patient?.phone ?? null,
        },
        amount: t.amount,
        formattedAmount: formatCurrency(t.amount),
        currency: t.currency,
        status: t.status,
        paymentMethod: t.paymentMethod || 'N/A',
        failureReason: t.failureReason || null,
        description: t.description || null,
        isRecurring: !!t.subscriptionId,
        treatment,
        subscription: t.subscription
          ? {
              id: t.subscription.id,
              planName: t.subscription.planName,
              interval: t.subscription.interval,
              intervalCount: t.subscription.intervalCount,
              amount: t.subscription.amount,
              formattedAmount: formatCurrency(t.subscription.amount),
              status: t.subscription.status,
            }
          : null,
        invoice: t.invoice
          ? {
              id: t.invoice.id,
              number: t.invoice.stripeInvoiceNumber,
              status: t.invoice.status,
              total: t.invoice.amount,
              formattedTotal: t.invoice.amount != null ? formatCurrency(t.invoice.amount) : null,
              amountPaid: t.invoice.amountPaid,
              lineItems: invoiceLineItems.map((li) => ({
                description: li.description,
                quantity: li.quantity,
                unitPrice: li.unitPrice,
                amount: li.amount,
                formattedAmount: formatCurrency(li.amount),
              })),
              lineItemsSummary: invoiceLineItems.map((li) => li.description).join(', '),
            }
          : null,
        refundedAmount: t.refundedAmount ?? 0,
        formattedRefundedAmount: t.refundedAmount ? formatCurrency(t.refundedAmount) : null,
        refundedAt: t.refundedAt,
        stripePaymentIntentId: t.stripePaymentIntentId,
        stripeChargeId: t.stripeChargeId,
      };
    });

    // Accurate summary numbers
    const grossSales = succeededAgg._sum.amount || 0;
    const totalRefundedDollars = allRefundedAmountAgg._sum.refundedAmount || 0;
    const netSales = grossSales - totalRefundedDollars;
    const allCount =
      succeededAgg._count + failedAgg._count + refundedAgg._count + pendingAgg._count + canceledAgg._count;
    const avgTransaction = succeededAgg._count > 0 ? Math.round(grossSales / succeededAgg._count) : 0;

    return NextResponse.json({
      transactions: rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalTransactions: allCount,

        grossSales,
        formattedGrossSales: formatCurrency(grossSales),

        totalRefunded: totalRefundedDollars,
        formattedTotalRefunded: formatCurrency(totalRefundedDollars),
        refundedTransactions: allRefundedAmountAgg._count,

        netSales,
        formattedNetSales: formatCurrency(netSales),

        averageTransaction: avgTransaction,
        formattedAverage: formatCurrency(avgTransaction),

        byStatus: {
          succeeded: { count: succeededAgg._count, amount: succeededAgg._sum.amount || 0, formatted: formatCurrency(succeededAgg._sum.amount || 0) },
          failed: { count: failedAgg._count, amount: failedAgg._sum.amount || 0, formatted: formatCurrency(failedAgg._sum.amount || 0) },
          refunded: { count: refundedAgg._count, amount: refundedAgg._sum.amount || 0, formatted: formatCurrency(refundedAgg._sum.amount || 0) },
          pending: { count: pendingAgg._count, amount: pendingAgg._sum.amount || 0, formatted: formatCurrency(pendingAgg._sum.amount || 0) },
          canceled: { count: canceledAgg._count, amount: canceledAgg._sum.amount || 0, formatted: formatCurrency(canceledAgg._sum.amount || 0) },
        },

        successRate:
          allCount > 0
            ? Math.round((succeededAgg._count / allCount) * 10000) / 100
            : 0,
      },
      dateRange: { start, end, label, range: rangeParam },
    });
  } catch (error) {
    logger.error('Failed to generate sales transactions report', error as Error);
    return NextResponse.json(
      { error: 'Failed to generate sales transactions report' },
      { status: 500 }
    );
  }
}

export const GET = standardRateLimit(withClinicalAuth(handler));
