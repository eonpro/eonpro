import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PaymentStatus } from '@prisma/client';
import crypto from 'crypto';
import { processPaymentForCommission } from '@/services/affiliate/affiliateCommissionService';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { handleApiError } from '@/domains/shared/errors';
import { getStripeForClinic, getDedicatedAccountPublishableKey } from '@/lib/stripe/connect';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { StripeCustomerService } from '@/services/stripe/customerService';

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

import type Stripe from 'stripe';

/**
 * Finds an existing Stripe Price that matches the plan, or creates a new
 * Product + Price pair. Uses plan ID as lookup key for idempotency.
 */
async function getOrCreateStripePrice(
  stripe: Stripe,
  sub: SubscriptionInfo,
  amountCents: number,
  stripeAccountId?: string | null,
) {
  const connectOpts = stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;

  // Try to find existing price by lookup_key (our planId)
  const listParams = { lookup_keys: [sub.planId], limit: 1 };
  const existing = connectOpts
    ? await stripe.prices.list(listParams, connectOpts)
    : await stripe.prices.list(listParams);

  if (existing.data.length > 0) return existing.data[0];

  // Create a product + price
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

      const stripeContext = await getStripeForClinic(patient.clinicId);
      const stripe = stripeContext.stripe;

      // Ensure Stripe customer exists
      let stripeCustomerId = patient.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await StripeCustomerService.getOrCreateCustomer(patient.id);
        stripeCustomerId = customer.id;
      }

      // If local card has no Stripe link, create an unconfirmed PaymentIntent
      // and return clientSecret so the frontend can confirm via Stripe.js
      if (!stripePaymentMethodId && localPaymentMethodId) {
        const intentParams: Record<string, unknown> = {
          amount,
          currency: 'usd',
          customer: stripeCustomerId,
          description,
          setup_future_usage: 'off_session',
          metadata: {
            patientId: patient.id.toString(),
            localPaymentMethodId: localPaymentMethodId.toString(),
            cardLast4,
            cardBrand,
          },
        };

        const connectOpts = stripeContext.stripeAccountId
          ? { stripeAccount: stripeContext.stripeAccountId }
          : undefined;

        const intent = connectOpts
          ? await stripe.paymentIntents.create(intentParams as any, connectOpts)
          : await stripe.paymentIntents.create(intentParams as any);

        // Create a PENDING payment record with full subscription data for the confirm step
        await prisma.payment.create({
          data: {
            patientId: patient.id,
            amount,
            status: PaymentStatus.PENDING,
            paymentMethod: `Card ending ${cardLast4}`,
            description,
            notes,
            stripePaymentIntentId: intent.id,
            metadata: {
              cardBrand,
              localPaymentMethodId,
              requiresStripeConfirmation: true,
              subscription: subscription || null,
            } as any,
          },
        });

        // Resolve the correct publishable key for this clinic's Stripe account
        const clinic = await prisma.clinic.findUnique({
          where: { id: patient.clinicId },
          select: { subdomain: true },
        });
        const clinicPk = clinic?.subdomain
          ? getDedicatedAccountPublishableKey(clinic.subdomain)
          : undefined;

        return NextResponse.json({
          requiresStripeConfirmation: true,
          clientSecret: intent.client_secret,
          paymentIntentId: intent.id,
          localPaymentMethodId,
          stripePublishableKey: clinicPk || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
          stripeConnectedAccountId: stripeContext.stripeAccountId || null,
        });
      }

      if (!stripePaymentMethodId) {
        return NextResponse.json(
          { error: 'Unable to resolve a payment method. Please add a new card.' },
          { status: 400 }
        );
      }

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
          customer: stripeCustomerId,
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

      // Update payment record, create local + Stripe subscription inside a transaction
      let stripeSubscriptionId: string | null = null;
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

      // Create a real Stripe Subscription for recurring plans
      if (subscription && stripeStatus === PaymentStatus.SUCCEEDED && stripePaymentMethodId && stripeCustomerId) {
        try {
          const subscriptionInfo = subscription as SubscriptionInfo;
          const stripePrice = await getOrCreateStripePrice(
            stripe,
            subscriptionInfo,
            amount,
            stripeContext.stripeAccountId
          );

          const subParams: Record<string, unknown> = {
            customer: stripeCustomerId,
            items: [{ price: stripePrice.id }],
            default_payment_method: stripePaymentMethodId,
            metadata: {
              patientId: patient.id.toString(),
              planId: subscriptionInfo.planId,
              localSubscriptionId: result.subscriptionId?.toString() || '',
            },
          };

          const connectSubOpts = stripeContext.stripeAccountId
            ? { stripeAccount: stripeContext.stripeAccountId }
            : undefined;

          const stripeSub = connectSubOpts
            ? await stripe.subscriptions.create(subParams as any, connectSubOpts)
            : await stripe.subscriptions.create(subParams as any);

          stripeSubscriptionId = stripeSub.id;

          if (result.subscriptionId) {
            await prisma.subscription.update({
              where: { id: result.subscriptionId },
              data: { stripeSubscriptionId: stripeSub.id },
            });
          }

          logger.info('[PaymentProcess] Stripe Subscription created', {
            stripeSubscriptionId: stripeSub.id,
            patientId: patient.id,
            planId: subscriptionInfo.planId,
          });
        } catch (subErr) {
          logger.error('[PaymentProcess] Failed to create Stripe Subscription (non-blocking)', {
            patientId: patient.id,
            error: subErr instanceof Error ? subErr.message : String(subErr),
          });
        }
      }

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

    // --- New card path: charge via Stripe (never record SUCCEEDED without Stripe) ---
    // Raw card details cannot be sent to Stripe server-side (PCI). Create an unconfirmed
    // PaymentIntent and return clientSecret so the frontend confirms via Stripe.js.
    const { saveCard } = (paymentDetails || {}) as Partial<PaymentDetails>;

    let stripeCustomerId = patient.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await StripeCustomerService.getOrCreateCustomer(patient.id);
      stripeCustomerId = customer.id;
    }

    const stripeContext = await getStripeForClinic(patient.clinicId);
    const stripe = stripeContext.stripe;
    const connectOpts = stripeContext.stripeAccountId
      ? { stripeAccount: stripeContext.stripeAccountId }
      : undefined;

    const intentParams: Record<string, unknown> = {
      amount,
      currency: 'usd',
      customer: stripeCustomerId,
      description,
      setup_future_usage: saveCard || subscription ? 'off_session' : undefined,
      metadata: {
        patientId: patient.id.toString(),
        saveCard: saveCard === true ? 'true' : 'false',
        ...(subscription
          ? {
              subscription: JSON.stringify({
                planId: subscription.planId,
                planName: subscription.planName,
                interval: subscription.interval,
                intervalCount: subscription.intervalCount,
              }),
            }
          : {}),
      },
    };

    const intent = connectOpts
      ? await stripe.paymentIntents.create(intentParams as any, connectOpts)
      : await stripe.paymentIntents.create(intentParams as any);

    await prisma.payment.create({
      data: {
        patientId: patient.id,
        amount,
        status: PaymentStatus.PENDING,
        paymentMethod: 'Card (to be confirmed)',
        description,
        notes,
        stripePaymentIntentId: intent.id,
        metadata: {
          saveCard: saveCard === true,
          subscription: subscription || null,
          newCardFlow: true,
        } as any,
      },
    });

    const clinic = await prisma.clinic.findUnique({
      where: { id: patient.clinicId },
      select: { subdomain: true },
    });
    const clinicPk = clinic?.subdomain
      ? getDedicatedAccountPublishableKey(clinic.subdomain)
      : undefined;

    return NextResponse.json({
      requiresStripeConfirmation: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      localPaymentMethodId: null,
      stripePublishableKey: clinicPk || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      stripeConnectedAccountId: stripeContext.stripeAccountId || null,
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'POST /api/stripe/payments/process' });
  }
}

export const POST = withAuth(handlePost);
