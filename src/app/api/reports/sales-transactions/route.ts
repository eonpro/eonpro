/**
 * SALES TRANSACTIONS REPORT API
 * ==============================
 * Every individual payment transaction with patient name, amount, date,
 * status, subscription/treatment info — filterable by date range.
 *
 * GET /api/reports/sales-transactions
 *   ?range=today|yesterday|this_week|last_week|this_month|last_month|this_quarter|last_quarter|this_year|last_year|custom
 *   &startDate=YYYY-MM-DD  (required when range=custom)
 *   &endDate=YYYY-MM-DD    (required when range=custom)
 *   &status=all|succeeded|failed|refunded  (default: all)
 *   &page=1&limit=200
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

const STATUS_FILTER_MAP: Record<string, Prisma.PaymentWhereInput> = {
  all: {},
  succeeded: { status: 'SUCCEEDED' },
  failed: { status: 'FAILED' },
  refunded: { status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } },
  pending: { status: { in: ['PENDING', 'PROCESSING'] } },
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

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

    const [transactions, totalCount, aggregates] = await Promise.all([
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
            },
          },
          invoice: {
            select: {
              id: true,
              stripeInvoiceNumber: true,
              items: {
                select: { description: true, amount: true, quantity: true },
                take: 5,
              },
            },
          },
          subscription: {
            select: {
              id: true,
              planName: true,
              interval: true,
              amount: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),

      prisma.payment.count({ where }),

      prisma.payment.aggregate({
        where,
        _sum: { amount: true, refundedAmount: true },
        _count: true,
        _avg: { amount: true },
      }),
    ]);

    const succeededWhere: Prisma.PaymentWhereInput = {
      ...clinicFilter,
      status: 'SUCCEEDED',
      createdAt: { gte: start, lte: end },
    };
    const succeededAgg = await prisma.payment.aggregate({
      where: succeededWhere,
      _sum: { amount: true },
      _count: true,
    });

    const rows = transactions.map((t) => ({
      id: t.id,
      date: t.createdAt,
      patient: {
        id: t.patient?.id ?? null,
        patientId: t.patient?.patientId ?? null,
        name: t.patient
          ? `${t.patient.firstName} ${t.patient.lastName}`.trim()
          : 'Unknown',
        email: t.patient?.email ?? null,
      },
      amount: t.amount,
      formattedAmount: formatCurrency(t.amount),
      status: t.status,
      paymentMethod: t.paymentMethod || 'N/A',
      isRecurring: !!t.subscriptionId,
      subscription: t.subscription
        ? {
            planName: t.subscription.planName,
            interval: t.subscription.interval,
            amount: formatCurrency(t.subscription.amount),
          }
        : null,
      invoice: t.invoice
        ? {
            id: t.invoice.id,
            number: t.invoice.stripeInvoiceNumber,
            items: t.invoice.items.map((i) => i.description).join(', '),
          }
        : null,
      refundedAmount: t.refundedAmount ? formatCurrency(t.refundedAmount) : null,
      stripePaymentIntentId: t.stripePaymentIntentId,
    }));

    return NextResponse.json({
      transactions: rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalTransactions: aggregates._count,
        grossAmount: aggregates._sum.amount || 0,
        formattedGross: formatCurrency(aggregates._sum.amount || 0),
        refundedAmount: aggregates._sum.refundedAmount || 0,
        formattedRefunded: formatCurrency(aggregates._sum.refundedAmount || 0),
        netAmount: (aggregates._sum.amount || 0) - (aggregates._sum.refundedAmount || 0),
        formattedNet: formatCurrency(
          (aggregates._sum.amount || 0) - (aggregates._sum.refundedAmount || 0)
        ),
        averageTransaction: Math.round(aggregates._avg.amount || 0),
        formattedAverage: formatCurrency(Math.round(aggregates._avg.amount || 0)),
        succeededCount: succeededAgg._count,
        succeededAmount: formatCurrency(succeededAgg._sum.amount || 0),
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
