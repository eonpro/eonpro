/**
 * Finance Reconciliation API
 *
 * GET /api/finance/reconciliation
 * Returns payment reconciliation data and statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { verifyClinicAccess } from '@/lib/auth/clinic-access';
import { startOfDay, subDays } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get clinic ID from context or fall back to user's clinic
    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    // SECURITY: Verify user has access to this clinic's financial data
    if (!verifyClinicAccess(user, clinicId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return withClinicContext(clinicId, async () => {
      const today = startOfDay(new Date());

      // Get unmatched payments (payments without a patientId or with matching issues)
      const unmatchedPayments = await prisma.payment.findMany({
        where: {
          clinicId,
          patientId: null,
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
          patientId: { not: null },
          status: 'SUCCEEDED',
          updatedAt: { gte: today },
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
          patientId: { not: null },
          createdAt: { gte: subDays(new Date(), 30) },
        },
      });

      const autoMatchRate =
        totalPayments > 0 ? Math.round((matchedPayments / totalPayments) * 1000) / 10 : 0;

      return NextResponse.json({
        stats: {
          totalUnmatched: unmatchedPayments.length,
          matchedToday,
          createdToday: 0, // Would track new patients created from payments
          skippedToday: 0, // Would track skipped payments
          autoMatchRate,
        },
        unmatchedPayments: transformedPayments,
        rules: [], // Reconciliation rules would be stored in a separate table
      });
    });
  } catch (error) {
    logger.error('Failed to fetch reconciliation data', { error });
    return NextResponse.json({ error: 'Failed to fetch reconciliation data' }, { status: 500 });
  }
}
