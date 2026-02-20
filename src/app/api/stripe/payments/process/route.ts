import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PaymentStatus } from '@prisma/client';
import { encryptCardData } from '@/lib/encryption';
import crypto from 'crypto';
import { processPaymentForCommission } from '@/services/affiliate/affiliateCommissionService';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { handleApiError } from '@/domains/shared/errors';
import { getStripeForClinic } from '@/lib/stripe/connect';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

interface PaymentDetails {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  billingZip: string;
  cardBrand: string;
  saveCard: boolean;
}

interface SubscriptionInfo {
  planId: string;
  planName: string;
  interval: string;
  intervalCount: number;
}

async function handlePost(request: NextRequest, _user: AuthUser) {
  try {
    const body = await request.json();
    const { patientId, amount, description, paymentDetails, paymentMethodId: savedPaymentMethodId, subscription, notes } = body;

    if (!patientId || !amount || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!paymentDetails && !savedPaymentMethodId) {
      return NextResponse.json(
        { error: 'Either paymentDetails or paymentMethodId is required' },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id: parseInt(patientId) },
      include: { paymentMethods: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // --- Saved card path: actually charges through Stripe ---
    if (savedPaymentMethodId) {
      const savedId = String(savedPaymentMethodId);
      const isStripeOnly = savedId.startsWith('stripe_');

      let stripePaymentMethodId: string | null = null;
      let cardLast4 = '????';
      let cardBrand = 'Unknown';
      let localPaymentMethodId: number | null = null;

      if (isStripeOnly) {
        stripePaymentMethodId = savedId.replace('stripe_', '');
      } else {
        const numericId = parseInt(savedId);
        if (isNaN(numericId)) {
          return NextResponse.json({ error: 'Invalid payment method ID' }, { status: 400 });
        }

        const existingMethod = await prisma.paymentMethod.findFirst({
          where: { id: numericId, patientId: patient.id, isActive: true },
        });

        if (!existingMethod) {
          return NextResponse.json({ error: 'Payment method not found or inactive' }, { status: 404 });
        }

        stripePaymentMethodId = existingMethod.stripePaymentMethodId;
        cardLast4 = existingMethod.cardLast4;
        cardBrand = existingMethod.cardBrand;
        localPaymentMethodId = existingMethod.id;
      }

      if (!stripePaymentMethodId) {
        return NextResponse.json(
          { error: 'This card is not linked to Stripe and cannot be charged. Please add a new card or use a Stripe-linked card.' },
          { status: 400 }
        );
      }

      if (!patient.stripeCustomerId) {
        return NextResponse.json(
          { error: 'Patient does not have a Stripe customer profile. Please add a card through Stripe first.' },
          { status: 400 }
        );
      }

      const stripeContext = await getStripeForClinic(patient.clinicId);
      const stripe = stripeContext.stripe;

      // Resolve card details for Stripe-only cards
      if (isStripeOnly) {
        try {
          const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId);
          cardLast4 = pm.card?.last4 || '????';
          cardBrand = pm.card?.brand
            ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
            : 'Unknown';
        } catch {
          // Non-blocking: card display details are cosmetic
        }
      }

      const idempotencyKey = `pi_saved_${patient.id}_${Date.now()}_${crypto.randomUUID()}`;

      // DB-first: create PENDING payment record before calling Stripe
      const pendingPayment = await prisma.payment.create({
        data: {
          patientId: patient.id,
          amount,
          status: PaymentStatus.PENDING,
          paymentMethod: `Card ending ${cardLast4}`,
          description,
          notes,
          metadata: {
            cardBrand,
            localPaymentMethodId,
            stripePaymentMethodId,
            planId: subscription?.planId,
            usedSavedCard: true,
            idempotencyKey,
          } as any,
        },
      });

      // Create and confirm PaymentIntent through Stripe
      let paymentIntent;
      try {
        const intentParams: Record<string, unknown> = {
          amount,
          currency: 'usd',
          customer: patient.stripeCustomerId,
          payment_method: stripePaymentMethodId,
          description,
          confirm: true,
          off_session: true,
          metadata: {
            paymentId: pendingPayment.id.toString(),
            patientId: patient.id.toString(),
            idempotencyKey,
          },
        };

        paymentIntent = await stripe.paymentIntents.create(
          intentParams as any,
          {
            idempotencyKey,
            ...(stripeContext.stripeAccountId ? { stripeAccount: stripeContext.stripeAccountId } : {}),
          }
        );
      } catch (stripeError: unknown) {
        const errMsg = stripeError instanceof Error ? stripeError.message : 'Stripe charge failed';
        await prisma.payment.update({
          where: { id: pendingPayment.id },
          data: {
            status: PaymentStatus.FAILED,
            failureReason: errMsg,
          },
        });

        logger.error('[PaymentProcess] Stripe charge failed for saved card', {
          paymentId: pendingPayment.id,
          patientId: patient.id,
          error: errMsg,
        });

        return NextResponse.json({ error: errMsg }, { status: 402 });
      }

      // Map Stripe status
      const stripeStatus = paymentIntent.status === 'succeeded'
        ? PaymentStatus.SUCCEEDED
        : paymentIntent.status === 'processing'
          ? PaymentStatus.PROCESSING
          : PaymentStatus.FAILED;

      // Update payment record and create subscription inside a transaction
      const result = await prisma.$transaction(async (tx) => {
        let subscriptionId: number | null = null;

        await tx.payment.update({
          where: { id: pendingPayment.id },
          data: {
            status: stripeStatus,
            stripePaymentIntentId: paymentIntent.id,
            stripeChargeId: paymentIntent.latest_charge?.toString(),
          },
        });

        if (subscription && stripeStatus === PaymentStatus.SUCCEEDED) {
          const subscriptionInfo = subscription as SubscriptionInfo;
          const now = new Date();
          const periodEnd = new Date(now);
          const totalMonths = subscriptionInfo.intervalCount *
            (subscriptionInfo.interval === 'year' ? 12 : subscriptionInfo.interval === 'month' ? 1 : 1);
          periodEnd.setMonth(periodEnd.getMonth() + (totalMonths || 1));

          const createdSubscription = await tx.subscription.create({
            data: {
              patientId: patient.id,
              planId: subscriptionInfo.planId,
              planName: subscriptionInfo.planName,
              planDescription: description,
              amount,
              interval: subscriptionInfo.interval,
              intervalCount: subscriptionInfo.intervalCount,
              startDate: now,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              nextBillingDate: periodEnd,
              paymentMethodId: localPaymentMethodId ?? 0,
            },
          });

          subscriptionId = createdSubscription.id;

          await tx.payment.update({
            where: { id: pendingPayment.id },
            data: { subscriptionId },
          });

          const currentTags = (patient.tags as string[]) || [];
          const subscriptionTag = `subscription-${subscriptionInfo.planName.toLowerCase().replace(/\s+/g, '-')}`;
          if (!currentTags.includes(subscriptionTag)) {
            await tx.patient.update({
              where: { id: patient.id },
              data: { tags: [...currentTags, subscriptionTag, 'active-subscription'] },
            });
          }
        }

        if (localPaymentMethodId) {
          await tx.paymentMethod.update({
            where: { id: localPaymentMethodId },
            data: { lastUsedAt: new Date() },
          });
        }

        return { subscriptionId };
      }, { timeout: 15000 });

      if (stripeStatus !== PaymentStatus.SUCCEEDED) {
        return NextResponse.json(
          { error: `Payment ${paymentIntent.status}. Please try again or use a different card.` },
          { status: 402 }
        );
      }

      // Commission processing (non-blocking)
      let commissionProcessed = false;
      try {
        const priorPaymentCount = await prisma.payment.count({
          where: {
            patientId: patient.id,
            status: PaymentStatus.SUCCEEDED,
            id: { not: pendingPayment.id },
          },
        });
        const isFirstPayment = priorPaymentCount === 0;

        const commissionResult = await processPaymentForCommission({
          clinicId: patient.clinicId,
          patientId: patient.id,
          stripeEventId: paymentIntent.id,
          stripeObjectId: paymentIntent.id,
          stripeEventType: 'payment_intent.succeeded',
          amountCents: amount,
          occurredAt: new Date(),
          isFirstPayment,
          isRecurring: !!subscription,
          recurringMonth: undefined,
          productSku: subscription?.planId,
          productCategory: subscription?.planName,
        });

        commissionProcessed = commissionResult.success && !commissionResult.skipped;
        if (commissionProcessed) {
          logger.info('[PaymentProcess] Affiliate commission created', {
            paymentId: pendingPayment.id,
            patientId: patient.id,
            commissionEventId: commissionResult.commissionEventId,
          });
        }
      } catch (commissionError) {
        logger.warn('[PaymentProcess] Affiliate commission processing failed (non-blocking)', {
          paymentId: pendingPayment.id,
          patientId: patient.id,
          error: commissionError instanceof Error ? commissionError.message : 'Unknown',
        });
      }

      return NextResponse.json({
        success: true,
        payment: { ...pendingPayment, status: stripeStatus, stripePaymentIntentId: paymentIntent.id },
        paymentMethodSaved: false,
        subscriptionCreated: !!result.subscriptionId,
        commissionProcessed,
      });
    }

    // --- New card path (original flow) ---
    const {
      cardNumber,
      cardholderName,
      expiryMonth,
      expiryYear,
      cvv,
      billingZip,
      cardBrand,
      saveCard,
    } = paymentDetails as PaymentDetails;

    const cardLast4 = cardNumber.slice(-4);
    const encryptionKeyId = crypto.randomBytes(16).toString('hex');

    const result = await prisma.$transaction(async (tx) => {
      let paymentMethodId: number | null = null;
      let subscriptionId: number | null = null;

      if (saveCard || subscription) {
        const encryptedCardNumber = encryptCardData(cardNumber);
        const encryptedCvv = encryptCardData(cvv);

        const paymentMethod = await tx.paymentMethod.create({
          data: {
            patientId: patient.id,
            encryptedCardNumber,
            cardLast4,
            cardBrand: cardBrand || 'Unknown',
            expiryMonth,
            expiryYear,
            cardholderName,
            encryptedCvv,
            billingZip,
            isDefault: patient.paymentMethods.length === 0,
            isActive: true,
            encryptionKeyId,
            fingerprint: crypto.createHash('sha256').update(cardNumber).digest('hex'),
            lastUsedAt: new Date(),
          },
        });

        paymentMethodId = paymentMethod.id;
      }

      if (subscription) {
        const subscriptionInfo = subscription as SubscriptionInfo;
        const now = new Date();
        const periodEnd = new Date(now);
        const totalMonths = subscriptionInfo.intervalCount *
          (subscriptionInfo.interval === 'year' ? 12 : subscriptionInfo.interval === 'month' ? 1 : 1);
        periodEnd.setMonth(periodEnd.getMonth() + (totalMonths || 1));

        const createdSubscription = await tx.subscription.create({
          data: {
            patientId: patient.id,
            planId: subscriptionInfo.planId,
            planName: subscriptionInfo.planName,
            planDescription: description,
            amount,
            interval: subscriptionInfo.interval,
            intervalCount: subscriptionInfo.intervalCount,
            startDate: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingDate: periodEnd,
            paymentMethodId: paymentMethodId!,
          },
        });

        subscriptionId = createdSubscription.id;

        const currentTags = (patient.tags as string[]) || [];
        const subscriptionTag = `subscription-${subscriptionInfo.planName.toLowerCase().replace(/\s+/g, '-')}`;

        if (!currentTags.includes(subscriptionTag)) {
          await tx.patient.update({
            where: { id: patient.id },
            data: {
              tags: [...currentTags, subscriptionTag, 'active-subscription'],
            },
          });
        }
      }

      const payment = await tx.payment.create({
        data: {
          patientId: patient.id,
          amount,
          status: PaymentStatus.SUCCEEDED,
          paymentMethod: `Card ending ${cardLast4}`,
          description,
          notes,
          subscriptionId,
          metadata: {
            cardBrand,
            paymentMethodId,
            subscriptionId,
            planId: subscription?.planId,
          } as any,
        },
      });

      if (paymentMethodId) {
        await tx.paymentMethod.update({
          where: { id: paymentMethodId },
          data: { lastUsedAt: new Date() },
        });
      }

      return { payment, paymentMethodId, subscriptionId };
    }, { timeout: 15000 });

    const { payment, paymentMethodId, subscriptionId } = result;

    let commissionProcessed = false;
    try {
      const priorPaymentCount = await prisma.payment.count({
        where: {
          patientId: patient.id,
          status: PaymentStatus.SUCCEEDED,
          id: { not: payment.id },
        },
      });
      const isFirstPayment = priorPaymentCount === 0;

      const commissionResult = await processPaymentForCommission({
        clinicId: patient.clinicId,
        patientId: patient.id,
        stripeEventId: `payment-${payment.id}`,
        stripeObjectId: payment.id.toString(),
        stripeEventType: 'payment.succeeded',
        amountCents: Math.round(amount * 100),
        occurredAt: new Date(),
        isFirstPayment,
        isRecurring: !!subscription,
        recurringMonth: isFirstPayment ? undefined : undefined,
        productSku: subscription?.planId,
        productCategory: subscription?.planName,
      });

      commissionProcessed = commissionResult.success && !commissionResult.skipped;
      if (commissionProcessed) {
        logger.info('[PaymentProcess] Affiliate commission created', {
          paymentId: payment.id,
          patientId: patient.id,
          commissionEventId: commissionResult.commissionEventId,
        });
      }
    } catch (commissionError) {
      logger.warn('[PaymentProcess] Affiliate commission processing failed (non-blocking)', {
        paymentId: payment.id,
        patientId: patient.id,
        error: commissionError instanceof Error ? commissionError.message : 'Unknown',
      });
    }

    return NextResponse.json({
      success: true,
      payment,
      paymentMethodSaved: saveCard || !!subscription,
      subscriptionCreated: !!subscriptionId,
      commissionProcessed,
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'POST /api/stripe/payments/process' });
  }
}

export const POST = withAuth(handlePost);
