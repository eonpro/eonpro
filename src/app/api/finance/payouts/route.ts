/**
 * Finance Payouts API
 * 
 * GET /api/finance/payouts
 * Returns payout data and balances from database records
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { verifyClinicAccess } from '@/lib/auth/clinic-access';
import { subDays, subMonths, startOfMonth, format } from 'date-fns';

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
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      // Get payments for fee calculations
      const recentPayments = await prisma.payment.findMany({
        where: {
          clinicId,
          createdAt: { gte: thirtyDaysAgo },
          status: 'SUCCEEDED',
        },
        select: {
          amount: true,
          createdAt: true,
        },
      });

      // Calculate totals
      const totalGross = recentPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      
      // Estimate fees (approximately 2.9% + $0.30 per transaction for Stripe)
      const stripeFees = Math.round(recentPayments.reduce((sum: number, p: { amount: number }) => {
        return sum + (p.amount * 0.029) + 30; // 2.9% + $0.30 in cents
      }, 0));
      
      // Calculate monthly payouts from invoice data
      const threeMonthsAgo = subMonths(new Date(), 3);
      const monthlyPayments = await prisma.invoice.findMany({
        where: {
          clinicId,
          status: 'PAID',
          paidAt: { gte: threeMonthsAgo },
        },
        select: {
          amountPaid: true,
          paidAt: true,
        },
      });

      // Group by month
      const monthlyPayouts: Array<{ month: string; gross: number; fees: number; net: number }> = [];
      const monthMap = new Map<string, number>();
      
      monthlyPayments.forEach((payment: { amountPaid: number; paidAt: Date | null }) => {
        if (payment.paidAt) {
          const monthKey = format(payment.paidAt, 'yyyy-MM');
          monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + payment.amountPaid);
        }
      });

      monthMap.forEach((gross, month) => {
        const estimatedFees = Math.round(gross * 0.029);
        monthlyPayouts.push({
          month,
          gross,
          fees: estimatedFees,
          net: gross - estimatedFees,
        });
      });

      // Sort by month descending
      monthlyPayouts.sort((a, b) => b.month.localeCompare(a.month));

      // Note: Real balance and payout data would come from Stripe API
      // This returns database-based estimates
      const response = {
        balance: {
          available: 0,
          pending: 0,
          reserved: 0,
        },
        upcomingPayouts: [],
        payoutHistory: [],
        feeBreakdown: {
          stripeFees,
          platformFees: 0,
          refundFees: 0,
          disputeFees: 0,
          totalFees: stripeFees,
          feePercentage: totalGross > 0 ? Math.round((stripeFees / totalGross) * 1000) / 10 : 0,
        },
        monthlyPayouts: monthlyPayouts.slice(0, 6),
        bankAccounts: [],
      };

      return NextResponse.json(response);
    });
  } catch (error) {
    logger.error('Failed to fetch payout data', { error });
    return NextResponse.json(
      { error: 'Failed to fetch payout data' },
      { status: 500 }
    );
  }
}
