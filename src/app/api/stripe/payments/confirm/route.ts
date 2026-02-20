import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PaymentStatus } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getStripeForClinic } from '@/lib/stripe/connect';
import { processPaymentForCommission } from '@/services/affiliate/affiliateCommissionService';
import { logger } from '@/lib/logger';

async function handlePost(request: NextRequest, _user: AuthUser) {
  try {
    const { paymentIntentId, stripePaymentMethodId, localPaymentMethodId } = await request.json();

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'paymentIntentId is required' }, { status: 400 });
    }

    const pendingPayment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId, status: PaymentStatus.PENDING },
    });

    if (!pendingPayment) {
      return NextResponse.json({ error: 'Pending payment not found' }, { status: 404 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: pendingPayment.patientId },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const stripeContext = await getStripeForClinic(patient.clinicId);
    const stripe = stripeContext.stripe;
    const connectOpts = stripeContext.stripeAccountId
      ? { stripeAccount: stripeContext.stripeAccountId }
      : undefined;

    const intent = connectOpts
      ? await stripe.paymentIntents.retrieve(paymentIntentId, connectOpts)
      : await stripe.paymentIntents.retrieve(paymentIntentId);

    const stripeStatus = intent.status === 'succeeded'
      ? PaymentStatus.SUCCEEDED
      : intent.status === 'processing'
        ? PaymentStatus.PROCESSING
        : PaymentStatus.FAILED;

    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        status: stripeStatus,
        stripeChargeId: intent.latest_charge?.toString(),
      },
    });

    // Link the Stripe PaymentMethod to the local record for future use
    if (stripePaymentMethodId && localPaymentMethodId) {
      try {
        await prisma.paymentMethod.update({
          where: { id: parseInt(String(localPaymentMethodId)) },
          data: {
            stripePaymentMethodId,
            lastUsedAt: new Date(),
          },
        });
      } catch (linkErr) {
        logger.warn('[PaymentConfirm] Failed to link Stripe PM to local card (non-blocking)', {
          localPaymentMethodId,
          stripePaymentMethodId,
          error: linkErr instanceof Error ? linkErr.message : String(linkErr),
        });
      }
    }

    if (stripeStatus !== PaymentStatus.SUCCEEDED) {
      return NextResponse.json(
        { error: `Payment ${intent.status}. Please try again.` },
        { status: 402 }
      );
    }

    // Commission processing (non-blocking)
    try {
      const priorCount = await prisma.payment.count({
        where: {
          patientId: patient.id,
          status: PaymentStatus.SUCCEEDED,
          id: { not: pendingPayment.id },
        },
      });

      await processPaymentForCommission({
        clinicId: patient.clinicId,
        patientId: patient.id,
        stripeEventId: intent.id,
        stripeObjectId: intent.id,
        stripeEventType: 'payment_intent.succeeded',
        amountCents: pendingPayment.amount,
        occurredAt: new Date(),
        isFirstPayment: priorCount === 0,
        isRecurring: false,
      });
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      success: true,
      payment: { ...pendingPayment, status: stripeStatus },
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'POST /api/stripe/payments/confirm' });
  }
}

export const POST = withAuth(handlePost);
