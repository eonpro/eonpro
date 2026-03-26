import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';

const webhookSecret = process.env.EONMEDS_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
const stripeSecret = process.env.EONMEDS_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' as any })
  : null;

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

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        logger.info('[EONMeds Webhook] Payment succeeded', {
          paymentIntentId: pi.id,
          amount: pi.amount,
          medication: pi.metadata?.medication,
          plan: pi.metadata?.plan,
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
    logger.error('[EONMeds Webhook] Processing error:', { error: error.message, eventType: event.type });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
