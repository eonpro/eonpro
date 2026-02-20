import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PaymentStatus } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getStripeForClinic } from '@/lib/stripe/connect';
import { processPaymentForCommission } from '@/services/affiliate/affiliateCommissionService';
import { logger } from '@/lib/logger';
import type Stripe from 'stripe';

interface SubscriptionInfo {
  planId: string;
  planName: string;
  interval: string;
  intervalCount: number;
}

async function getOrCreateStripePrice(
  stripe: Stripe,
  sub: SubscriptionInfo,
  amountCents: number,
  stripeAccountId?: string | null,
) {
  const connectOpts = stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;

  const listParams = { lookup_keys: [sub.planId], limit: 1 };
  const existing = connectOpts
    ? await stripe.prices.list(listParams, connectOpts)
    : await stripe.prices.list(listParams);

  if (existing.data.length > 0) return existing.data[0];

  const productParams = {
    name: sub.planName,
    metadata: { planId: sub.planId },
  };
  const product = connectOpts
    ? await stripe.products.create(productParams, connectOpts)
    : await stripe.products.create(productParams);

  const intervalMap: Record<string, Stripe.PriceCreateParams.Recurring.Interval> = {
    month: 'month',
    year: 'year',
    week: 'week',
    day: 'day',
  };

  const priceParams: Stripe.PriceCreateParams = {
    product: product.id,
    unit_amount: amountCents,
    currency: 'usd',
    recurring: {
      interval: intervalMap[sub.interval] || 'month',
      interval_count: sub.intervalCount,
    },
    lookup_key: sub.planId,
  };

  return connectOpts
    ? await stripe.prices.create(priceParams, connectOpts)
    : await stripe.prices.create(priceParams);
}

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

    // Extract subscription data stored by the process route
    const paymentMeta = (pendingPayment.metadata as Record<string, unknown>) || {};
    const subscription = paymentMeta.subscription as SubscriptionInfo | null;

    // Link the Stripe PaymentMethod to the local record for future use
    const parsedLocalPmId = localPaymentMethodId ? parseInt(String(localPaymentMethodId)) : null;
    if (stripePaymentMethodId && parsedLocalPmId) {
      try {
        await prisma.paymentMethod.update({
          where: { id: parsedLocalPmId },
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

    // Update payment and create subscription in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let subscriptionId: number | null = null;

      await tx.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: stripeStatus,
          stripeChargeId: intent.latest_charge?.toString(),
        },
      });

      if (subscription && stripeStatus === PaymentStatus.SUCCEEDED) {
        const now = new Date();
        const periodEnd = new Date(now);
        const totalMonths = subscription.intervalCount *
          (subscription.interval === 'year' ? 12 : subscription.interval === 'month' ? 1 : 1);
        periodEnd.setMonth(periodEnd.getMonth() + (totalMonths || 1));

        const createdSubscription = await tx.subscription.create({
          data: {
            patientId: patient.id,
            planId: subscription.planId,
            planName: subscription.planName,
            planDescription: pendingPayment.description || '',
            amount: pendingPayment.amount,
            interval: subscription.interval,
            intervalCount: subscription.intervalCount,
            startDate: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingDate: periodEnd,
            paymentMethodId: parsedLocalPmId ?? 0,
          },
        });

        subscriptionId = createdSubscription.id;

        await tx.payment.update({
          where: { id: pendingPayment.id },
          data: { subscriptionId },
        });

        const currentTags = (patient.tags as string[]) || [];
        const subscriptionTag = `subscription-${subscription.planName.toLowerCase().replace(/\s+/g, '-')}`;
        if (!currentTags.includes(subscriptionTag)) {
          await tx.patient.update({
            where: { id: patient.id },
            data: { tags: [...currentTags, subscriptionTag, 'active-subscription'] },
          });
        }
      }

      return { subscriptionId };
    }, { timeout: 15000 });

    if (stripeStatus !== PaymentStatus.SUCCEEDED) {
      return NextResponse.json(
        { error: `Payment ${intent.status}. Please try again.` },
        { status: 402 }
      );
    }

    // Create real Stripe Subscription for recurring plans
    let stripeSubscriptionId: string | null = null;
    if (subscription && stripePaymentMethodId && patient.stripeCustomerId) {
      try {
        const stripePrice = await getOrCreateStripePrice(
          stripe,
          subscription,
          pendingPayment.amount,
          stripeContext.stripeAccountId,
        );

        const subParams: Record<string, unknown> = {
          customer: patient.stripeCustomerId,
          items: [{ price: stripePrice.id }],
          default_payment_method: stripePaymentMethodId,
          metadata: {
            patientId: patient.id.toString(),
            planId: subscription.planId,
            localSubscriptionId: result.subscriptionId?.toString() || '',
          },
        };

        const stripeSub = connectOpts
          ? await stripe.subscriptions.create(subParams as any, connectOpts)
          : await stripe.subscriptions.create(subParams as any);

        stripeSubscriptionId = stripeSub.id;

        if (result.subscriptionId) {
          await prisma.subscription.update({
            where: { id: result.subscriptionId },
            data: { stripeSubscriptionId: stripeSub.id },
          });
        }

        logger.info('[PaymentConfirm] Stripe Subscription created', {
          stripeSubscriptionId: stripeSub.id,
          patientId: patient.id,
          planId: subscription.planId,
        });
      } catch (subErr) {
        logger.error('[PaymentConfirm] Failed to create Stripe Subscription (non-blocking)', {
          patientId: patient.id,
          error: subErr instanceof Error ? subErr.message : String(subErr),
        });
      }
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
        isRecurring: !!subscription,
        productSku: subscription?.planId,
        productCategory: subscription?.planName,
      });
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      success: true,
      payment: { ...pendingPayment, status: stripeStatus },
      subscriptionCreated: !!result.subscriptionId,
      stripeSubscriptionId,
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'POST /api/stripe/payments/confirm' });
  }
}

export const POST = withAuth(handlePost);
