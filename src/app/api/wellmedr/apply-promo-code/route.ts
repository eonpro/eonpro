import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, promotionCodeId } = await req.json();

    if (!subscriptionId) {
      return NextResponse.json({ error: 'Subscription ID is required' }, { status: 400 });
    }

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, connectOpts as any);

    if (subscription.status !== 'incomplete') {
      return NextResponse.json({ error: 'Can only modify incomplete subscriptions' }, { status: 400 });
    }

    const updateParams: Stripe.SubscriptionUpdateParams = promotionCodeId
      ? { discounts: [{ promotion_code: promotionCodeId }] }
      : { discounts: [] };

    const updated = await stripe.subscriptions.update(subscriptionId, {
      ...updateParams,
      expand: ['latest_invoice'],
    }, connectOpts);

    if (updated.status === 'active') {
      return NextResponse.json({ success: true, status: 'active' });
    }

    let clientSecret: string | null = null;
    const latestInvoice = updated.latest_invoice as Stripe.Invoice;
    if (latestInvoice?.id) {
      const invoicePayments = await stripe.invoicePayments.list({ invoice: latestInvoice.id, limit: 1 }, connectOpts);
      if (invoicePayments.data.length > 0) {
        const paymentRecord = invoicePayments.data[0];
        if (paymentRecord.payment?.type === 'payment_intent') {
          const piId = (paymentRecord.payment as { type: 'payment_intent'; payment_intent: string }).payment_intent;
          const pi = await stripe.paymentIntents.retrieve(piId, {}, connectOpts as any);
          clientSecret = pi.client_secret;
        }
      }
    }

    if (!clientSecret) {
      const customer = typeof updated.customer === 'string' ? updated.customer : updated.customer.id;
      const paymentIntents = await stripe.paymentIntents.list({
        customer,
        limit: 5,
        created: { gte: Math.floor(Date.now() / 1000) - 3600 },
      }, connectOpts);

      const validPi = paymentIntents.data.find(
        (pi) => ['requires_confirmation', 'requires_payment_method', 'requires_action'].includes(pi.status)
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
    const msg = error instanceof Error ? error.message : 'Internal error';
    console.error('[wellmedr/apply-promo-code]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
