/**
 * Finance Reconciliation API
 *
 * GET /api/finance/reconciliation
 * Returns payment reconciliation data and statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { startOfDay, subDays } from 'date-fns';

export const GET = withAdminAuth(async (request: NextRequest, user) => {
  try {
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    {
      const today = startOfDay(new Date());

      // Get unmatched payments (payments without a patientId or with matching issues)
      const unmatchedPayments = await prisma.payment.findMany({
        where: {
          clinicId,
          patientId: null as any,
          status: 'SUCCEEDED',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          stripePaymentIntentId: true,
          amount: true,
          createdAt: true,
          metadata: true,
        },
      });

      // Count matched payments today
      const matchedToday = await prisma.payment.count({
        where: {
          clinicId,
          patientId: { not: null } as any,
          status: 'SUCCEEDED',
          createdAt: { gte: today },
        },
      });

      // Transform unmatched payments
      const transformedPayments = unmatchedPayments.map(
        (payment: (typeof unmatchedPayments)[number]) => {
          const metadata = payment.metadata as Record<string, unknown> | null;
          return {
            id: payment.id,
            stripePaymentId: payment.stripePaymentIntentId || `local_${payment.id}`,
            amount: payment.amount,
            email: (metadata?.email as string) || '',
            name: (metadata?.name as string) || null,
            date: payment.createdAt.toISOString(),
            status: 'pending' as const,
            confidence: 0,
            suggestedPatientId: null,
            suggestedPatientName: null,
          };
        }
      );

      // Calculate auto-match rate
      const totalPayments = await prisma.payment.count({
        where: {
          clinicId,
          status: 'SUCCEEDED',
          createdAt: { gte: subDays(new Date(), 30) },
        },
      });

      const matchedPayments = await prisma.payment.count({
        where: {
          clinicId,
          status: 'SUCCEEDED',
          patientId: { not: null } as any,
          createdAt: { gte: subDays(new Date(), 30) },
        },
      });

      const autoMatchRate =
        totalPayments > 0 ? Math.round((matchedPayments / totalPayments) * 1000) / 10 : 0;

      return NextResponse.json({
        stats: {
          totalUnmatched: unmatchedPayments.length,
          matchedToday,
          createdToday: 0,
          skippedToday: 0,
          autoMatchRate,
        },
        unmatchedPayments: transformedPayments,
        rules: [],
      });
    }
  } catch (error) {
    logger.error('Failed to fetch reconciliation data', { error });
    return NextResponse.json({ error: 'Failed to fetch reconciliation data' }, { status: 500 });
  }
});
