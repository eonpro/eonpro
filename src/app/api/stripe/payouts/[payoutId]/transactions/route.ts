/**
 * STRIPE PAYOUT TRANSACTION DETAIL API
 *
 * GET /api/stripe/payouts/[payoutId]/transactions
 *
 * Breaks down a single payout into its constituent balance transactions
 * (charges, refunds, fees, adjustments) so admins can see exactly what
 * money went into each bank deposit.
 *
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { formatCurrency } from '@/lib/stripe';
import { getStripeContextForRequest, getNotConnectedResponse } from '@/lib/stripe/context';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

async function handler(
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ payoutId: string }> }
) {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    const { payoutId } = await params;
    if (!payoutId || !payoutId.startsWith('po_')) {
      return NextResponse.json({ error: 'Invalid payout ID' }, { status: 400 });
    }

    const { context, error, notConnected } = await getStripeContextForRequest(request, user);
    if (error) return error;
    if (notConnected || !context) {
      return getNotConnectedResponse(context?.clinicId);
    }

    const { stripe, stripeAccountId } = context;
    const connectedOpts = stripeAccountId ? { stripeAccount: stripeAccountId } : {};

    const payout = await stripe.payouts.retrieve(payoutId, {}, connectedOpts as any);

    const allTransactions: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const response = await stripe.balanceTransactions.list({
        payout: payoutId,
        limit: 100,
        expand: ['data.source'],
        ...(startingAfter && { starting_after: startingAfter }),
        ...connectedOpts,
      } as any);

      for (const tx of response.data) {
        const source = tx.source as any;
        allTransactions.push({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          amountFormatted: formatCurrency(tx.amount),
          fee: tx.fee,
          feeFormatted: formatCurrency(tx.fee),
          net: tx.net,
          netFormatted: formatCurrency(tx.net),
          currency: tx.currency.toUpperCase(),
          description: tx.description || '',
          created: new Date(tx.created * 1000).toISOString(),
          status: tx.status,
          sourceId: typeof tx.source === 'string' ? tx.source : source?.id || '',
          sourceType: typeof tx.source === 'string' ? tx.type : source?.object || tx.type,
          customerEmail: source?.billing_details?.email || source?.receipt_email || null,
          feeDetails:
            tx.fee_details?.map((fd) => ({
              type: fd.type,
              amount: fd.amount,
              amountFormatted: formatCurrency(fd.amount),
              description: fd.description,
            })) || [],
        });
      }

      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
      if (allTransactions.length > 500) break;
    }

    const charges = allTransactions.filter((t) => t.type === 'charge' || t.type === 'payment');
    const refunds = allTransactions.filter((t) => t.type === 'refund');
    const fees = allTransactions.filter(
      (t) => t.type === 'stripe_fee' || t.type === 'application_fee'
    );
    const other = allTransactions.filter(
      (t) => !['charge', 'payment', 'refund', 'stripe_fee', 'application_fee'].includes(t.type)
    );

    const totalCharges = charges.reduce((s, t) => s + t.amount, 0);
    const totalRefunds = refunds.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalFees = allTransactions.reduce((s, t) => s + t.fee, 0);
    const totalNet = allTransactions.reduce((s, t) => s + t.net, 0);

    logger.info('[Stripe] Payout transactions fetched', {
      payoutId,
      transactionCount: allTransactions.length,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      payout: {
        id: payout.id,
        amount: payout.amount,
        amountFormatted: formatCurrency(payout.amount),
        status: payout.status,
        arrivalDate: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString()
          : null,
        created: new Date(payout.created * 1000).toISOString(),
        method: payout.type,
        description: payout.description,
      },
      summary: {
        totalCharges,
        totalChargesFormatted: formatCurrency(totalCharges),
        chargeCount: charges.length,
        totalRefunds,
        totalRefundsFormatted: formatCurrency(totalRefunds),
        refundCount: refunds.length,
        totalFees,
        totalFeesFormatted: formatCurrency(totalFees),
        totalNet,
        totalNetFormatted: formatCurrency(totalNet),
        transactionCount: allTransactions.length,
      },
      transactions: allTransactions,
      breakdown: { charges, refunds, fees, other },
    });
  } catch (err) {
    logger.error('[Stripe] Payout transactions error', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch payout transactions' },
      { status: 500 }
    );
  }
}

export const GET = withAuth((req: NextRequest, user: AuthUser) => {
  const url = new URL(req.url);
  const segments = url.pathname.split('/');
  const payoutIdIdx = segments.indexOf('payouts') + 1;
  const payoutId = segments[payoutIdIdx] || '';
  return handler(req, user, { params: Promise.resolve({ payoutId }) });
});
