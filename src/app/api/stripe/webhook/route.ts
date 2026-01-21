import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  // Dynamic imports to avoid build-time errors
  const { getStripe, STRIPE_CONFIG } = await import('@/lib/stripe');
  const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
  const { StripePaymentService } = await import('@/services/stripe/paymentService');
  
  const stripeClient = getStripe();
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');
  
  if (!signature) {
    logger.error('[STRIPE WEBHOOK] Missing signature');
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    );
  }
  
  let event: Stripe.Event;
  
  try {
    // Verify webhook signature
    event = stripeClient.webhooks.constructEvent(
      body,
      signature,
      STRIPE_CONFIG.webhookEndpointSecret
    );
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[STRIPE WEBHOOK] Signature verification failed:', error);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }
  
  logger.debug(`[STRIPE WEBHOOK] Received event: ${event.type}`);
  
  try {
    // Handle different event types
    switch (event.type) {
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.marked_uncollectible':
      case 'invoice.voided':
      case 'invoice.finalized':
      case 'invoice.sent':
        const invoice = event.data.object as Stripe.Invoice;
        await StripeInvoiceService.updateFromWebhook(invoice);
        break;
        
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
      case 'payment_intent.processing':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await StripePaymentService.updatePaymentFromIntent(paymentIntent);
        break;
        
      case 'customer.created':
      case 'customer.updated':
        const customer = event.data.object as Stripe.Customer;
        logger.debug(`[STRIPE WEBHOOK] Customer ${event.type}: ${customer.id}`);
        // Could sync customer data back to patient if needed
        break;
        
      case 'charge.succeeded':
      case 'charge.failed':
        const charge = event.data.object as Stripe.Charge;
        logger.debug(`[STRIPE WEBHOOK] Charge ${event.type}: ${charge.id}`);
        break;
        
      default:
        logger.debug(`[STRIPE WEBHOOK] Unhandled event type: ${event.type}`);
    }
    
    return NextResponse.json({ received: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[STRIPE WEBHOOK] Error processing ${event.type}:`, error instanceof Error ? error : new Error(errorMessage));
    
    // Return 500 to trigger Stripe retry - payment events are critical
    // Stripe will retry with exponential backoff for up to 3 days
    return NextResponse.json(
      { 
        received: false, 
        error: 'Processing failed - will retry',
        eventType: event.type 
      },
      { status: 500 }
    );
  }
}
