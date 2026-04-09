import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PaymentStatus } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getStripeForClinic } from '@/lib/stripe/connect';
import type Stripe from 'stripe';
import { processPaymentForCommission } from '@/services/affiliate/affiliateCommissionService';
import { createInvoiceForProcessedPayment } from '@/services/billing/createInvoiceForPayment';
import { logger } from '@/lib/logger';
import {
  SubscriptionInfo,
  computeNextBillingUnix,
  getOrCreateStripePrice,
} from '@/services/stripe/subscriptionHelpers';

async function handlePost(request: NextRequest, _user: AuthUser) {
  try {
    const { paymentIntentId, stripePaymentMethodId, localPaymentMethodId } = await request.json();

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'paymentIntentId is required' }, { status: 400 });
    }

    const existingPayment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!existingPayment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Idempotent: if the webhook already confirmed this payment, return success
    if (existingPayment.status === PaymentStatus.SUCCEEDED) {
      return NextResponse.json({
        success: true,
        payment: existingPayment,
        subscriptionCreated: !!existingPayment.subscriptionId,
        alreadyConfirmed: true,
      });
    }

    if (existingPayment.status !== PaymentStatus.PENDING) {
      return NextResponse.json(
        { error: `Payment is ${existingPayment.status.toLowerCase()}, cannot confirm` },
        { status: 409 },
      );
    }

    const pendingPayment = existingPayment;

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

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {}, connectOpts as any);

    const stripeStatus = intent.status === 'succeeded'
      ? PaymentStatus.SUCCEEDED
      : intent.status === 'processing'
        ? PaymentStatus.PROCESSING
        : PaymentStatus.FAILED;

    const paymentMeta = (pendingPayment.metadata as Record<string, unknown>) || {};
    const rawSubscriptions = paymentMeta.subscriptions as SubscriptionInfo[] | null;
    const singleSubscription = paymentMeta.subscription as SubscriptionInfo | null;
    const subscriptions: SubscriptionInfo[] = rawSubscriptions
      ? rawSubscriptions
      : singleSubscription
        ? [singleSubscription]
        : [];
    const lineItems = paymentMeta.lineItems as Array<{ description: string; amount: number; planId?: string }> | undefined;

    let parsedLocalPmId = localPaymentMethodId ? parseInt(String(localPaymentMethodId)) : null;

    // Always persist card to the local PaymentMethod table when we have a
    // stripePaymentMethodId and no local record yet. The PaymentIntent is created
    // with setup_future_usage: 'off_session' so Stripe keeps the card regardless —
    // we must keep our DB in sync so staff can see/reuse it.
    if (stripePaymentMethodId && !parsedLocalPmId) {
      try {
        // Check if this Stripe PM already exists locally (e.g. from webhook race)
        const existingPm = await prisma.paymentMethod.findFirst({
          where: { stripePaymentMethodId, patientId: patient.id },
          select: { id: true, isActive: true },
        });

        if (existingPm) {
          if (!existingPm.isActive) {
            await prisma.paymentMethod.update({
              where: { id: existingPm.id },
              data: { isActive: true, lastUsedAt: new Date() },
            });
          }
          parsedLocalPmId = existingPm.id;
        } else {
          const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId, {}, connectOpts as any);
          const last4 = (pm as Stripe.PaymentMethod).card?.last4 ?? '????';
          const brand = (pm as Stripe.PaymentMethod).card?.brand
            ? String((pm as Stripe.PaymentMethod).card?.brand).charAt(0).toUpperCase() +
              String((pm as Stripe.PaymentMethod).card?.brand).slice(1)
            : 'Unknown';

          const patientPaymentMethods = await prisma.paymentMethod.count({
            where: { patientId: patient.id, isActive: true },
          });

          const stripePm = pm as Stripe.PaymentMethod;
          const created = await prisma.paymentMethod.create({
            data: {
              patientId: patient.id,
              clinicId: patient.clinicId,
              stripePaymentMethodId,
              cardLast4: last4,
              cardBrand: brand,
              expiryMonth: stripePm.card?.exp_month,
              expiryYear: stripePm.card?.exp_year,
              cardholderName: stripePm.billing_details?.name ?? undefined,
              billingZip: stripePm.billing_details?.address?.postal_code ?? undefined,
              isDefault: patientPaymentMethods === 0,
              isActive: true,
              lastUsedAt: new Date(),
            },
          });
          parsedLocalPmId = created.id;

          logger.info('[PaymentConfirm] Saved card to local PaymentMethod', {
            patientId: patient.id,
            paymentMethodId: created.id,
            stripePaymentMethodId,
          });
        }
      } catch (createErr) {
        logger.error('[PaymentConfirm] Failed to persist card to PaymentMethod table', {
          patientId: patient.id,
          stripePaymentMethodId,
          error: createErr instanceof Error ? createErr.message : String(createErr),
        });
      }
    }

    // Link the Stripe PaymentMethod to an existing local record when both are provided
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

    const result = await prisma.$transaction(async (tx) => {
      const createdSubIds: number[] = [];

      const pmForDisplay =
        parsedLocalPmId != null
          ? await tx.paymentMethod.findUnique({
              where: { id: parsedLocalPmId },
              select: { cardLast4: true },
            })
          : null;

      await tx.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: stripeStatus,
          stripeChargeId: intent.latest_charge?.toString(),
          ...(pmForDisplay?.cardLast4
            ? { paymentMethod: `Card ending ${pmForDisplay.cardLast4}` }
            : {}),
        },
      });

      if (subscriptions.length > 0 && stripeStatus === PaymentStatus.SUCCEEDED) {
        const now = new Date();
        const tagsToAdd: string[] = [];

        for (const sub of subscriptions) {
          const periodEnd = new Date(now);
          const totalMonths = sub.intervalCount *
            (sub.interval === 'year' ? 12 : sub.interval === 'month' ? 1 : 1);
          periodEnd.setMonth(periodEnd.getMonth() + (totalMonths || 1));

          const itemAmount = (sub as any).amountCents || pendingPayment.amount;
          const subscriptionRecurringAmount = sub.discountMode === 'first_only' && sub.catalogAmountCents
            ? sub.catalogAmountCents
            : itemAmount;

          const createdSubscription = await tx.subscription.create({
            data: {
              patientId: patient.id,
              planId: sub.planId,
              planName: sub.planName,
              planDescription: pendingPayment.description || '',
              amount: subscriptionRecurringAmount,
              interval: sub.interval,
              intervalCount: sub.intervalCount,
              startDate: now,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              nextBillingDate: periodEnd,
              ...(parsedLocalPmId != null ? { paymentMethodId: parsedLocalPmId } : {}),
              ...(sub.discountMode && itemAmount !== subscriptionRecurringAmount ? {
                metadata: {
                  discountMode: sub.discountMode,
                  firstPaymentAmount: itemAmount,
                  catalogAmount: sub.catalogAmountCents,
                },
              } : {}),
            },
          });

          createdSubIds.push(createdSubscription.id);
          tagsToAdd.push(`subscription-${sub.planName.toLowerCase().replace(/\s+/g, '-')}`);
        }

        if (createdSubIds.length > 0) {
          await tx.payment.update({
            where: { id: pendingPayment.id },
            data: {
              subscriptionId: createdSubIds[0],
              ...(createdSubIds.length > 1 ? {
                metadata: {
                  ...(paymentMeta || {}),
                  allSubscriptionIds: createdSubIds,
                },
              } : {}),
            },
          });
        }

        const currentTags = (patient.tags as string[]) || [];
        const newTags = [...currentTags];
        for (const tag of tagsToAdd) {
          if (!newTags.includes(tag)) newTags.push(tag);
        }
        if (!newTags.includes('active-subscription')) newTags.push('active-subscription');
        if (newTags.length !== currentTags.length) {
          await tx.patient.update({
            where: { id: patient.id },
            data: { tags: newTags },
          });
        }
      }

      return { subscriptionId: createdSubIds[0] || null, allSubscriptionIds: createdSubIds };
    }, { timeout: 15000 });

    if (stripeStatus !== PaymentStatus.SUCCEEDED) {
      return NextResponse.json(
        { error: `Payment ${intent.status}. Please try again.` },
        { status: 402 }
      );
    }

    await createInvoiceForProcessedPayment({
      paymentId: pendingPayment.id,
      patientId: patient.id,
      clinicId: patient.clinicId,
      amount: pendingPayment.amount,
      description: pendingPayment.description || 'Payment',
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: intent.latest_charge?.toString(),
      planId: subscriptions[0]?.planId,
      planName: subscriptions[0]?.planName,
      lineItems: lineItems || undefined,
    });

    // Create real Stripe Subscriptions for recurring plans
    const stripeSubscriptionIds: string[] = [];
    if (subscriptions.length > 0 && stripePaymentMethodId && patient.stripeCustomerId) {
      for (let i = 0; i < subscriptions.length; i++) {
        const sub = subscriptions[i];
        const localSubId = result.allSubscriptionIds[i];
        try {
          const itemAmount = (sub as any).amountCents || pendingPayment.amount;
          const recurringAmount = sub.discountMode === 'first_only' && sub.catalogAmountCents
            ? sub.catalogAmountCents
            : itemAmount;
          const stripePrice = await getOrCreateStripePrice(
            stripe,
            sub,
            recurringAmount,
            stripeContext.stripeAccountId,
          );

          const subParams: Record<string, unknown> = {
            customer: patient.stripeCustomerId,
            items: [{ price: stripePrice.id }],
            default_payment_method: stripePaymentMethodId,
            trial_end: computeNextBillingUnix(sub.interval, sub.intervalCount),
            metadata: {
              patientId: patient.id.toString(),
              planId: sub.planId,
              localSubscriptionId: localSubId?.toString() || '',
            },
          };

          const stripeSub = connectOpts
            ? await stripe.subscriptions.create(subParams as any, connectOpts)
            : await stripe.subscriptions.create(subParams as any);

          stripeSubscriptionIds.push(stripeSub.id);

          if (localSubId) {
            await prisma.subscription.update({
              where: { id: localSubId },
              data: { stripeSubscriptionId: stripeSub.id },
            });
          }

          logger.info('[PaymentConfirm] Stripe Subscription created', {
            stripeSubscriptionId: stripeSub.id,
            patientId: patient.id,
            planId: sub.planId,
            subscriptionIndex: i + 1,
            totalSubscriptions: subscriptions.length,
          });
        } catch (subErr) {
          logger.error('[PaymentConfirm] Failed to create Stripe Subscription (non-blocking)', {
            patientId: patient.id,
            planId: sub.planId,
            subscriptionIndex: i + 1,
            error: subErr instanceof Error ? subErr.message : String(subErr),
          });
        }
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
        isRecurring: subscriptions.length > 0,
        productSku: subscriptions[0]?.planId,
        productCategory: subscriptions[0]?.planName,
      });
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      success: true,
      payment: { ...pendingPayment, status: stripeStatus },
      subscriptionCreated: result.allSubscriptionIds.length > 0,
      subscriptionsCreated: result.allSubscriptionIds.length,
      stripeSubscriptionIds,
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'POST /api/stripe/payments/confirm' });
  }
}

export const POST = withAuth(handlePost);
