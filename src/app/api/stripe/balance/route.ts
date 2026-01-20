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
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

export async function GET(request: NextRequest) {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const type = searchParams.get('type') || undefined; // charge, refund, payout, etc.
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeTransactions = searchParams.get('includeTransactions') !== 'false';
    
    // Get current balance
    const balance = await stripe.balance.retrieve();
    
    // Format balance data
    const balanceData = {
      available: balance.available.map(b => ({
        amount: b.amount,
        amountFormatted: formatCurrency(b.amount),
        currency: b.currency.toUpperCase(),
        sourceTypes: b.source_types,
      })),
      pending: balance.pending.map(b => ({
        amount: b.amount,
        amountFormatted: formatCurrency(b.amount),
        currency: b.currency.toUpperCase(),
        sourceTypes: b.source_types,
      })),
      // Totals in USD (assuming single currency)
      totalAvailable: balance.available.reduce((sum, b) => sum + b.amount, 0),
      totalPending: balance.pending.reduce((sum, b) => sum + b.amount, 0),
      totalAvailableFormatted: formatCurrency(balance.available.reduce((sum, b) => sum + b.amount, 0)),
      totalPendingFormatted: formatCurrency(balance.pending.reduce((sum, b) => sum + b.amount, 0)),
    };
    
    let transactionsData = null;
    
    if (includeTransactions) {
      // Build date filter
      const createdFilter: Stripe.RangeQueryParam | undefined = 
        startDate || endDate ? {
          ...(startDate && { gte: Math.floor(new Date(startDate).getTime() / 1000) }),
          ...(endDate && { lte: Math.floor(new Date(endDate).getTime() / 1000) }),
        } : undefined;
      
      // Get balance transactions
      const transactionsParams: Stripe.BalanceTransactionListParams = {
        limit,
        ...(startingAfter && { starting_after: startingAfter }),
        ...(type && { type: type as Stripe.BalanceTransactionListParams.Type }),
        ...(createdFilter && { created: createdFilter }),
        expand: ['data.source'],
      };
      
      const transactions = await stripe.balanceTransactions.list(transactionsParams);
      
      // Calculate summary
      let totalGross = 0;
      let totalFees = 0;
      let totalNet = 0;
      const feeBreakdown: Record<string, number> = {};
      const typeBreakdown: Record<string, { count: number; gross: number; fees: number; net: number }> = {};
      
      const formattedTransactions = transactions.data.map(tx => {
        totalGross += tx.amount;
        totalFees += tx.fee;
        totalNet += tx.net;
        
        // Track fees by type
        tx.fee_details?.forEach(fee => {
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
          sourceType: tx.source_type,
          feeDetails: tx.fee_details?.map(f => ({
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
          effectiveFeeRate: totalGross > 0 ? ((totalFees / totalGross) * 100).toFixed(2) + '%' : '0%',
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
          ...(formattedTransactions.length > 0 && { lastId: formattedTransactions[formattedTransactions.length - 1].id }),
        },
      };
    }
    
    logger.info('[STRIPE BALANCE] Retrieved balance data', {
      available: balanceData.totalAvailableFormatted,
      pending: balanceData.totalPendingFormatted,
      transactionCount: transactionsData?.transactions.length || 0,
    });
    
    return NextResponse.json({
      success: true,
      balance: balanceData,
      ...(transactionsData && { transactions: transactionsData }),
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
