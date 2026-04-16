import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const applyPromoSchema = z.object({
  subscriptionId: z.string().min(1).max(200).startsWith('sub_'),
  promotionCodeId: z.string().max(200).optional(),
  customerEmail: z.string().email().max(254),
});

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = applyPromoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { subscriptionId, promotionCodeId, customerEmail } = parsed.data;

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ['customer'] },
      connectOpts
    );

    // Verify caller owns this subscription
    const subCustomer = subscription.customer;
    const customerObj = typeof subCustomer === 'string'
      ? await stripe.customers.retrieve(subCustomer, {}, connectOpts)
      : subCustomer;
    if (
      !customerObj ||
      (customerObj as Stripe.DeletedCustomer).deleted ||
      (customerObj as Stripe.Customer).email?.toLowerCase() !== customerEmail.toLowerCase()
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (subscription.status !== 'incomplete') {
      return NextResponse.json(
        { error: 'Can only modify incomplete subscriptions' },
        { status: 400 }
      );
    }

    const updateParams: Stripe.SubscriptionUpdateParams = promotionCodeId
      ? { discounts: [{ promotion_code: promotionCodeId }] }
      : { discounts: [] };

    const updated = await stripe.subscriptions.update(
      subscriptionId,
      {
        ...updateParams,
        expand: ['latest_invoice'],
      },
      connectOpts
    );

    if (updated.status === 'active') {
      return NextResponse.json({ success: true, status: 'active' });
    }

    let clientSecret: string | null = null;
    const latestInvoice = updated.latest_invoice as Stripe.Invoice;
    if (latestInvoice?.id) {
      const invoicePayments = await stripe.invoicePayments.list(
        { invoice: latestInvoice.id, limit: 1 },
        connectOpts
      );
      if (invoicePayments.data.length > 0) {
        const paymentRecord = invoicePayments.data[0];
        if (paymentRecord.payment?.type === 'payment_intent') {
          const piId = (paymentRecord.payment as { type: 'payment_intent'; payment_intent: string })
            .payment_intent;
          const pi = await stripe.paymentIntents.retrieve(piId, {}, connectOpts);
          clientSecret = pi.client_secret;
        }
      }
    }

    if (!clientSecret) {
      const customer =
        typeof updated.customer === 'string' ? updated.customer : updated.customer.id;
      const paymentIntents = await stripe.paymentIntents.list(
        {
          customer,
          limit: 5,
          created: { gte: Math.floor(Date.now() / 1000) - 3600 },
        },
        connectOpts
      );

      const validPi = paymentIntents.data.find((pi) =>
        ['requires_confirmation', 'requires_payment_method', 'requires_action'].includes(pi.status)
      );
      if (validPi) {
        clientSecret = validPi.client_secret;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        clientSecret,
        status: updated.status,
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'apply-promo-code' },
    });
    logger.error('[apply-promo-code] Error', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Failed to apply promo code' }, { status: 500 });
  }
}

export const POST = rateLimit({ max: 10, windowMs: 60_000 })(handler);
