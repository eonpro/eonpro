/**
 * Subscription Renewals API
 *
 * GET /api/subscriptions/renewals
 * Returns active subscriptions grouped by interval with rebill dates and payment status.
 * Used by both Admin and Provider dashboards for centralized renewal tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { decryptPHI } from '@/lib/security/phi-encryption';

const querySchema = z.object({
  interval: z.enum(['all', 'monthly', 'quarterly', 'semiannual', 'annual']).default('all'),
  paymentStatus: z.enum(['all', 'succeeded', 'failed', 'pending']).default('all'),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  sortBy: z.enum(['nextBillingDate', 'amount', 'patientName', 'createdAt']).default('nextBillingDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

type IntervalCategory = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

/** Intervals that explicitly map to quarterly / semiannual / annual */
const QUARTERLY_INTERVALS = ['quarter', 'quarterly'];
const SEMIANNUAL_INTERVALS = ['semiannual'];
const ANNUAL_INTERVALS = ['year', 'annual'];

function classifyInterval(interval: string | null, intervalCount: number): IntervalCategory {
  const normalizedInterval = interval?.toLowerCase() || 'month';

  if (ANNUAL_INTERVALS.includes(normalizedInterval) || intervalCount === 12) {
    return 'annual';
  }
  if (SEMIANNUAL_INTERVALS.includes(normalizedInterval) || intervalCount === 6) {
    return 'semiannual';
  }
  if (QUARTERLY_INTERVALS.includes(normalizedInterval) || intervalCount === 3) {
    return 'quarterly';
  }
  // Everything else is "monthly" — including day-based billing (every 28 days),
  // week-based, or non-standard intervalCount values like 2, 4, 5, etc.
  return 'monthly';
}

function buildIntervalWhere(interval: string) {
  if (interval === 'all') return {};

  const quarterlyFilter = {
    OR: [
      { interval: { in: QUARTERLY_INTERVALS } },
      { intervalCount: 3 },
    ],
  };
  const semiannualFilter = {
    OR: [
      { interval: { in: SEMIANNUAL_INTERVALS } },
      { intervalCount: 6 },
    ],
  };
  const annualFilter = {
    OR: [
      { interval: { in: ANNUAL_INTERVALS } },
      { intervalCount: 12 },
    ],
  };

  switch (interval) {
    case 'monthly':
      // "Monthly" is the catch-all: anything NOT quarterly/semiannual/annual.
      // This covers: interval 'month'/'day'/'week'/null with any intervalCount,
      // plus non-standard intervalCount values (2, 4, 5, 7, 8, 28, etc.)
      return {
        NOT: {
          OR: [
            ...quarterlyFilter.OR,
            ...semiannualFilter.OR,
            ...annualFilter.OR,
          ],
        },
      };
    case 'quarterly':
      return quarterlyFilter;
    case 'semiannual':
      return semiannualFilter;
    case 'annual':
      return annualFilter;
    default:
      return {};
  }
}

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    if (user.role !== 'super_admin' && user.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const params = querySchema.parse(Object.fromEntries(searchParams));

    return await withClinicContext(clinicId, async () => {
      const baseWhere: any = {
        clinicId,
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        ...buildIntervalWhere(params.interval),
      };

      // Provider can only see their own patients' subscriptions
      if (user.role === 'provider' && user.providerId) {
        const providerPatientIds = await prisma.order.findMany({
          where: { clinicId, providerId: user.providerId },
          select: { patientId: true },
          distinct: ['patientId'],
        });
        baseWhere.patientId = { in: providerPatientIds.map((p) => p.patientId) };
      }

      if (params.search) {
        const searchLower = params.search.toLowerCase();
        baseWhere.OR = [
          { planName: { contains: params.search, mode: 'insensitive' } },
          { patient: { searchIndex: { contains: searchLower, mode: 'insensitive' } } },
        ];
      }

      const orderBy: any =
        params.sortBy === 'patientName'
          ? { patient: { lastName: params.sortOrder } }
          : { [params.sortBy]: params.sortOrder };

      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where: baseWhere,
          skip: (params.page - 1) * params.limit,
          take: params.limit,
          orderBy,
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                searchIndex: true,
              },
            },
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                status: true,
                amount: true,
                createdAt: true,
                failureReason: true,
              },
            },
            paymentMethod: {
              select: {
                cardLast4: true,
                cardBrand: true,
                expiryMonth: true,
                expiryYear: true,
                isActive: true,
              },
            },
            actions: {
              where: { actionType: { in: ['CANCELLED', 'PAUSED'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                actionType: true,
                reason: true,
                cancellationReason: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.subscription.count({ where: baseWhere }),
      ]);

      // Filter by payment status if needed (post-query since it depends on the latest payment)
      let filteredSubscriptions = subscriptions;
      if (params.paymentStatus !== 'all') {
        const statusMap: Record<string, string[]> = {
          succeeded: ['SUCCEEDED'],
          failed: ['FAILED'],
          pending: ['PENDING', 'PROCESSING'],
        };
        const validStatuses = statusMap[params.paymentStatus] || [];

        filteredSubscriptions = subscriptions.filter((sub) => {
          const lastPayment = sub.payments[0];
          if (!lastPayment) return params.paymentStatus === 'pending';
          return validStatuses.includes(lastPayment.status);
        });
      }

      const renewals = filteredSubscriptions.map((sub) => {
        const lastPayment = sub.payments[0] || null;
        const lastFailedPayment = sub.payments.find((p) => p.status === 'FAILED') || null;
        const intervalCategory = classifyInterval(sub.interval, sub.intervalCount);

        const firstName = decryptPHI(sub.patient?.firstName) || '';
        const lastName = decryptPHI(sub.patient?.lastName) || '';
        const email = decryptPHI(sub.patient?.email) || '';

        const pm = (sub as any).paymentMethod;
        const lastAction = (sub as any).actions?.[0] || null;

        const now = new Date();
        const isCardExpired =
          pm?.expiryYear != null &&
          pm?.expiryMonth != null &&
          (pm.expiryYear < now.getFullYear() ||
            (pm.expiryYear === now.getFullYear() && pm.expiryMonth < now.getMonth() + 1));

        let overdueReason: string | null = null;
        const isOverdue =
          sub.nextBillingDate && new Date(sub.nextBillingDate) < now;

        if (isOverdue || sub.status === 'PAST_DUE' || sub.failedAttempts > 0) {
          if (lastFailedPayment?.failureReason) {
            overdueReason = lastFailedPayment.failureReason;
          } else if (sub.failedAttempts > 0 && !lastFailedPayment) {
            overdueReason = 'Payment charge failed';
          } else if (isCardExpired) {
            overdueReason = `Card expired (${String(pm.expiryMonth).padStart(2, '0')}/${pm.expiryYear})`;
          } else if (!pm || !pm.isActive) {
            overdueReason = 'No active payment method';
          } else if (lastAction?.actionType === 'CANCELLED') {
            overdueReason = lastAction.cancellationReason || lastAction.reason || 'Subscription cancelled';
          } else if (lastAction?.actionType === 'PAUSED') {
            overdueReason = lastAction.reason || 'Subscription paused';
          } else if (!lastPayment) {
            overdueReason = 'Payment not attempted';
          } else if (lastPayment.status === 'SUCCEEDED') {
            overdueReason = 'Renewal payment not yet processed';
          }
        }

        return {
          id: sub.id,
          patientId: sub.patientId,
          patientName: sub.patient
            ? `${firstName} ${lastName}`.trim()
            : 'Unknown',
          patientEmail: email,
          planName: sub.planName || 'Unknown Plan',
          planDescription: sub.planDescription || '',
          amount: sub.amount,
          currency: sub.currency,
          interval: sub.interval,
          intervalCount: sub.intervalCount,
          intervalCategory,
          status: sub.status,
          startDate: sub.startDate,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          nextBillingDate: sub.nextBillingDate,
          failedAttempts: sub.failedAttempts,
          stripeSubscriptionId: sub.stripeSubscriptionId,
          overdueReason,
          cardInfo: pm
            ? {
                last4: pm.cardLast4,
                brand: pm.cardBrand,
                expired: isCardExpired,
              }
            : null,
          lastPayment: lastPayment
            ? {
                id: lastPayment.id,
                status: lastPayment.status,
                amount: lastPayment.amount,
                date: lastPayment.createdAt,
                failureReason: lastPayment.failureReason,
              }
            : null,
          lastFailedPayment: lastFailedPayment
            ? {
                status: lastFailedPayment.status,
                date: lastFailedPayment.createdAt,
                failureReason: lastFailedPayment.failureReason,
              }
            : null,
        };
      });

      // Summary counts by interval — totalActive is an independent count so subscriptions
      // with non-standard intervalCount values aren't silently excluded from the total.
      const allActiveWhere = { clinicId, status: { in: ['ACTIVE' as const, 'PAST_DUE' as const] } };
      const [totalActive, monthlyCount, quarterlyCount, semiannualCount, annualCount, pastDueCount, upcomingRenewals] =
        await Promise.all([
          prisma.subscription.count({ where: allActiveWhere }),
          prisma.subscription.count({
            where: { ...allActiveWhere, ...buildIntervalWhere('monthly') },
          }),
          prisma.subscription.count({
            where: { ...allActiveWhere, ...buildIntervalWhere('quarterly') },
          }),
          prisma.subscription.count({
            where: { ...allActiveWhere, ...buildIntervalWhere('semiannual') },
          }),
          prisma.subscription.count({
            where: { ...allActiveWhere, ...buildIntervalWhere('annual') },
          }),
          prisma.subscription.count({
            where: { clinicId, status: 'PAST_DUE' },
          }),
          prisma.subscription.count({
            where: {
              clinicId,
              status: 'ACTIVE',
              nextBillingDate: {
                gte: new Date(),
                lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              },
            },
          }),
        ]);

      return NextResponse.json({
        renewals,
        total: params.paymentStatus !== 'all' ? filteredSubscriptions.length : total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(
          (params.paymentStatus !== 'all' ? filteredSubscriptions.length : total) / params.limit
        ),
        summary: {
          monthly: monthlyCount,
          quarterly: quarterlyCount,
          semiannual: semiannualCount,
          annual: annualCount,
          total: totalActive,
          pastDue: pastDueCount,
          upcomingNext7Days: upcomingRenewals,
        },
      });
    });
  } catch (error) {
    logger.error('Failed to fetch subscription renewals', { error });
    return handleApiError(error, { context: { route: 'GET /api/subscriptions/renewals' } });
  }
}

export const GET = withAuth(handler, {
  roles: ['admin', 'super_admin', 'provider', 'staff'],
});
