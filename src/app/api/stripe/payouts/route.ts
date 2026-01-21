/**
 * STRIPE PAYOUTS API
 * 
 * GET /api/stripe/payouts - List all payouts to bank account
 * 
 * Provides:
 * - Payout history
 * - Payout status tracking
 * - Bank account info
 * - Payout schedule
 * 
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

async function getPayoutsHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view payouts
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }
    
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const status = searchParams.get('status') as Stripe.Payout.Status | undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    // Build filters
    const arrivalDateFilter: Stripe.RangeQueryParam | undefined = 
      startDate || endDate ? {
        ...(startDate && { gte: Math.floor(new Date(startDate).getTime() / 1000) }),
        ...(endDate && { lte: Math.floor(new Date(endDate).getTime() / 1000) }),
      } : undefined;
    
    // Fetch payouts
    const payoutParams: Stripe.PayoutListParams = {
      limit,
      ...(startingAfter && { starting_after: startingAfter }),
      ...(status && { status }),
      ...(arrivalDateFilter && { arrival_date: arrivalDateFilter }),
    };
    
    const payouts = await stripe.payouts.list(payoutParams);
    
    // Calculate statistics
    let totalPaidOut = 0;
    let totalPending = 0;
    let totalFailed = 0;
    const statusBreakdown: Record<string, { count: number; amount: number }> = {};
    
    const formattedPayouts = payouts.data.map(payout => {
      if (payout.status === 'paid') {
        totalPaidOut += payout.amount;
      } else if (payout.status === 'pending' || payout.status === 'in_transit') {
        totalPending += payout.amount;
      } else if (payout.status === 'failed' || payout.status === 'canceled') {
        totalFailed += payout.amount;
      }
      
      if (!statusBreakdown[payout.status]) {
        statusBreakdown[payout.status] = { count: 0, amount: 0 };
      }
      statusBreakdown[payout.status].count++;
      statusBreakdown[payout.status].amount += payout.amount;
      
      return {
        id: payout.id,
        amount: payout.amount,
        amountFormatted: formatCurrency(payout.amount),
        currency: payout.currency.toUpperCase(),
        status: payout.status,
        statusDisplay: formatPayoutStatus(payout.status),
        type: payout.type,
        method: payout.method,
        description: payout.description,
        created: payout.created,
        createdAt: new Date(payout.created * 1000).toISOString(),
        arrivalDate: payout.arrival_date,
        arrivalDateFormatted: new Date(payout.arrival_date * 1000).toISOString(),
        automatic: payout.automatic,
        sourceType: payout.source_type,
        statementDescriptor: payout.statement_descriptor,
        failureCode: payout.failure_code,
        failureMessage: payout.failure_message,
        metadata: payout.metadata,
        // Bank account info (masked)
        destination: payout.destination ? {
          id: typeof payout.destination === 'string' ? payout.destination : payout.destination,
        } : null,
      };
    });
    
    // Get account settings for payout schedule
    let payoutSchedule = null;
    try {
      const account = await stripe.accounts.retrieve();
      if (account.settings?.payouts?.schedule) {
        payoutSchedule = {
          interval: account.settings.payouts.schedule.interval,
          monthlyAnchor: account.settings.payouts.schedule.monthly_anchor,
          weeklyAnchor: account.settings.payouts.schedule.weekly_anchor,
          delayDays: account.settings.payouts.schedule.delay_days,
        };
      }
    } catch (e) {
      // Account settings might not be accessible
    }
    
    const summary = {
      totalPayouts: formattedPayouts.length,
      totalPaidOut,
      totalPaidOutFormatted: formatCurrency(totalPaidOut),
      totalPending,
      totalPendingFormatted: formatCurrency(totalPending),
      totalFailed,
      totalFailedFormatted: formatCurrency(totalFailed),
      byStatus: Object.entries(statusBreakdown).map(([status, data]) => ({
        status,
        statusDisplay: formatPayoutStatus(status),
        count: data.count,
        amount: data.amount,
        amountFormatted: formatCurrency(data.amount),
      })),
      schedule: payoutSchedule,
    };
    
    logger.info('[STRIPE PAYOUTS] Retrieved payouts', {
      count: formattedPayouts.length,
      totalPaidOut: formatCurrency(totalPaidOut),
    });
    
    return NextResponse.json({
      success: true,
      payouts: formattedPayouts,
      summary,
      pagination: {
        hasMore: payouts.has_more,
        limit,
        ...(formattedPayouts.length > 0 && { lastId: formattedPayouts[formattedPayouts.length - 1].id }),
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('[STRIPE PAYOUTS] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payouts' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getPayoutsHandler);

function formatPayoutStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'paid': 'Paid',
    'pending': 'Pending',
    'in_transit': 'In Transit',
    'canceled': 'Canceled',
    'failed': 'Failed',
  };
  return statusMap[status] || status;
}
