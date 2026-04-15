import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { prisma, runWithClinicContext } from '@/lib/db';

const webhookSecret =
  process.env.EONMEDS_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
const stripeSecret = process.env.EONMEDS_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2026-03-25.dahlia' }) : null;

function getEonmedsClinicId(): number {
  const raw = process.env.DEFAULT_CLINIC_ID;
  if (!raw) return 3;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n <= 0 ? 3 : n;
}

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    logger.error('[EONMeds Webhook] Stripe not configured');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    logger.error('[EONMeds Webhook] Signature verification failed:', { error: err.message });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const clinicId = getEonmedsClinicId();

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        logger.info('[EONMeds Webhook] Payment succeeded — processing', {
          paymentIntentId: pi.id,
          amount: pi.amount,
          medication: pi.metadata?.medication,
          plan: pi.metadata?.plan,
          clinicId,
        });

        // Skip invoice-linked payments (handled separately)
        const piInvoice = (pi as Stripe.PaymentIntent & { invoice?: string | null }).invoice;
        if (piInvoice) {
          logger.info('[EONMeds Webhook] Skipping — has associated Stripe invoice', {
            paymentIntentId: pi.id,
          });
          break;
        }

        // Skip Process Payment form payments (they handle their own invoice creation)
        if (pi.metadata?.paymentId) {
          logger.info('[EONMeds Webhook] Skipping — Process Payment form payment', {
            paymentIntentId: pi.id,
            paymentId: pi.metadata.paymentId,
          });
          break;
        }

        // Idempotency: check if the main webhook already processed this event
        const idempotencyKey = `stripe:${clinicId}:${event.id}`;
        const existingIdem = await prisma.idempotencyRecord.findUnique({
          where: { key: idempotencyKey },
        });
        if (existingIdem) {
          logger.info('[EONMeds Webhook] Already processed by main webhook — skipping', {
            paymentIntentId: pi.id,
            eventId: event.id,
          });
          break;
        }

        // Also check PaymentReconciliation for this event
        const existingRecon = await prisma.paymentReconciliation.findUnique({
          where: { stripeEventId: event.id },
        });
        if (existingRecon) {
          logger.info('[EONMeds Webhook] Already reconciled — skipping', {
            paymentIntentId: pi.id,
            eventId: event.id,
            patientId: existingRecon.patientId,
          });
          break;
        }

        await runWithClinicContext(clinicId, async () => {
          const { processStripePayment, extractPaymentDataFromPaymentIntent } = await import(
            '@/services/stripe/paymentMatchingService'
          );

          const paymentData = await extractPaymentDataFromPaymentIntent(pi);
          if (!paymentData.metadata?.clinicId) {
            paymentData.metadata = {
              ...paymentData.metadata,
              clinicId: String(clinicId),
            };
          }

          const result = await processStripePayment(paymentData, event.id, event.type);

          if (result.success) {
            logger.info('[EONMeds Webhook] Payment processed successfully', {
              paymentIntentId: pi.id,
              patientId: result.patient?.id,
              invoiceId: result.invoice?.id,
              patientCreated: result.patientCreated,
              matchedBy: result.matchResult?.matchedBy,
            });
          } else {
            logger.error('[EONMeds Webhook] Payment processing failed', {
              paymentIntentId: pi.id,
              error: result.error,
            });
          }
        });

        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        logger.warn('[EONMeds Webhook] Payment failed', {
          paymentIntentId: pi.id,
          amount: pi.amount,
        });
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    logger.error('[EONMeds Webhook] Processing error:', {
      error: error.message,
      eventType: event.type,
      eventId: event.id,
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
