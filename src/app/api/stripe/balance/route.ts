/**
 * STRIPE BALANCE API
 *
 * GET /api/stripe/balance - Get current balance and balance transactions
 *
 * Provides:
 * - Current available balance
 * - Pending balance
 * - Balance transactions history
 * - Fee breakdown
 *
 * PROTECTED: Requires admin authentication
 *
 * Supports multi-tenant data isolation via clinic context:
 * - super_admin: Can specify clinicId query param, defaults to platform
 * - admin: Uses their clinic's Stripe account (connected or platform)
 */

import { NextRequest, NextResponse } from 'next/server';
import { formatCurrency } from '@/lib/stripe';
import {
  getStripeForClinic,
  getStripeForPlatform,
  withConnectedAccount,
} from '@/lib/stripe/connect';
import { getClinicIdFromRequest } from '@/lib/clinic/utils';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

async function getBalanceHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view financial data
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // Determine which clinic's Stripe account to use
    const clinicIdParam = searchParams.get('clinicId');
    let stripeContext;

    if (user.role === 'super_admin') {
      // Super admin can specify clinicId, defaults to platform account
      if (clinicIdParam) {
        stripeContext = await getStripeForClinic(parseInt(clinicIdParam));
      } else {
        stripeContext = getStripeForPlatform();
      }
    } else {
      // Regular admins use their clinic's Stripe account
      const contextClinicId = await getClinicIdFromRequest(request);
      const clinicId = contextClinicId || user.clinicId;

      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      stripeContext = await getStripeForClinic(clinicId);
    }

    const { stripe, stripeAccountId, isPlatformAccount, clinicId } = stripeContext;

    // If clinic has no Stripe account configured, return empty state
    if (!isPlatformAccount && !stripeAccountId) {
      return NextResponse.json({
        success: true,
        notConnected: true,
        message: 'This clinic has not connected a Stripe account yet',
        balance: {
          available: [],
          pending: [],
          totalAvailable: 0,
          totalPending: 0,
          totalAvailableFormatted: '$0.00',
          totalPendingFormatted: '$0.00',
        },
        clinicId,
        timestamp: new Date().toISOString(),
      });
    }

    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const type = searchParams.get('type') || undefined; // charge, refund, payout, etc.
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeTransactions = searchParams.get('includeTransactions') !== 'false';

    // Get current balance (with connected account if applicable)
    const balance = await stripe.balance.retrieve(
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );

    // Format balance data
    const balanceData = {
      available: balance.available.map((b) => ({
        amount: b.amount,
        amountFormatted: formatCurrency(b.amount),
        currency: b.currency.toUpperCase(),
        sourceTypes: b.source_types,
      })),
      pending: balance.pending.map((b) => ({
        amount: b.amount,
        amountFormatted: formatCurrency(b.amount),
        currency: b.currency.toUpperCase(),
        sourceTypes: b.source_types,
      })),
      // Totals in USD (assuming single currency)
      totalAvailable: balance.available.reduce((sum, b) => sum + b.amount, 0),
      totalPending: balance.pending.reduce((sum, b) => sum + b.amount, 0),
      totalAvailableFormatted: formatCurrency(
        balance.available.reduce((sum, b) => sum + b.amount, 0)
      ),
      totalPendingFormatted: formatCurrency(balance.pending.reduce((sum, b) => sum + b.amount, 0)),
    };

    let transactionsData = null;

    if (includeTransactions) {
      // Build date filter
      const createdFilter: Stripe.RangeQueryParam | undefined =
        startDate || endDate
          ? {
              ...(startDate && { gte: Math.floor(new Date(startDate).getTime() / 1000) }),
              ...(endDate && { lte: Math.floor(new Date(endDate).getTime() / 1000) }),
            }
          : undefined;

      // Get balance transactions
      // Build transaction params dynamically to avoid type issues
      const transactionsParams: Record<string, unknown> = {
        limit,
        expand: ['data.source'],
      };
      if (startingAfter) transactionsParams.starting_after = startingAfter;
      if (type) transactionsParams.type = type;
      if (createdFilter) transactionsParams.created = createdFilter;
      if (stripeAccountId) transactionsParams.stripeAccount = stripeAccountId;

      const transactions = await stripe.balanceTransactions.list(
        transactionsParams as Stripe.BalanceTransactionListParams
      );

      // Calculate summary
      let totalGross = 0;
      let totalFees = 0;
      let totalNet = 0;
      const feeBreakdown: Record<string, number> = {};
      const typeBreakdown: Record<
        string,
        { count: number; gross: number; fees: number; net: number }
      > = {};

      const formattedTransactions = transactions.data.map((tx) => {
        totalGross += tx.amount;
        totalFees += tx.fee;
        totalNet += tx.net;

        // Track fees by type
        tx.fee_details?.forEach((fee) => {
          feeBreakdown[fee.type] = (feeBreakdown[fee.type] || 0) + fee.amount;
        });

        // Track by transaction type
        if (!typeBreakdown[tx.type]) {
          typeBreakdown[tx.type] = { count: 0, gross: 0, fees: 0, net: 0 };
        }
        typeBreakdown[tx.type].count++;
        typeBreakdown[tx.type].gross += tx.amount;
        typeBreakdown[tx.type].fees += tx.fee;
        typeBreakdown[tx.type].net += tx.net;

        return {
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          amountFormatted: formatCurrency(tx.amount),
          fee: tx.fee,
          feeFormatted: formatCurrency(tx.fee),
          net: tx.net,
          netFormatted: formatCurrency(tx.net),
          currency: tx.currency.toUpperCase(),
          status: tx.status,
          description: tx.description,
          created: tx.created,
          createdAt: new Date(tx.created * 1000).toISOString(),
          availableOn: tx.available_on,
          availableOnDate: new Date(tx.available_on * 1000).toISOString(),
          sourceId: typeof tx.source === 'string' ? tx.source : tx.source?.id,
          sourceType: (tx as unknown as Record<string, unknown>).source_type as string | undefined,
          feeDetails: tx.fee_details?.map((f) => ({
            type: f.type,
            amount: f.amount,
            amountFormatted: formatCurrency(f.amount),
            description: f.description,
          })),
          reportingCategory: tx.reporting_category,
        };
      });

      transactionsData = {
        transactions: formattedTransactions,
        summary: {
          totalGross,
          totalGrossFormatted: formatCurrency(totalGross),
          totalFees,
          totalFeesFormatted: formatCurrency(totalFees),
          totalNet,
          totalNetFormatted: formatCurrency(totalNet),
          effectiveFeeRate:
            totalGross > 0 ? ((totalFees / totalGross) * 100).toFixed(2) + '%' : '0%',
          feeBreakdown: Object.entries(feeBreakdown).map(([type, amount]) => ({
            type,
            amount,
            amountFormatted: formatCurrency(amount),
          })),
          byType: Object.entries(typeBreakdown).map(([type, data]) => ({
            type,
            count: data.count,
            gross: data.gross,
            grossFormatted: formatCurrency(data.gross),
            fees: data.fees,
            feesFormatted: formatCurrency(data.fees),
            net: data.net,
            netFormatted: formatCurrency(data.net),
          })),
        },
        pagination: {
          hasMore: transactions.has_more,
          limit,
          ...(formattedTransactions.length > 0 && {
            lastId: formattedTransactions[formattedTransactions.length - 1].id,
          }),
        },
      };
    }

    logger.info('[STRIPE BALANCE] Retrieved balance data', {
      available: balanceData.totalAvailableFormatted,
      pending: balanceData.totalPendingFormatted,
      transactionCount: transactionsData?.transactions.length || 0,
      clinicId,
      isPlatformAccount,
    });

    return NextResponse.json({
      success: true,
      balance: balanceData,
      ...(transactionsData && { transactions: transactionsData }),
      clinicId,
      isPlatformAccount,
      isConnectedAccount: !!stripeAccountId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('[STRIPE BALANCE] Error:', error);

    if (error.message?.includes('not configured')) {
      return NextResponse.json(
        { error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getBalanceHandler);
