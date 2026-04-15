import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import {
  findOrderBySubscriptionId,
  findOrderByCustomerId,
  updateOrderPaymentStatus,
  updateOrderSubscriptionStatus,
  updateOrderStatus,
  updateOrderPaymentDetails,
  updateOrderAddonMetadata,
} from '@/app/wellmedr-checkout/lib/order-store';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
  getWellMedrConnectWebhookSecret,
} from '@/app/wellmedr-checkout/lib/stripe-connect';

/** Stripe SDK v20 types omit `subscription` on Invoice; runtime webhook payloads still include it. */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const sub = (invoice as unknown as { subscription?: string | Stripe.Subscription | null })
    .subscription;
  return typeof sub === 'string' ? sub : sub?.id;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const stripe = getWellMedrConnectStripe();
  const connectOpts = getWellMedrConnectOpts();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, getWellMedrConnectWebhookSecret());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('[wellmedr/webhooks/stripe]', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const order = await findOrderBySubscriptionId(subscriptionId);
          if (order) await updateOrderPaymentStatus(order.id, 'succeeded');
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const order = await findOrderBySubscriptionId(subscriptionId);
          if (order) await updateOrderPaymentStatus(order.id, 'failed');
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const order = await findOrderBySubscriptionId(subscription.id);
        if (order) {
          const status =
            subscription.status === 'active'
              ? 'succeeded'
              : subscription.status === 'past_due'
                ? 'failed'
                : subscription.status;
          await updateOrderSubscriptionStatus(order.id, status);

          // Capture addon metadata from subscription
          if (subscription.metadata?.selectedAddons) {
            try {
              const addons = JSON.parse(subscription.metadata.selectedAddons);
              if (Array.isArray(addons)) {
                await updateOrderAddonMetadata(order.id, addons);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const order = await findOrderBySubscriptionId(subscription.id);
        if (order) await updateOrderStatus(order.id, 'cancelled');
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
        if (customerId) {
          const order = await findOrderByCustomerId(customerId);
          if (order) {
            await updateOrderPaymentStatus(order.id, 'succeeded');
            if (pi.payment_method) {
              const pm = await stripe.paymentMethods.retrieve(
                typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method.id,
                {},
                connectOpts as any
              );
              await updateOrderPaymentDetails(order.id, {
                paymentMethodType: pm.type,
                cardBrand: pm.card?.brand,
                cardLast4: pm.card?.last4,
              });
            }
          }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
        if (customerId) {
          const order = await findOrderByCustomerId(customerId);
          if (order) await updateOrderPaymentStatus(order.id, 'failed');
        }
        break;
      }
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'webhooks-stripe' },
      extra: { eventType: event.type, eventId: event.id },
    });
  }

  return NextResponse.json({ received: true });
}
