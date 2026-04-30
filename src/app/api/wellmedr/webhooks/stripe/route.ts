import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import {
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
import { runWithClinicContext, prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';
import { decryptPHI } from '@/lib/security/phi-encryption';

interface FallbackAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

function decryptEmailSafe(value: string | null | undefined): string {
  const v = value ?? '';
  if (!v) return '';
  try {
    return (decryptPHI(v) ?? v).toLowerCase().trim();
  } catch {
    return v.toLowerCase().trim();
  }
}

async function resolvePatientIdByEmail(
  email: string,
  clinicId: number
): Promise<number | null> {
  const candidates = await prisma.patient.findMany({
    where: {
      clinicId,
      searchIndex: { contains: email, mode: 'insensitive' },
    },
    select: { id: true, email: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const c of candidates) {
    if (decryptEmailSafe(c.email) === email) return c.id;
  }
  return null;
}

function buildFallbackAddressFromMetadata(
  meta: Record<string, unknown>
): FallbackAddress | null {
  const line1 = String(meta.addressLine1 ?? meta.address_line1 ?? '').trim();
  const line2 = String(meta.addressLine2 ?? meta.address_line2 ?? '').trim() || null;
  const city = String(meta.city ?? '').trim();
  const state = String(meta.state ?? '').trim();
  const postal = String(meta.zipCode ?? meta.zip ?? '').trim();
  const country = String(meta.country ?? 'US').trim();
  if (!line1 && !city && !postal) return null;
  return { line1, line2, city, state, postal_code: postal, country };
}

/**
 * Best-effort: look up the most recent Airtable-sourced invoice for this email
 * and pull its shipping address from `metadata.addressLine1/city/state/zipCode`.
 *
 * Rationale: WellMedR's Stripe Connect direct charges almost never carry a
 * shipping address on the PaymentIntent (the checkout collects shipping but
 * doesn't attach it to the PI). Without this fallback, every Stripe Connect
 * event that races ahead of the Airtable Orders automation creates/updates a
 * patient with empty address fields, and the provider Rx queue blocks
 * prescribing with "Address Required". The Airtable webhook stores the parsed
 * address in invoice metadata, so once at least one Airtable invoice exists
 * for this patient we can reuse it on subsequent Stripe events (renewals).
 */
async function findFallbackAddressFromAirtableInvoices(
  email: string,
  clinicId: number
): Promise<FallbackAddress | null> {
  const lower = email.toLowerCase().trim();
  if (!lower) return null;

  try {
    const patientId = await resolvePatientIdByEmail(lower, clinicId);
    if (!patientId) return null;

    const invoice = await prisma.invoice.findFirst({
      where: {
        patientId,
        clinicId,
        metadata: { path: ['source'], equals: 'wellmedr-airtable' },
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });

    if (!invoice?.metadata) return null;
    return buildFallbackAddressFromMetadata(invoice.metadata as Record<string, unknown>);
  } catch (err) {
    logger.warn('[wellmedr/webhook] findFallbackAddressFromAirtableInvoices failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function addressFromStripeShipping(
  shipping: Stripe.PaymentIntent['shipping'] | Stripe.Customer['shipping'] | undefined
): FallbackAddress | null {
  if (!shipping?.address) return null;
  return {
    line1: shipping.address.line1 ?? '',
    line2: shipping.address.line2 ?? null,
    city: shipping.address.city ?? '',
    state: shipping.address.state ?? '',
    postal_code: shipping.address.postal_code ?? '',
    country: shipping.address.country ?? 'US',
  };
}

async function resolveShippingAddress(
  pi: Stripe.PaymentIntent,
  customerObj: Stripe.Customer | null,
  resolvedEmail: string | null,
  clinicId: number
): Promise<FallbackAddress | null> {
  const fromPi = addressFromStripeShipping(pi.shipping);
  if (fromPi) return fromPi;
  const fromCustomer = addressFromStripeShipping(customerObj?.shipping);
  if (fromCustomer) return fromCustomer;
  if (!resolvedEmail) return null;
  const fallback = await findFallbackAddressFromAirtableInvoices(resolvedEmail, clinicId);
  if (fallback) {
    logger.info('[wellmedr/webhook] Backfilled shipping address from prior Airtable invoice', {
      paymentIntentId: pi.id,
      hasLine1: !!fallback.line1,
      hasCity: !!fallback.city,
      hasZip: !!fallback.postal_code,
    });
  }
  return fallback;
}

const IDEMPOTENCY_NS = 'wh-idem';
const IDEMPOTENCY_TTL = 86_400; // 24 hours

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
    Sentry.captureException(err, {
      tags: { module: 'wellmedr-checkout', route: 'webhooks-stripe' },
    });
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  // Durable idempotency: check if already fully processed
  const processedKey = `evt:${event.id}`;
  const lockKey = `lock:${event.id}`;
  const alreadyProcessed = await cache.exists(processedKey, { namespace: IDEMPOTENCY_NS });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Acquire short-TTL lock to prevent parallel processing from Stripe retries
  const lockHeld = await cache.get(lockKey, { namespace: IDEMPOTENCY_NS });
  if (lockHeld) {
    return NextResponse.json({ received: true, processing: true });
  }
  await cache.set(lockKey, 1, { namespace: IDEMPOTENCY_NS, ttl: 300 });

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          await updateOrderPaymentStatus(subscriptionId, 'succeeded');
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          await updateOrderPaymentStatus(subscriptionId, 'failed');
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const status =
          subscription.status === 'active'
            ? 'succeeded'
            : subscription.status === 'past_due'
              ? 'failed'
              : subscription.status;
        await updateOrderSubscriptionStatus(subscription.id, status);

        if (subscription.metadata?.selectedAddons) {
          try {
            const addons = JSON.parse(subscription.metadata.selectedAddons);
            if (Array.isArray(addons)) {
              await updateOrderAddonMetadata(subscription.id, addons);
            }
          } catch (parseErr) {
            Sentry.captureMessage('webhook: Failed to parse selectedAddons metadata', 'warning');
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await updateOrderStatus(subscription.id, 'cancelled');
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
        if (customerId) {
          // --- Redis order-store update ---
          const order = await findOrderByCustomerId(customerId);
          if (order) {
            await updateOrderPaymentStatus(order.subscriptionId, 'succeeded');
            if (pi.payment_method) {
              const pm = await stripe.paymentMethods.retrieve(
                typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method.id,
                {},
                connectOpts as any
              );
              await updateOrderPaymentDetails(order.subscriptionId, {
                paymentMethodType: pm.type,
                cardBrand: pm.card?.brand,
                cardLast4: pm.card?.last4,
              });
            }
          }

          // --- Attentive purchase event (non-blocking) ---
          let resolvedEmail = pi.receipt_email || pi.metadata?.email || null;

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
              productName: pi.metadata?.productName || 'WellMedR Product',
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
            const { processStripePayment } =
              await import('@/services/stripe/paymentMatchingService');
            type StripePaymentData =
              import('@/services/stripe/paymentMatchingService').StripePaymentData;

            const customerName = customerObj?.name || pi.metadata?.cardholderName || '';
            const customerPhone =
              customerObj?.phone || pi.metadata?.phone || pi.shipping?.phone || '';

            // Three-tier shipping address fallback. See `resolveShippingAddress`.
            const resolvedAddress = await resolveShippingAddress(
              pi,
              customerObj,
              resolvedEmail,
              clinicId
            );

            const paymentData: StripePaymentData = {
              customerId,
              email: resolvedEmail,
              name: customerName,
              phone: customerPhone,
              amount: pi.amount,
              currency: pi.currency || 'usd',
              description:
                pi.description || `WellMedR ${pi.metadata?.productName || 'Subscription'}`,
              paymentIntentId: pi.id,
              chargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
              stripeInvoiceId: null,
              metadata: {
                ...pi.metadata,
                clinicId: String(clinicId),
                source: 'wellmedr-checkout',
              } as Record<string, string>,
              paidAt: new Date(),
              address: resolvedAddress,
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
                throw new Error(`processStripePayment failed: ${result.error}`);
              }
            });
          } catch (processErr) {
            Sentry.captureException(processErr, {
              tags: { module: 'wellmedr-checkout', route: 'webhooks-stripe-processPayment' },
              extra: { paymentIntentId: pi.id, customerId },
            });
            logger.error(
              '[wellmedr/webhook] processStripePayment error — will return 500 for retry',
              {
                error: processErr instanceof Error ? processErr.message : 'Unknown',
                paymentIntentId: pi.id,
              }
            );
            throw processErr;
          }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
        if (customerId) {
          const order = await findOrderByCustomerId(customerId);
          if (order) await updateOrderPaymentStatus(order.subscriptionId, 'failed');
        }
        break;
      }
    }
  } catch (error) {
    // Release lock so Stripe can retry this event
    await cache.delete(lockKey, { namespace: IDEMPOTENCY_NS }).catch(() => {});

    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'webhooks-stripe' },
      extra: { eventType: event.type, eventId: event.id },
    });

    const critical = event.type === 'payment_intent.succeeded';
    if (critical) {
      return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true, error: 'non-critical handler failed' });
  }

  // Mark fully processed only after success — allows retries on failure
  await cache.set(processedKey, 1, { namespace: IDEMPOTENCY_NS, ttl: IDEMPOTENCY_TTL });
  await cache.delete(lockKey, { namespace: IDEMPOTENCY_NS }).catch(() => {});

  return NextResponse.json({ received: true });
}
