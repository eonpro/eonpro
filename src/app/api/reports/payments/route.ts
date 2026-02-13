/**
 * PAYMENT REPORTS API
 * ===================
 * Detailed payment and transaction reporting
 *
 * GET /api/reports/payments - Payment metrics
 * GET /api/reports/payments?type=yesterday - Yesterday's payments
 * GET /api/reports/payments?type=recent - Recent payments
 * GET /api/reports/payments?type=failed - Failed payments
 * GET /api/reports/payments?type=by-method - Payments by method
 * GET /api/reports/payments?type=by-patient - Payments grouped by patient
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import {
  ReportingService,
  DateRange,
  DateRangeParams,
  calculateDateRange,
} from '@/services/reporting/ReportingService';
import { prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

async function getPaymentReportsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    requirePermission(toPermissionContext(user), 'report:run');
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'metrics';
    const rangeParam = (url.searchParams.get('range') || 'this_month') as DateRange;
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const dateRangeParams: DateRangeParams = { range: rangeParam };
    if (rangeParam === 'custom' && startDateParam && endDateParam) {
      dateRangeParams.startDate = new Date(startDateParam);
      dateRangeParams.endDate = new Date(endDateParam);
    }

    const { start, end, label } = calculateDateRange(dateRangeParams);
    const reportingService = new ReportingService(user.clinicId);
    const clinicFilter = user.clinicId ? { clinicId: user.clinicId } : {};

    switch (type) {
      case 'metrics':
        const metrics = await reportingService.getPaymentMetrics(dateRangeParams);
        return NextResponse.json({
          metrics,
          formatted: {
            averagePayment: formatCurrency(metrics.averagePaymentAmount),
          },
          dateRange: { start, end, label },
        });

      case 'yesterday':
        const yesterdayPayments = await reportingService.getYesterdayPayments();

        const yesterdayDetails = yesterdayPayments.map((p: (typeof yesterdayPayments)[number]) => ({
          id: p.id,
          patient: {
            id: p.patient.id,
            name: `${p.patient.firstName} ${p.patient.lastName}`,
            email: p.patient.email,
            phone: p.patient.phone,
          },
          amount: p.amount,
          formattedAmount: formatCurrency(p.amount),
          treatment: p.patient.orders[0]?.primaryMedName || 'Unknown',
          treatmentStrength: p.patient.orders[0]?.primaryMedStrength || '',
          subscription: p.patient.subscriptions[0]
            ? {
                plan: p.patient.subscriptions[0].planName,
                monthlyAmount: formatCurrency(p.patient.subscriptions[0].amount),
                startDate: p.patient.subscriptions[0].startDate,
              }
            : null,
          paidAt: p.createdAt,
        }));

        const yesterdayTotal = yesterdayPayments.reduce(
          (sum: number, p: { amount: number }) => sum + p.amount,
          0
        );

        return NextResponse.json({
          payments: yesterdayDetails,
          count: yesterdayDetails.length,
          total: formatCurrency(yesterdayTotal),
          date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });

      case 'recent':
        const recentPayments = await prisma.payment.findMany({
          where: {
            ...clinicFilter,
            status: 'SUCCEEDED',
            createdAt: { gte: start, lte: end },
          },
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            subscription: {
              select: {
                planName: true,
                startDate: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        const recentDetails = recentPayments.map(
          (p: {
            id: number;
            patient: { id: number; firstName: string; lastName: string; email: string };
            amount: number;
            subscriptionId: number | null;
            subscription: { planName: string; startDate: Date } | null;
            paymentMethod: string | null;
            createdAt: Date;
          }) => ({
            id: p.id,
            patient: {
              id: p.patient.id,
              name: `${p.patient.firstName} ${p.patient.lastName}`,
              email: p.patient.email,
            },
            amount: p.amount,
            formattedAmount: formatCurrency(p.amount),
            isRecurring: !!p.subscriptionId,
            subscription: p.subscription
              ? {
                  plan: p.subscription.planName,
                  startDate: p.subscription.startDate,
                }
              : null,
            paymentMethod: p.paymentMethod,
            paidAt: p.createdAt,
          })
        );

        return NextResponse.json({
          payments: recentDetails,
          count: recentDetails.length,
          total: formatCurrency(
            recentPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
          ),
          dateRange: { start, end, label },
        });

      case 'failed':
        const failedPayments = await prisma.payment.findMany({
          where: {
            ...clinicFilter,
            status: 'FAILED',
            createdAt: { gte: start, lte: end },
          },
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            subscription: {
              select: {
                planName: true,
                failedAttempts: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10000,
        });

        const failedDetails = failedPayments.map(
          (p: {
            id: number;
            patient: {
              id: number;
              firstName: string;
              lastName: string;
              email: string;
              phone: string;
            };
            amount: number;
            failureReason: string | null;
            subscription: { planName: string; failedAttempts: number } | null;
            createdAt: Date;
          }) => ({
            id: p.id,
            patient: {
              id: p.patient.id,
              name: `${p.patient.firstName} ${p.patient.lastName}`,
              email: p.patient.email,
              phone: p.patient.phone,
            },
            amount: p.amount,
            formattedAmount: formatCurrency(p.amount),
            failureReason: p.failureReason || 'Unknown',
            subscription: p.subscription
              ? {
                  plan: p.subscription.planName,
                  failedAttempts: p.subscription.failedAttempts,
                }
              : null,
            attemptedAt: p.createdAt,
          })
        );

        const lostRevenue = failedPayments.reduce(
          (sum: number, p: { amount: number }) => sum + p.amount,
          0
        );

        return NextResponse.json({
          payments: failedDetails,
          count: failedDetails.length,
          lostRevenue: formatCurrency(lostRevenue),
          dateRange: { start, end, label },
        });

      case 'by-method':
        const paymentsByMethod = await prisma.payment.groupBy({
          by: ['paymentMethod'],
          where: {
            ...clinicFilter,
            status: 'SUCCEEDED',
            createdAt: { gte: start, lte: end },
          },
          _count: true,
          _sum: { amount: true },
        });

        const totalByMethod = paymentsByMethod.reduce(
          (sum: number, p: { _sum: { amount: number | null } }) => sum + (p._sum.amount || 0),
          0
        );

        const methodBreakdown = paymentsByMethod
          .map(
            (p: {
              paymentMethod: string | null;
              _count: number;
              _sum: { amount: number | null };
            }) => ({
              method: p.paymentMethod || 'Unknown',
              count: p._count,
              total: p._sum.amount || 0,
              formattedTotal: formatCurrency(p._sum.amount || 0),
              percentage:
                totalByMethod > 0 ? Math.round(((p._sum.amount || 0) / totalByMethod) * 100) : 0,
            })
          )
          .sort((a: { total: number }, b: { total: number }) => b.total - a.total);

        return NextResponse.json({
          byMethod: methodBreakdown,
          total: formatCurrency(totalByMethod),
          dateRange: { start, end, label },
        });

      case 'by-patient':
        const patientPayments = await prisma.payment.findMany({
          where: {
            ...clinicFilter,
            status: 'SUCCEEDED',
            createdAt: { gte: start, lte: end },
          },
          orderBy: { createdAt: 'desc' },
          take: 10000,
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });

        // Group by patient
        const patientMap = new Map<
          number,
          {
            patient: { id: number; name: string; email: string };
            payments: number;
            total: number;
            lastPayment: Date;
          }
        >();

        patientPayments.forEach(
          (p: {
            patient: { id: number; firstName: string; lastName: string; email: string };
            amount: number;
            createdAt: Date;
          }) => {
            const existing = patientMap.get(p.patient.id);
            if (existing) {
              existing.payments++;
              existing.total += p.amount;
              if (p.createdAt > existing.lastPayment) {
                existing.lastPayment = p.createdAt;
              }
            } else {
              patientMap.set(p.patient.id, {
                patient: {
                  id: p.patient.id,
                  name: `${p.patient.firstName} ${p.patient.lastName}`,
                  email: p.patient.email,
                },
                payments: 1,
                total: p.amount,
                lastPayment: p.createdAt,
              });
            }
          }
        );

        const byPatient = Array.from(patientMap.values())
          .map((p: { total: number; payments: number; [key: string]: unknown }) => ({
            ...p,
            formattedTotal: formatCurrency(p.total),
            averagePayment: formatCurrency(Math.round(p.total / p.payments)),
          }))
          .sort((a, b) => b.total - a.total);

        return NextResponse.json({
          byPatient,
          uniquePatients: byPatient.length,
          totalRevenue: formatCurrency(
            patientPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
          ),
          dateRange: { start, end, label },
        });

      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Failed to generate payment report', error as Error);
    return NextResponse.json({ error: 'Failed to generate payment report' }, { status: 500 });
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export const GET = standardRateLimit(withClinicalAuth(getPaymentReportsHandler));
