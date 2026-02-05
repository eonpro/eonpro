/**
 * STRIPE REFUNDS API
 *
 * Handles full and partial refunds for payments
 *
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

const refundSchema = z.object({
  paymentId: z.number().optional(),
  stripeInvoiceId: z.string().optional(), // For invoice-based refunds
  amount: z.number().min(1).optional(), // Amount in cents, optional for full refund
  reason: z.enum([
    'requested_by_customer',
    'duplicate',
    'fraudulent',
    'service_not_rendered',
    'other'
  ]).optional(),
});

async function createRefundHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can process refunds
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const validated = refundSchema.parse(body);

    // Need either paymentId or stripeInvoiceId
    if (!validated.paymentId && !validated.stripeInvoiceId) {
      return NextResponse.json(
        { error: 'Either paymentId or stripeInvoiceId is required' },
        { status: 400 }
      );
    }

    let payment: any = null;
    let invoice: any = null;
    let refundAmount: number;

    // If we have a paymentId, use that
    if (validated.paymentId) {
      payment = await prisma.payment.findUnique({
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

      refundAmount = validated.amount || payment.amount;
    } else if (validated.stripeInvoiceId) {
      // Invoice-based refund - find the invoice and its payments
      invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: validated.stripeInvoiceId },
        include: {
          patient: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!invoice) {
        return NextResponse.json(
          { error: 'Invoice not found' },
          { status: 404 }
        );
      }

      // Use the first successful payment for refund
      payment = invoice.payments[0];
      refundAmount = validated.amount || invoice.amountPaid;
    } else {
      return NextResponse.json(
        { error: 'No valid payment reference found' },
        { status: 400 }
      );
    }

    if (!refundAmount || refundAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid refund amount' },
        { status: 400 }
      );
    }

    const maxRefundable = payment ? payment.amount : (invoice?.amountPaid || 0);
    if (refundAmount > maxRefundable) {
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

      const isFullRefund = refundAmount >= maxRefundable;
      const invoiceId = payment?.invoiceId || invoice?.id;

      // Wrap all database updates in a transaction for atomicity
      await prisma.$transaction(async (tx: typeof prisma) => {
        // Update payment status if we have a payment
        if (payment) {
          await tx.payment.update({
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
        }

        // Update invoice if exists
        if (invoiceId) {
          await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              amountPaid: { decrement: refundAmount },
              status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            },
          });
        }

        // Create audit log
        await tx.auditLog.create({
          data: {
            userId: 0, // TODO: Get from auth
            action: 'REFUND_PROCESSED',
            resource: payment ? 'Payment' : 'Invoice',
            resourceId: payment?.id || invoice?.id || 0,
            details: {
              paymentId: payment?.id,
              invoiceId: invoiceId,
              amount: refundAmount,
              reason: validated.reason,
              demoMode: true,
            },
          },
        });
      });

      return NextResponse.json({
        success: true,
        refund: {
          id: `demo_refund_${Date.now()}`,
          amount: refundAmount,
          status: 'succeeded',
          paymentId: payment?.id,
          invoiceId: invoiceId,
        },
        demoMode: true,
        message: 'Refund processed in demo mode',
      });
    }

    // Production mode - use Stripe
    try {
      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();

      let refund;
      const isFullRefund = refundAmount >= maxRefundable;

      // Try payment intent refund first
      if (payment?.stripePaymentIntentId) {
        refund = await stripe.refunds.create({
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
      } else if (validated.stripeInvoiceId) {
        // Try invoice-based refund via charge or payment_intent lookup
        const stripeInvoice = await stripe.invoices.retrieve(validated.stripeInvoiceId, {
          expand: ['payment_intent', 'charge'],
        }) as Stripe.Invoice & {
          charge?: string | Stripe.Charge | null;
          payment_intent?: string | Stripe.PaymentIntent | null;
        };

        logger.info('[Refunds] Invoice retrieved:', {
          invoiceId: validated.stripeInvoiceId,
          status: stripeInvoice.status,
          paymentIntent: stripeInvoice.payment_intent,
          charge: stripeInvoice.charge,
        });

        // Try different payment methods in order:
        // 1. Direct charge on invoice
        // 2. Payment Intent on invoice
        // 3. Look up charge from payment intent

        if (stripeInvoice.charge) {
          // Invoice has a direct charge
          const chargeId = typeof stripeInvoice.charge === 'string'
            ? stripeInvoice.charge
            : stripeInvoice.charge.id;

          refund = await stripe.refunds.create({
            charge: chargeId,
            amount: refundAmount,
            reason: validated.reason === 'fraudulent' ? 'fraudulent'
                  : validated.reason === 'duplicate' ? 'duplicate'
                  : 'requested_by_customer',
            metadata: {
              invoiceId: validated.stripeInvoiceId,
              reason: validated.reason || 'requested_by_customer',
            },
          });
        } else if (stripeInvoice.payment_intent) {
          // Invoice was paid via PaymentIntent (newer method)
          const paymentIntentId = typeof stripeInvoice.payment_intent === 'string'
            ? stripeInvoice.payment_intent
            : stripeInvoice.payment_intent.id;

          refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: refundAmount,
            reason: validated.reason === 'fraudulent' ? 'fraudulent'
                  : validated.reason === 'duplicate' ? 'duplicate'
                  : 'requested_by_customer',
            metadata: {
              invoiceId: validated.stripeInvoiceId,
              reason: validated.reason || 'requested_by_customer',
            },
          });
        } else {
          // No charge or payment intent directly on invoice
          // Try to find the charge by listing charges with invoice metadata
          logger.info('[Refunds] No direct charge/payment_intent, searching for charges...', {
            invoiceId: validated.stripeInvoiceId,
            status: stripeInvoice.status,
            customerId: stripeInvoice.customer,
          });

          // Try to find payment via Stripe API - search for charges with this invoice
          try {
            const customerId = typeof stripeInvoice.customer === 'string'
              ? stripeInvoice.customer
              : stripeInvoice.customer?.id;

            if (customerId) {
              // List recent charges for this customer
              const charges = await stripe.charges.list({
                customer: customerId,
                limit: 20,
              });

              // Find a charge that matches the invoice amount
              const matchingCharge = charges.data.find(charge =>
                charge.amount === stripeInvoice.amount_paid &&
                charge.status === 'succeeded' &&
                !charge.refunded
              );

              if (matchingCharge) {
                logger.info('[Refunds] Found matching charge via customer lookup', {
                  chargeId: matchingCharge.id,
                  amount: matchingCharge.amount,
                });

                refund = await stripe.refunds.create({
                  charge: matchingCharge.id,
                  amount: refundAmount,
                  reason: validated.reason === 'fraudulent' ? 'fraudulent'
                        : validated.reason === 'duplicate' ? 'duplicate'
                        : 'requested_by_customer',
                  metadata: {
                    invoiceId: validated.stripeInvoiceId,
                    reason: validated.reason || 'requested_by_customer',
                  },
                });
              } else {
                // Try payment intents
                const paymentIntents = await stripe.paymentIntents.list({
                  customer: customerId,
                  limit: 20,
                });

                const matchingPI = paymentIntents.data.find(pi =>
                  pi.amount === stripeInvoice.amount_paid &&
                  pi.status === 'succeeded'
                );

                if (matchingPI) {
                  logger.info('[Refunds] Found matching payment intent via customer lookup', {
                    paymentIntentId: matchingPI.id,
                    amount: matchingPI.amount,
                  });

                  refund = await stripe.refunds.create({
                    payment_intent: matchingPI.id,
                    amount: refundAmount,
                    reason: validated.reason === 'fraudulent' ? 'fraudulent'
                          : validated.reason === 'duplicate' ? 'duplicate'
                          : 'requested_by_customer',
                    metadata: {
                      invoiceId: validated.stripeInvoiceId,
                      reason: validated.reason || 'requested_by_customer',
                    },
                  });
                }
              }
            }
          } catch (lookupError: any) {
            logger.error('[Refunds] Failed to lookup charges', { error: lookupError.message });
          }

          // If we still don't have a refund, return error
          if (!refund) {
            logger.error('[Refunds] Invoice has no charge or payment_intent and lookup failed', {
              invoiceId: validated.stripeInvoiceId,
              status: stripeInvoice.status,
              amountPaid: stripeInvoice.amount_paid,
            });

            return NextResponse.json(
              {
                error: 'No charge found for this invoice. Please refund directly from Stripe dashboard.',
                invoiceStatus: stripeInvoice.status,
                amountPaid: stripeInvoice.amount_paid,
              },
              { status: 400 }
            );
          }
        }
      } else {
        return NextResponse.json(
          { error: 'No Stripe payment reference found for refund' },
          { status: 400 }
        );
      }

      // Stripe refund succeeded - now update our database
      // Wrap all updates in a transaction for atomicity
      const invoiceId = payment?.invoiceId || invoice?.id;
      let dbUpdateSuccess = true;

      try {
        await prisma.$transaction(async (tx: typeof prisma) => {
          // Update payment in database if we have one
          if (payment) {
            await tx.payment.update({
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
          }

          // Update invoice if exists
          if (invoiceId) {
            await tx.invoice.update({
              where: { id: invoiceId },
              data: {
                amountPaid: { decrement: refundAmount },
                status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
              },
            });
          }

          // Create audit log
          await tx.auditLog.create({
            data: {
              userId: 0, // TODO: Get from auth
              action: 'REFUND_PROCESSED',
              resource: payment ? 'Payment' : 'Invoice',
              resourceId: payment?.id || invoice?.id || 0,
              details: {
                paymentId: payment?.id,
                invoiceId: invoiceId,
                stripeRefundId: refund.id,
                amount: refundAmount,
                reason: validated.reason,
              },
            },
          });
        });
      } catch (dbError: any) {
        // Log DB error but don't fail - the Stripe refund already succeeded
        logger.error('[Refunds] Database update failed after successful Stripe refund', {
          error: dbError.message,
          refundId: refund.id,
          paymentId: payment?.id,
          invoiceId: invoiceId,
        });
        dbUpdateSuccess = false;
      }

      logger.info('[Refunds] Refund processed successfully', {
        paymentId: payment?.id,
        invoiceId: invoiceId,
        refundId: refund.id,
        amount: refundAmount,
        dbUpdateSuccess,
      });

      return NextResponse.json({
        success: true,
        refund: {
          id: refund.id,
          amount: refund.amount,
          status: refund.status,
          paymentId: payment?.id,
          invoiceId: invoiceId,
        },
        dbUpdateSuccess, // Let frontend know if DB update failed
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
async function getRefundsHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view refunds
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

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
      refunds: refundedPayments.map((p: { stripeRefundId: string | null; id: number; refundedAmount: number | null; status: string; refundedAt: Date | null; patient: unknown; invoice: unknown }) => ({
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

export const POST = withAuth(createRefundHandler);
export const GET = withAuth(getRefundsHandler);
