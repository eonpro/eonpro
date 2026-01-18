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

// Transaction categories for sales reporting
type TransactionCategory = 
  | 'new_patient'
  | 'subscription'
  | 'semaglutide'
  | 'tirzepatide'
  | 'consultation'
  | 'lab_work'
  | 'refill'
  | 'one_time'
  | 'other';

interface TransactionItem {
  id: string;
  type: 'charge' | 'payment' | 'refund' | 'payout' | 'transfer';
  category: TransactionCategory;
  categoryLabel: string;
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
  productName?: string;
}

// Detect transaction category from description and metadata
function detectCategory(description: string | null, metadata: Record<string, string>): { category: TransactionCategory; label: string; productName?: string } {
  const desc = (description || '').toLowerCase();
  const productName = metadata?.product_name || metadata?.productName || '';
  const productLower = productName.toLowerCase();
  
  // Check for specific medications
  if (desc.includes('semaglutide') || productLower.includes('semaglutide') || 
      desc.includes('ozempic') || desc.includes('wegovy') || desc.includes('rybelsus')) {
    return { category: 'semaglutide', label: 'Semaglutide', productName: productName || 'Semaglutide' };
  }
  
  if (desc.includes('tirzepatide') || productLower.includes('tirzepatide') ||
      desc.includes('mounjaro') || desc.includes('zepbound')) {
    return { category: 'tirzepatide', label: 'Tirzepatide', productName: productName || 'Tirzepatide' };
  }
  
  // Check for subscription
  if (desc.includes('subscription') || desc.includes('monthly') || desc.includes('membership') ||
      metadata?.subscription_id || metadata?.recurring === 'true') {
    return { category: 'subscription', label: 'Subscription', productName };
  }
  
  // Check for new patient
  if (desc.includes('new patient') || desc.includes('initial') || desc.includes('intake') ||
      desc.includes('first visit') || metadata?.new_patient === 'true') {
    return { category: 'new_patient', label: 'New Patient', productName };
  }
  
  // Check for consultation
  if (desc.includes('consult') || desc.includes('visit') || desc.includes('appointment') ||
      desc.includes('telehealth')) {
    return { category: 'consultation', label: 'Consultation', productName };
  }
  
  // Check for lab work
  if (desc.includes('lab') || desc.includes('blood') || desc.includes('test') ||
      desc.includes('panel') || desc.includes('a1c')) {
    return { category: 'lab_work', label: 'Lab Work', productName };
  }
  
  // Check for refill
  if (desc.includes('refill') || desc.includes('renewal') || desc.includes('continue')) {
    return { category: 'refill', label: 'Refill', productName };
  }
  
  // Check for one-time purchase
  if (desc.includes('one-time') || desc.includes('one time') || desc.includes('single')) {
    return { category: 'one_time', label: 'One-Time Purchase', productName };
  }
  
  return { category: 'other', label: 'Other', productName };
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
      // Only use starting_after if it's a charge ID (starts with 'ch_')
      const isChargeId = startingAfter?.startsWith('ch_');
      
      const chargesParams: Stripe.ChargeListParams = {
        limit,
        ...(isChargeId && startingAfter && { starting_after: startingAfter }),
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
        const { category, label, productName } = detectCategory(charge.description, charge.metadata || {});
        
        transactions.push({
          id: charge.id,
          type: 'charge',
          category,
          categoryLabel: label,
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
          productName,
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
        const { category, label, productName } = detectCategory(charge?.description || refund.reason || null, refund.metadata || {});
        
        transactions.push({
          id: refund.id,
          type: 'refund',
          category,
          categoryLabel: label,
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
          productName,
        });
      }
    }

    // Payouts are internal bank transfers - only fetch if explicitly requested
    // Not useful for sales reporting, excluded from "all" by default
    if (type === 'payouts') {
      try {
        const payoutsParams: Stripe.PayoutListParams = {
          limit,
          ...(createdFilter && { created: createdFilter }),
        };

        const payouts = await stripe.payouts.list(payoutsParams);
        
        for (const payout of payouts.data) {
          transactions.push({
            id: payout.id,
            type: 'payout',
            category: 'other',
            categoryLabel: 'Payout',
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
    const successfulCharges = transactions.filter(t => t.type === 'charge' && t.status === 'succeeded');
    
    const summary = {
      totalTransactions: transactions.length,
      totalCharges: successfulCharges.length,
      totalRefunds: transactions.filter(t => t.type === 'refund').length,
      totalRevenue: successfulCharges.reduce((sum, t) => sum + t.amount, 0),
      totalRefunded: transactions
        .filter(t => t.type === 'refund')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
      netRevenue: 0,
    };
    summary.netRevenue = summary.totalRevenue - summary.totalRefunded;
    
    // Calculate revenue by category
    const categoryBreakdown: Record<string, { count: number; revenue: number; label: string }> = {};
    for (const tx of successfulCharges) {
      if (!categoryBreakdown[tx.category]) {
        categoryBreakdown[tx.category] = { count: 0, revenue: 0, label: tx.categoryLabel };
      }
      categoryBreakdown[tx.category].count++;
      categoryBreakdown[tx.category].revenue += tx.amount;
    }

    logger.info('[STRIPE TRANSACTIONS] Fetched transactions', {
      count: transactions.length,
      totalRevenue: formatCurrency(summary.totalRevenue),
    });

    // For pagination, only use charge IDs (other types don't support cross-type pagination)
    const lastChargeId = transactions
      .filter(t => t.type === 'charge')
      .slice(-1)[0]?.id;
    
    // Format category breakdown for response
    const formattedCategoryBreakdown = Object.entries(categoryBreakdown).map(([key, value]) => ({
      category: key,
      label: value.label,
      count: value.count,
      revenue: value.revenue,
      revenueFormatted: formatCurrency(value.revenue),
      percentage: summary.totalRevenue > 0 
        ? ((value.revenue / summary.totalRevenue) * 100).toFixed(1) 
        : '0',
    })).sort((a, b) => b.revenue - a.revenue);
    
    return NextResponse.json({
      transactions,
      summary: {
        ...summary,
        totalRevenueFormatted: formatCurrency(summary.totalRevenue),
        totalRefundedFormatted: formatCurrency(summary.totalRefunded),
        netRevenueFormatted: formatCurrency(summary.netRevenue),
        byCategory: formattedCategoryBreakdown,
      },
      pagination: {
        hasMore,
        limit,
        ...(lastChargeId && { lastId: lastChargeId }),
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
