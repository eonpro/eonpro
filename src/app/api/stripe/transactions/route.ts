import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

/**
 * GET /api/stripe/transactions
 * 
 * Fetches all transactions (charges, payments, refunds) from Stripe for the clinic.
 * Protected: Requires admin or super_admin role.
 * 
 * Query Parameters:
 *   - limit: number (default: 50, max: 100)
 *   - starting_after: string (pagination cursor)
 *   - type: 'all' | 'charges' | 'payments' | 'refunds' (default: 'all')
 *   - status: 'all' | 'succeeded' | 'pending' | 'failed' (default: 'all')
 *   - startDate: ISO date string (filter from date)
 *   - endDate: ISO date string (filter to date)
 */

interface TransactionItem {
  id: string;
  type: 'charge' | 'payment' | 'refund' | 'payout' | 'transfer';
  amount: number;
  amountFormatted: string;
  currency: string;
  status: string;
  description: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerId: string | null;
  created: number;
  createdAt: string;
  metadata: Record<string, string>;
  paymentMethod: string | null;
  receiptUrl: string | null;
  invoiceId: string | null;
  refundedAmount?: number;
  failureMessage?: string | null;
}

export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(req.url);
    
    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const type = searchParams.get('type') || 'all';
    const status = searchParams.get('status') || 'all';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    logger.info('[STRIPE TRANSACTIONS] Fetching transactions', {
      user: user.email,
      limit,
      type,
      status,
    });

    const transactions: TransactionItem[] = [];
    let hasMore = false;

    // Build date filter
    const createdFilter: Stripe.RangeQueryParam | undefined = 
      startDate || endDate ? {
        ...(startDate && { gte: Math.floor(new Date(startDate).getTime() / 1000) }),
        ...(endDate && { lte: Math.floor(new Date(endDate).getTime() / 1000) }),
      } : undefined;

    // Fetch charges (most comprehensive for payment history)
    if (type === 'all' || type === 'charges') {
      const chargesParams: Stripe.ChargeListParams = {
        limit,
        ...(startingAfter && { starting_after: startingAfter }),
        ...(createdFilter && { created: createdFilter }),
        expand: ['data.customer', 'data.invoice'],
      };

      const charges = await stripe.charges.list(chargesParams);
      hasMore = charges.has_more;

      for (const charge of charges.data) {
        // Filter by status if specified
        if (status !== 'all') {
          const chargeStatus = charge.status === 'succeeded' ? 'succeeded' : 
                              charge.status === 'pending' ? 'pending' : 'failed';
          if (chargeStatus !== status) continue;
        }

        const customer = charge.customer as Stripe.Customer | null;
        
        transactions.push({
          id: charge.id,
          type: 'charge',
          amount: charge.amount,
          amountFormatted: formatCurrency(charge.amount),
          currency: charge.currency.toUpperCase(),
          status: charge.status,
          description: charge.description,
          customerEmail: customer?.email || charge.billing_details?.email || null,
          customerName: customer?.name || charge.billing_details?.name || null,
          customerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
          created: charge.created,
          createdAt: new Date(charge.created * 1000).toISOString(),
          metadata: charge.metadata || {},
          paymentMethod: charge.payment_method_details?.type || null,
          receiptUrl: charge.receipt_url,
          invoiceId: typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id || null,
          refundedAmount: charge.amount_refunded > 0 ? charge.amount_refunded : undefined,
          failureMessage: charge.failure_message,
        });
      }
    }

    // Fetch refunds separately if requested
    if (type === 'all' || type === 'refunds') {
      const refundsParams: Stripe.RefundListParams = {
        limit: type === 'refunds' ? limit : Math.min(limit, 25),
        ...(createdFilter && { created: createdFilter }),
        expand: ['data.charge'],
      };

      const refunds = await stripe.refunds.list(refundsParams);
      
      for (const refund of refunds.data) {
        const charge = refund.charge as Stripe.Charge | null;
        
        transactions.push({
          id: refund.id,
          type: 'refund',
          amount: -refund.amount, // Negative to show it's a refund
          amountFormatted: `-${formatCurrency(refund.amount)}`,
          currency: refund.currency.toUpperCase(),
          status: refund.status || 'succeeded',
          description: refund.reason || 'Refund',
          customerEmail: charge?.billing_details?.email || null,
          customerName: charge?.billing_details?.name || null,
          customerId: typeof charge?.customer === 'string' ? charge.customer : null,
          created: refund.created,
          createdAt: new Date(refund.created * 1000).toISOString(),
          metadata: refund.metadata || {},
          paymentMethod: null,
          receiptUrl: charge?.receipt_url || null,
          invoiceId: null,
        });
      }
    }

    // Fetch payouts (money transferred to bank)
    if (type === 'all' || type === 'payouts') {
      try {
        const payoutsParams: Stripe.PayoutListParams = {
          limit: type === 'payouts' ? limit : Math.min(limit, 10),
          ...(createdFilter && { created: createdFilter }),
        };

        const payouts = await stripe.payouts.list(payoutsParams);
        
        for (const payout of payouts.data) {
          transactions.push({
            id: payout.id,
            type: 'payout',
            amount: -payout.amount, // Negative - money leaving Stripe
            amountFormatted: `-${formatCurrency(payout.amount)}`,
            currency: payout.currency.toUpperCase(),
            status: payout.status,
            description: payout.description || 'Bank transfer',
            customerEmail: null,
            customerName: null,
            customerId: null,
            created: payout.created,
            createdAt: new Date(payout.created * 1000).toISOString(),
            metadata: payout.metadata || {},
            paymentMethod: payout.type,
            receiptUrl: null,
            invoiceId: null,
            failureMessage: payout.failure_message,
          });
        }
      } catch (err) {
        // Payouts might not be available for all account types
        logger.warn('[STRIPE TRANSACTIONS] Could not fetch payouts:', err);
      }
    }

    // Sort all transactions by created date (newest first)
    transactions.sort((a, b) => b.created - a.created);

    // Calculate summary statistics
    const summary = {
      totalTransactions: transactions.length,
      totalCharges: transactions.filter(t => t.type === 'charge' && t.status === 'succeeded').length,
      totalRefunds: transactions.filter(t => t.type === 'refunds').length,
      totalRevenue: transactions
        .filter(t => t.type === 'charge' && t.status === 'succeeded')
        .reduce((sum, t) => sum + t.amount, 0),
      totalRefunded: transactions
        .filter(t => t.type === 'refund')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
      netRevenue: 0,
    };
    summary.netRevenue = summary.totalRevenue - summary.totalRefunded;

    logger.info('[STRIPE TRANSACTIONS] Fetched transactions', {
      count: transactions.length,
      totalRevenue: formatCurrency(summary.totalRevenue),
    });

    return NextResponse.json({
      transactions,
      summary: {
        ...summary,
        totalRevenueFormatted: formatCurrency(summary.totalRevenue),
        totalRefundedFormatted: formatCurrency(summary.totalRefunded),
        netRevenueFormatted: formatCurrency(summary.netRevenue),
      },
      pagination: {
        hasMore,
        limit,
        ...(transactions.length > 0 && { lastId: transactions[transactions.length - 1].id }),
      },
    });

  } catch (error) {
    logger.error('[STRIPE TRANSACTIONS] Error fetching transactions:', error);
    
    if (error instanceof Error && error.message.includes('not configured')) {
      return NextResponse.json(
        { error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch transactions', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });
