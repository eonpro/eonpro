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
import { sendPurchaseEvent } from '@/lib/wellmedr/attentive';
import { runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Stripe SDK v20 types omit `subscription` on Invoice; runtime webhook payloads still include it. */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const sub = (invoice as unknown as { subscription?: string | Stripe.Subscription | null })
    .subscription;
  return typeof sub === 'string' ? sub : sub?.id;
}

const processedEvents = new Set<string>();

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
    Sentry.captureException(err, {
      tags: { module: 'wellmedr-checkout', route: 'webhooks-stripe' },
    });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // In-process idempotency guard: skip duplicate event IDs within this instance
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  processedEvents.add(event.id);
  // Cap the set size to prevent memory leaks
  if (processedEvents.size > 10_000) {
    const first = processedEvents.values().next().value;
    if (first) processedEvents.delete(first);
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
          // --- In-memory order-store update (backward compat) ---
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

          // --- Attentive purchase event (non-blocking) ---
          let resolvedEmail =
            pi.receipt_email ||
            pi.metadata?.email ||
            null;

          // Resolve customer data from Connect account for patient matching
          let customerObj: Stripe.Customer | null = null;
          try {
            const retrieved = await stripe.customers.retrieve(customerId, {}, connectOpts as any);
            if (!(retrieved as Stripe.DeletedCustomer).deleted) {
              customerObj = retrieved as Stripe.Customer;
              if (!resolvedEmail) resolvedEmail = customerObj.email;
            }
          } catch (custErr) {
            logger.warn('[wellmedr/webhook] Failed to retrieve Connect customer', {
              customerId,
              error: custErr instanceof Error ? custErr.message : 'Unknown',
            });
          }

          if (resolvedEmail) {
            sendPurchaseEvent({
              email: resolvedEmail,
              phone: pi.shipping?.phone || pi.metadata?.phone || '',
              productId: pi.metadata?.productId || '',
              productName: pi.metadata?.productName || pi.metadata?.productName || 'WellMedR Product',
              productPrice: pi.amount / 100,
              currency: pi.currency?.toUpperCase() || 'USD',
              orderId: pi.id,
            }).catch((err) =>
              Sentry.captureException(err, {
                tags: { module: 'wellmedr-checkout', route: 'webhooks-stripe-attentive' },
              })
            );
          }

          // --- CRITICAL: Create PAID Invoice in platform DB for provider Rx queue ---
          try {
            const clinicId = parseInt(process.env.WELLMEDR_CLINIC_ID || '7', 10);

            // Build StripePaymentData manually (charges live on Connect account,
            // so extractPaymentDataFromPaymentIntent would fail using platform Stripe client)
            const { processStripePayment } = await import(
              '@/services/stripe/paymentMatchingService'
            );
            type StripePaymentData = import('@/services/stripe/paymentMatchingService').StripePaymentData;

            const customerName = customerObj?.name || pi.metadata?.cardholderName || '';
            const customerPhone = customerObj?.phone || pi.metadata?.phone || pi.shipping?.phone || '';

            const paymentData: StripePaymentData = {
              customerId,
              email: resolvedEmail,
              name: customerName,
              phone: customerPhone,
              amount: pi.amount,
              currency: pi.currency || 'usd',
              description: pi.description || `WellMedR ${pi.metadata?.productName || 'Subscription'}`,
              paymentIntentId: pi.id,
              chargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
              stripeInvoiceId: null,
              metadata: {
                ...pi.metadata,
                clinicId: String(clinicId),
                source: 'wellmedr-checkout',
              } as Record<string, string>,
              paidAt: new Date(),
              address: pi.shipping?.address
                ? {
                    line1: pi.shipping.address.line1,
                    line2: pi.shipping.address.line2,
                    city: pi.shipping.address.city,
                    state: pi.shipping.address.state,
                    postal_code: pi.shipping.address.postal_code,
                    country: pi.shipping.address.country,
                  }
                : customerObj?.shipping?.address
                  ? {
                      line1: customerObj.shipping.address.line1,
                      line2: customerObj.shipping.address.line2,
                      city: customerObj.shipping.address.city,
                      state: customerObj.shipping.address.state,
                      postal_code: customerObj.shipping.address.postal_code,
                      country: customerObj.shipping.address.country,
                    }
                  : null,
            };

            await runWithClinicContext(clinicId, async () => {
              const result = await processStripePayment(paymentData, event.id, event.type);
              if (result.success) {
                logger.info('[wellmedr/webhook] processStripePayment succeeded', {
                  patientId: result.patient?.id,
                  invoiceId: result.invoice?.id,
                  patientCreated: result.patientCreated,
                });
              } else {
                logger.error('[wellmedr/webhook] processStripePayment failed', {
                  error: result.error,
                  paymentIntentId: pi.id,
                });
              }
            });
          } catch (processErr) {
            // Non-blocking: order-store and Airtable are fallback records
            Sentry.captureException(processErr, {
              tags: { module: 'wellmedr-checkout', route: 'webhooks-stripe-processPayment' },
              extra: { paymentIntentId: pi.id, customerId },
            });
            logger.error('[wellmedr/webhook] processStripePayment error (non-blocking)', {
              error: processErr instanceof Error ? processErr.message : 'Unknown',
              paymentIntentId: pi.id,
            });
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
