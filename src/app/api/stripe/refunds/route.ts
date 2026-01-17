/**
 * STRIPE REFUNDS API
 * 
 * Handles full and partial refunds for payments
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const refundSchema = z.object({
  paymentId: z.number(),
  amount: z.number().min(1).optional(), // Amount in cents, optional for full refund
  reason: z.enum([
    'requested_by_customer',
    'duplicate',
    'fraudulent',
    'service_not_rendered',
    'other'
  ]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = refundSchema.parse(body);
    
    // Get the payment
    const payment = await prisma.payment.findUnique({
      where: { id: validated.paymentId },
      include: { patient: true, invoice: true },
    });
    
    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }
    
    if (payment.status !== 'SUCCEEDED') {
      return NextResponse.json(
        { error: 'Can only refund successful payments' },
        { status: 400 }
      );
    }
    
    // Determine refund amount
    const refundAmount = validated.amount || payment.amount;
    
    if (refundAmount > payment.amount) {
      return NextResponse.json(
        { error: 'Refund amount cannot exceed payment amount' },
        { status: 400 }
      );
    }
    
    // Check if Stripe is configured
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    
    if (!stripeConfigured) {
      // Demo mode - just update database
      logger.warn('[Refunds] Processing refund in demo mode');
      
      const isFullRefund = refundAmount >= payment.amount;
      
      // Update payment status
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundedAmount: refundAmount,
          refundedAt: new Date(),
          metadata: {
            ...(payment.metadata as object || {}),
            refundReason: validated.reason,
            refundedBy: 'demo_mode',
          },
        },
      });
      
      // Update invoice if exists
      if (payment.invoiceId) {
        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            amountPaid: { decrement: refundAmount },
            status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });
      }
      
      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: 0, // TODO: Get from auth
          action: 'REFUND_PROCESSED',
          entityType: 'Payment',
          entityId: payment.id.toString(),
          details: {
            paymentId: payment.id,
            amount: refundAmount,
            reason: validated.reason,
            demoMode: true,
          },
        },
      });
      
      return NextResponse.json({
        success: true,
        refund: {
          id: `demo_refund_${Date.now()}`,
          amount: refundAmount,
          status: 'succeeded',
          paymentId: payment.id,
        },
        demoMode: true,
        message: 'Refund processed in demo mode',
      });
    }
    
    // Production mode - use Stripe
    try {
      const stripe = (await import('@/lib/stripe')).default;
      
      if (!payment.stripePaymentIntentId) {
        return NextResponse.json(
          { error: 'No Stripe payment intent associated with this payment' },
          { status: 400 }
        );
      }
      
      // Create refund in Stripe
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refundAmount,
        reason: validated.reason === 'fraudulent' ? 'fraudulent' 
              : validated.reason === 'duplicate' ? 'duplicate'
              : 'requested_by_customer',
        metadata: {
          paymentId: payment.id.toString(),
          patientId: payment.patientId.toString(),
          reason: validated.reason || 'requested_by_customer',
        },
      });
      
      const isFullRefund = refundAmount >= payment.amount;
      
      // Update payment in database
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundedAmount: refundAmount,
          refundedAt: new Date(),
          stripeRefundId: refund.id,
          metadata: {
            ...(payment.metadata as object || {}),
            refundReason: validated.reason,
            stripeRefundId: refund.id,
          },
        },
      });
      
      // Update invoice if exists
      if (payment.invoiceId) {
        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            amountPaid: { decrement: refundAmount },
            status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });
      }
      
      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: 0, // TODO: Get from auth
          action: 'REFUND_PROCESSED',
          entityType: 'Payment',
          entityId: payment.id.toString(),
          details: {
            paymentId: payment.id,
            stripeRefundId: refund.id,
            amount: refundAmount,
            reason: validated.reason,
          },
        },
      });
      
      logger.info('[Refunds] Refund processed successfully', {
        paymentId: payment.id,
        refundId: refund.id,
        amount: refundAmount,
      });
      
      return NextResponse.json({
        success: true,
        refund: {
          id: refund.id,
          amount: refund.amount,
          status: refund.status,
          paymentId: payment.id,
        },
      });
      
    } catch (stripeError: any) {
      logger.error('[Refunds] Stripe error:', stripeError);
      
      return NextResponse.json(
        { 
          error: stripeError.message || 'Failed to process refund',
          code: stripeError.code,
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    logger.error('[Refunds] Error processing refund:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to process refund' },
      { status: 500 }
    );
  }
}

// GET refunds for a patient or payment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    const paymentId = searchParams.get('paymentId');
    
    const where: any = {
      OR: [
        { status: 'REFUNDED' },
        { status: 'PARTIALLY_REFUNDED' },
      ],
    };
    
    if (patientId) {
      where.patientId = parseInt(patientId, 10);
    }
    
    if (paymentId) {
      where.id = parseInt(paymentId, 10);
    }
    
    const refundedPayments = await prisma.payment.findMany({
      where,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        invoice: {
          select: { id: true, stripeInvoiceNumber: true },
        },
      },
      orderBy: { refundedAt: 'desc' },
    });
    
    return NextResponse.json({
      success: true,
      refunds: refundedPayments.map(p => ({
        id: p.stripeRefundId || `db_${p.id}`,
        paymentId: p.id,
        amount: p.refundedAmount,
        status: p.status,
        refundedAt: p.refundedAt,
        patient: p.patient,
        invoice: p.invoice,
      })),
    });
    
  } catch (error: any) {
    logger.error('[Refunds] Error fetching refunds:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch refunds' },
      { status: 500 }
    );
  }
}
