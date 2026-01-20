/**
 * STRIPE DISPUTES API
 * 
 * GET /api/stripe/disputes - List all disputes/chargebacks
 * POST /api/stripe/disputes - Submit evidence for a dispute
 * 
 * Provides:
 * - Active disputes
 * - Dispute history
 * - Evidence submission
 * - Win/loss statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

export async function GET(request: NextRequest) {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const status = searchParams.get('status') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    // Build date filter
    const createdFilter: Stripe.RangeQueryParam | undefined = 
      startDate || endDate ? {
        ...(startDate && { gte: Math.floor(new Date(startDate).getTime() / 1000) }),
        ...(endDate && { lte: Math.floor(new Date(endDate).getTime() / 1000) }),
      } : undefined;
    
    const disputeParams: Stripe.DisputeListParams = {
      limit,
      ...(startingAfter && { starting_after: startingAfter }),
      ...(createdFilter && { created: createdFilter }),
      expand: ['data.charge', 'data.payment_intent'],
    };
    
    const disputes = await stripe.disputes.list(disputeParams);
    
    // Calculate statistics
    let totalDisputed = 0;
    let totalWon = 0;
    let totalLost = 0;
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;
    const reasonBreakdown: Record<string, number> = {};
    
    const formattedDisputes = disputes.data
      .filter(d => !status || d.status === status)
      .map(dispute => {
        totalDisputed += dispute.amount;
        
        if (dispute.status === 'won') {
          totalWon += dispute.amount;
          wonCount++;
        } else if (dispute.status === 'lost') {
          totalLost += dispute.amount;
          lostCount++;
        } else if (['needs_response', 'under_review', 'warning_needs_response'].includes(dispute.status)) {
          pendingCount++;
        }
        
        reasonBreakdown[dispute.reason] = (reasonBreakdown[dispute.reason] || 0) + 1;
        
        const charge = dispute.charge as Stripe.Charge | null;
        const paymentIntent = dispute.payment_intent as Stripe.PaymentIntent | null;
        
        return {
          id: dispute.id,
          amount: dispute.amount,
          amountFormatted: formatCurrency(dispute.amount),
          currency: dispute.currency.toUpperCase(),
          status: dispute.status,
          reason: dispute.reason,
          reasonDisplay: formatDisputeReason(dispute.reason),
          created: dispute.created,
          createdAt: new Date(dispute.created * 1000).toISOString(),
          evidenceDueBy: dispute.evidence_details?.due_by 
            ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
            : null,
          hasEvidence: dispute.evidence_details?.has_evidence || false,
          submissionCount: dispute.evidence_details?.submission_count || 0,
          isRefundable: dispute.is_charge_refundable,
          chargeId: typeof dispute.charge === 'string' ? dispute.charge : charge?.id,
          paymentIntentId: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : paymentIntent?.id,
          customerEmail: charge?.billing_details?.email || null,
          customerName: charge?.billing_details?.name || null,
          metadata: dispute.metadata,
          networkReasonCode: dispute.network_reason_code,
        };
      });
    
    const summary = {
      total: formattedDisputes.length,
      totalDisputed,
      totalDisputedFormatted: formatCurrency(totalDisputed),
      won: {
        count: wonCount,
        amount: totalWon,
        amountFormatted: formatCurrency(totalWon),
      },
      lost: {
        count: lostCount,
        amount: totalLost,
        amountFormatted: formatCurrency(totalLost),
      },
      pending: pendingCount,
      winRate: wonCount + lostCount > 0 
        ? ((wonCount / (wonCount + lostCount)) * 100).toFixed(1) + '%'
        : 'N/A',
      byReason: Object.entries(reasonBreakdown).map(([reason, count]) => ({
        reason,
        reasonDisplay: formatDisputeReason(reason),
        count,
      })).sort((a, b) => b.count - a.count),
    };
    
    logger.info('[STRIPE DISPUTES] Retrieved disputes', {
      count: formattedDisputes.length,
      pending: pendingCount,
    });
    
    return NextResponse.json({
      success: true,
      disputes: formattedDisputes,
      summary,
      pagination: {
        hasMore: disputes.has_more,
        limit,
        ...(formattedDisputes.length > 0 && { lastId: formattedDisputes[formattedDisputes.length - 1].id }),
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('[STRIPE DISPUTES] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch disputes' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await request.json();
    
    const { disputeId, evidence } = body;
    
    if (!disputeId) {
      return NextResponse.json(
        { error: 'disputeId is required' },
        { status: 400 }
      );
    }
    
    // Update dispute with evidence
    const dispute = await stripe.disputes.update(disputeId, {
      evidence: {
        customer_name: evidence?.customerName,
        customer_email_address: evidence?.customerEmail,
        product_description: evidence?.productDescription,
        customer_signature: evidence?.customerSignature,
        receipt: evidence?.receiptFileId,
        refund_policy: evidence?.refundPolicy,
        refund_policy_disclosure: evidence?.refundPolicyDisclosure,
        service_date: evidence?.serviceDate,
        service_documentation: evidence?.serviceDocumentationFileId,
        uncategorized_text: evidence?.additionalNotes,
      },
      submit: evidence?.submit || false,
    });
    
    logger.info('[STRIPE DISPUTES] Evidence submitted', {
      disputeId,
      submitted: evidence?.submit,
    });
    
    return NextResponse.json({
      success: true,
      dispute: {
        id: dispute.id,
        status: dispute.status,
        hasEvidence: dispute.evidence_details?.has_evidence,
        submissionCount: dispute.evidence_details?.submission_count,
      },
      message: evidence?.submit ? 'Evidence submitted' : 'Evidence saved (not submitted)',
    });
    
  } catch (error: any) {
    logger.error('[STRIPE DISPUTES] Error submitting evidence:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to submit evidence' },
      { status: 500 }
    );
  }
}

function formatDisputeReason(reason: string): string {
  const reasonMap: Record<string, string> = {
    'bank_cannot_process': 'Bank Cannot Process',
    'check_returned': 'Check Returned',
    'credit_not_processed': 'Credit Not Processed',
    'customer_initiated': 'Customer Initiated',
    'debit_not_authorized': 'Debit Not Authorized',
    'duplicate': 'Duplicate Charge',
    'fraudulent': 'Fraudulent',
    'general': 'General',
    'incorrect_account_details': 'Incorrect Account Details',
    'insufficient_funds': 'Insufficient Funds',
    'product_not_received': 'Product Not Received',
    'product_unacceptable': 'Product Unacceptable',
    'subscription_canceled': 'Subscription Canceled',
    'unrecognized': 'Unrecognized',
  };
  return reasonMap[reason] || reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
